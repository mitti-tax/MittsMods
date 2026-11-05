using System.Collections.Concurrent;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MittsModsApi.Data;
using MittsModsApi.DTOs;
using MittsModsApi.Models;
using MittsModsApi.Services;

namespace MittsModsApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class SteamController : ControllerBase
{
    private readonly SteamService _steam;
    private readonly AppDbContext _db;
    private readonly IgdbService _igdb;
    private readonly ILogger<SteamController> _logger;

    public SteamController(SteamService steam, AppDbContext db, IgdbService igdb, ILogger<SteamController> logger)
    {
        _steam = steam;
        _db = db;
        _igdb = igdb;
        _logger = logger;
    }

    // Only one sync at a time: two overlapping syncs both see the same games as "new" and add them twice
    private static readonly SemaphoreSlim SyncLock = new(1, 1);

    // -------------------------------------------------------
    // POST /api/steam/sync
    // Imports your Steam library into the games database
    // - Adds new games not already tracked (hidden ones count as tracked)
    // - Updates hours, last played and achievements for games played since the last sync
    // - Moves a Backlog game to Playing when Steam shows playtime in the last two weeks;
    //   any other status you've set is left alone
    // - Sets cover/metadata and time to beat from the exact IGDB match for each Steam app id
    // -------------------------------------------------------
    [HttpPost("sync")]
    public async Task<ActionResult<SteamSyncResult>> Sync()
    {
        if (!await SyncLock.WaitAsync(0))
            return Conflict("A Steam sync is already running.");
        try { return await RunSync(); }
        finally { SyncLock.Release(); }
    }

    private async Task<ActionResult<SteamSyncResult>> RunSync()
    {
        var library = await _steam.GetLibraryAsync();

        // Get PC platform ID (Steam = PC)
        var pcPlatform = await _db.Platforms.FirstOrDefaultAsync(p => p.Abbreviation == "PC");
        if (pcPlatform == null)
            return StatusCode(500, "PC platform not found in database.");

        var result = new SteamSyncResult();

        // One query for every already-tracked Steam game instead of one per library entry
        var existingByAppId = await _db.Games
            .Include(g => g.UserEntries)
            .Where(g => g.SteamAppId != null)
            .ToDictionaryAsync(g => g.SteamAppId!.Value);

        // IGDB is only asked about what's missing: details for new games, and time to beat for games
        // that don't have one yet. It's optional metadata, so a failure (e.g. rate limit) must not
        // abort the sync.
        var newAppIds = library.Select(g => g.SteamAppId).Where(id => !existingByAppId.ContainsKey(id)).ToList();
        Dictionary<int, IgdbGameResult>? igdb = null;
        Dictionary<int, int>? timeToBeat = null;
        if (newAppIds.Count > 0)
        {
            try { igdb = await _igdb.GetBySteamAppIdsAsync(newAppIds); }
            catch (Exception ex) { _logger.LogWarning("IGDB lookup failed: {Message}", ex.Message); }
        }
        var ttbIds = (igdb?.Values.Select(m => m.Id) ?? [])
            .Concat(existingByAppId.Values.Where(g => g.TimeToBeatHours == null && g.IgdbId != null).Select(g => g.IgdbId!.Value))
            .ToList();
        if (ttbIds.Count > 0)
        {
            try { timeToBeat = await _igdb.GetTimeToBeatAsync(ttbIds); }
            catch (Exception ex) { _logger.LogWarning("IGDB time to beat failed: {Message}", ex.Message); }
        }

        // Achievements only for new games and games played since the last sync (one Steam call each)
        var needAchievements = library.Where(g =>
            !existingByAppId.TryGetValue(g.SteamAppId, out var known)
            || (SteamEntry(known) is { } e && e.HoursPlayed != g.HoursPlayed)).ToList();
        var achievements = new ConcurrentDictionary<int, SteamAchievementResult>();
        await Parallel.ForEachAsync(needAchievements, new ParallelOptions { MaxDegreeOfParallelism = 8 },
            async (g, _) => achievements[g.SteamAppId] = await _steam.GetAchievementsAsync(g.SteamAppId));

        foreach (var steamGame in library)
        {
            var match = igdb?.GetValueOrDefault(steamGame.SteamAppId);
            achievements.TryGetValue(steamGame.SteamAppId, out var achieved);

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
                if (steamGame.PlayedRecently && entry.Status is PlayStatus.Backlog or PlayStatus.Wishlist)
                    entry.SetStatus(PlayStatus.Playing);
                // Only touch UpdatedAt when something changed, so "recent" means recent
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
            newEntry.SetStatus(steamGame.PlayedRecently ? PlayStatus.Playing : PlayStatus.Backlog);

            var game = new Game
            {
                Title       = steamGame.Name,
                SteamAppId  = steamGame.SteamAppId,
                UserEntries = new List<UserEntry> { newEntry }
            };
            ApplyMetadata(game, match, steamGame, timeToBeat);

            _db.Games.Add(game);
            result.Added++;
            result.Games.Add(steamGame.Name);
        }

        await _db.SaveChangesAsync();
        return Ok(result);
    }

    private static UserEntry? SteamEntry(Game g) =>
        g.UserEntries.FirstOrDefault(e => e.Source == EntrySource.Steam);

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
