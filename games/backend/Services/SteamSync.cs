using System.Collections.Concurrent;
using Microsoft.EntityFrameworkCore;
using MittsModsApi.Data;
using MittsModsApi.DTOs;
using MittsModsApi.Models;

namespace MittsModsApi.Services;

// Imports the Steam library into the games database. Run by POST /api/steam/sync and by SteamSyncJob.
// - Adds new games not already tracked (hidden ones count as tracked)
// - Updates hours, last played and achievements for games played since the last sync
// - A Backlog/Wishlist game played in the last two weeks moves to Playing; a Playing game
//   not played for two weeks moves back to Backlog. Any other status you've set is left alone
// - Sets cover/metadata and time to beat from the exact IGDB match for each Steam app id
public class SteamSync(SteamService steam, AppDbContext db, IgdbService igdb, ILogger<SteamSync> logger)
{
    public static readonly TimeSpan StaleAfter = TimeSpan.FromDays(14);

    // When the last sync finished, shown as "last updated" in the app.
    // ponytail: in memory, so it's empty after a restart until the startup sync finishes (seconds)
    public static DateTime? LastSyncedAt { get; private set; }

    // Only one sync at a time: two overlapping syncs both see the same games as "new" and add them twice
    private static readonly SemaphoreSlim Lock = new(1, 1);

    // null = a sync is already running
    public async Task<SteamSyncResult?> RunAsync()
    {
        if (!await Lock.WaitAsync(0)) return null;
        try { return await Run(); }
        finally { Lock.Release(); }
    }

    private async Task<SteamSyncResult> Run()
    {
        var library = await steam.GetLibraryAsync();

        // Steam = PC
        var pcPlatform = await db.Platforms.FirstOrDefaultAsync(p => p.Abbreviation == "PC")
            ?? throw new InvalidOperationException("PC platform not found in database.");

        var result = new SteamSyncResult();
        var cutoff = DateTime.UtcNow - StaleAfter;

        // One query for every already-tracked Steam game instead of one per library entry
        var existingByAppId = await db.Games
            .Include(g => g.UserEntries).ThenInclude(e => e.History)
            .Where(g => g.SteamAppId != null)
            .AsSplitQuery()
            .ToDictionaryAsync(g => g.SteamAppId!.Value);

        // IGDB is only asked about what's missing: details for new games, and time to beat for games
        // that don't have one yet. It's optional metadata, so a failure (e.g. rate limit) must not
        // abort the sync.
        var newAppIds = library.Select(g => g.SteamAppId).Where(id => !existingByAppId.ContainsKey(id)).ToList();
        Dictionary<int, IgdbGameResult>? matches = null;
        Dictionary<int, int>? timeToBeat = null;
        if (newAppIds.Count > 0)
        {
            try { matches = await igdb.GetBySteamAppIdsAsync(newAppIds); }
            catch (Exception ex) { logger.LogWarning("IGDB lookup failed: {Message}", ex.Message); }
        }
        var ttbIds = (matches?.Values.Select(m => m.Id) ?? [])
            .Concat(existingByAppId.Values.Where(g => g.TimeToBeatHours == null && g.IgdbId != null).Select(g => g.IgdbId!.Value))
            .ToList();
        if (ttbIds.Count > 0)
        {
            try { timeToBeat = await igdb.GetTimeToBeatAsync(ttbIds); }
            catch (Exception ex) { logger.LogWarning("IGDB time to beat failed: {Message}", ex.Message); }
        }

        // Achievements only for new games and games played since the last sync (one Steam call each)
        var needAchievements = library.Where(g =>
            !existingByAppId.TryGetValue(g.SteamAppId, out var known)
            || (SteamEntry(known) is { } e && e.HoursPlayed != g.HoursPlayed)).ToList();
        var achievements = new ConcurrentDictionary<int, SteamAchievementResult>();
        await Parallel.ForEachAsync(needAchievements, new ParallelOptions { MaxDegreeOfParallelism = 8 },
            async (g, _) => achievements[g.SteamAppId] = await steam.GetAchievementsAsync(g.SteamAppId));

        foreach (var steamGame in library)
        {
            var match = matches?.GetValueOrDefault(steamGame.SteamAppId);
            achievements.TryGetValue(steamGame.SteamAppId, out var achieved);
            // Steam's two-week playtime, or a launch too short to count towards it
            var playedLately = steamGame.PlayedRecently || steamGame.LastPlayedAt > cutoff;

            if (existingByAppId.TryGetValue(steamGame.SteamAppId, out var existing))
            {
                // Details already stored (from the first import or Edit Details) are never overwritten;
                // the only gap filled is a missing time to beat for the game's own IGDB id
                if (existing.TimeToBeatHours == null && existing.IgdbId is int igdbId
                    && timeToBeat?.TryGetValue(igdbId, out var hours) == true)
                    existing.TimeToBeatHours = hours;

                var entry = SteamEntry(existing);
                if (entry == null)
                {
                    result.Skipped++;
                    continue;
                }
                entry.LastPlayedAt = steamGame.LastPlayedAt;
                if (playedLately && entry.Status is PlayStatus.Backlog or PlayStatus.Wishlist)
                {
                    entry.SetStatus(PlayStatus.Playing);
                    result.MovedToPlaying++;
                }
                else if (!playedLately && entry.Status == PlayStatus.Playing && !SetToPlayingSince(entry, cutoff))
                {
                    entry.SetStatus(PlayStatus.Backlog);
                    result.MovedToBacklog++;
                }
                // Only touch UpdatedAt when the hours changed, so "recent" means recent
                if (entry.HoursPlayed != steamGame.HoursPlayed)
                {
                    entry.HoursPlayed = steamGame.HoursPlayed;
                    if (achieved?.AchievementsTotal != null)
                    {
                        entry.AchievementsEarned = achieved.AchievementsEarned;
                        entry.AchievementsTotal  = achieved.AchievementsTotal;
                    }
                    entry.UpdatedAt = DateTime.UtcNow;
                    result.Updated++;
                }
                continue;
            }

            var newEntry = new UserEntry
            {
                PlatformId          = pcPlatform.Id,
                HoursPlayed         = steamGame.HoursPlayed,
                LastPlayedAt        = steamGame.LastPlayedAt,
                AchievementsEarned  = achieved?.AchievementsEarned,
                AchievementsTotal   = achieved?.AchievementsTotal,
                Source              = EntrySource.Steam,
            };
            // Owned but not played lately is backlog; only recent playtime counts as Playing
            newEntry.SetStatus(playedLately ? PlayStatus.Playing : PlayStatus.Backlog);

            var game = new Game
            {
                Title       = steamGame.Name,
                SteamAppId  = steamGame.SteamAppId,
                UserEntries = new List<UserEntry> { newEntry }
            };
            ApplyMetadata(game, match, steamGame, timeToBeat);

            db.Games.Add(game);
            result.Added++;
            result.Games.Add(steamGame.Name);
        }

        await db.SaveChangesAsync();
        LastSyncedAt = DateTime.UtcNow;
        return result;
    }

    private static UserEntry? SteamEntry(Game g) =>
        g.UserEntries.FirstOrDefault(e => e.Source == EntrySource.Steam);

    // Set to Playing (by hand or by a sync) after the cutoff: give it two weeks before moving it back
    private static bool SetToPlayingSince(UserEntry e, DateTime cutoff) =>
        e.History.Any(h => h.Status == PlayStatus.Playing && h.ChangedAt > cutoff);

    // No exact IGDB match means no metadata: better blank than another game's details
    private static void ApplyMetadata(Game game, IgdbGameResult? match, SteamGameResult steamGame,
        Dictionary<int, int>? timeToBeat)
    {
        // null = the lookup failed, so keep what's stored
        if (timeToBeat != null)
            game.TimeToBeatHours = match != null && timeToBeat.TryGetValue(match.Id, out var h) ? h : null;
        game.IgdbId      = match?.Id;
        game.CoverUrl    = match?.CoverUrl ?? steamGame.CoverUrl;
        game.Genre       = match?.Genres.FirstOrDefault();
        game.ReleaseYear = match?.ReleaseYear;
        game.Developer   = match?.Developers.FirstOrDefault();
        game.Summary     = match?.Summary;
    }
}

// Syncs on startup and every 6 hours, so games move between Backlog and Playing without anyone pressing Sync
public class SteamSyncJob(IServiceScopeFactory scopes, IConfiguration config, ILogger<SteamSyncJob> logger) : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromHours(6);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (string.IsNullOrEmpty(config["Steam:ApiKey"])) return; // local runs without Steam keys
        using var timer = new PeriodicTimer(Interval);
        do
        {
            try
            {
                using var scope = scopes.CreateScope();
                var r = await scope.ServiceProvider.GetRequiredService<SteamSync>().RunAsync();
                if (r != null)
                    logger.LogInformation("Scheduled Steam sync: {Added} added, {Updated} updated, {ToPlaying} to Playing, {ToBacklog} to Backlog",
                        r.Added, r.Updated, r.MovedToPlaying, r.MovedToBacklog);
            }
            catch (Exception ex)
            {
                logger.LogWarning("Scheduled Steam sync failed: {Message}", ex.Message);
            }
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }
}
