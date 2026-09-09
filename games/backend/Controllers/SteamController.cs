using System.Collections.Concurrent;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using MittsModsApi.Data;
using MittsModsApi.DTOs;
using MittsModsApi.Models;
using MittsModsApi.Security;
using MittsModsApi.Services;

namespace MittsModsApi.Controllers;

[ApiController]
[Route("api/[controller]")]
[AdminOnly]
[EnableRateLimiting(RateLimitPolicies.External)]
public class SteamController : ControllerBase
{
    /// <summary>
    /// New games cost an IGDB lookup and an achievements lookup each, and IGDB
    /// is limited to four requests a second. Capping the batch keeps a first
    /// sync of a large library inside a sane request duration; the response
    /// says how many are left so the caller can run it again.
    /// </summary>
    private const int MaxNewGamesPerSync = 100;

    /// <summary>One sync at a time — two in parallel would insert duplicates.</summary>
    private static readonly SemaphoreSlim SyncGate = new(1, 1);

    private readonly SteamService _steam;
    private readonly AppDbContext _db;
    private readonly IgdbService _igdb;
    private readonly ILogger<SteamController> _logger;

    public SteamController(
        SteamService steam,
        AppDbContext db,
        IgdbService igdb,
        ILogger<SteamController> logger)
    {
        _steam = steam;
        _db = db;
        _igdb = igdb;
        _logger = logger;
    }

    /// <summary>GET /api/steam/library — preview without importing anything.</summary>
    [HttpGet("library")]
    public async Task<ActionResult<List<SteamGameResult>>> GetLibrary(CancellationToken cancellationToken)
    {
        return Ok(await _steam.GetLibraryAsync(cancellationToken));
    }

    /// <summary>
    /// POST /api/steam/sync — imports the Steam library.
    /// Adds games that are not tracked yet, refreshes hours and achievements
    /// on the ones that are.
    /// </summary>
    [HttpPost("sync")]
    public async Task<ActionResult<SteamSyncResult>> Sync(CancellationToken cancellationToken)
    {
        if (!await SyncGate.WaitAsync(0, cancellationToken))
        {
            return Problem(
                statusCode: StatusCodes.Status409Conflict,
                title: "Sync already running",
                detail: "A Steam sync is already in progress. Wait for it to finish.");
        }

        try
        {
            return Ok(await RunSyncAsync(cancellationToken));
        }
        finally
        {
            SyncGate.Release();
        }
    }

    private async Task<SteamSyncResult> RunSyncAsync(CancellationToken cancellationToken)
    {
        var library = await _steam.GetLibraryAsync(cancellationToken);

        var pcPlatform = await _db.Platforms
            .FirstOrDefaultAsync(p => p.Abbreviation == "PC", cancellationToken);

        if (pcPlatform == null)
            throw new InvalidOperationException("The PC platform is missing from the database.");

        var result = new SteamSyncResult();

        // One query for everything already tracked, instead of one per game.
        var appIds = library.Select(g => g.SteamAppId).ToList();
        var tracked = await _db.Games
            .Include(g => g.UserEntries)
            .Where(g => g.SteamAppId != null && appIds.Contains(g.SteamAppId.Value))
            .ToListAsync(cancellationToken);

        var trackedByAppId = tracked
            .GroupBy(g => g.SteamAppId!.Value)
            .ToDictionary(g => g.Key, g => g.First());

        var newGames = new List<SteamGameResult>();
        var achievementRefresh = new List<(UserEntry Entry, int AppId)>();

        foreach (var steamGame in library)
        {
            if (!trackedByAppId.TryGetValue(steamGame.SteamAppId, out var existing))
            {
                newGames.Add(steamGame);
                continue;
            }

            var entry = existing.UserEntries.FirstOrDefault(e => e.Source == EntrySource.Steam)
                        ?? existing.UserEntries.FirstOrDefault(e => e.PlatformId == pcPlatform.Id);

            if (entry == null)
            {
                result.Skipped++;
                continue;
            }

            var hoursChanged = entry.HoursPlayed != steamGame.HoursPlayed;
            var achievementsMissing = entry.AchievementsTotal == null;

            if (hoursChanged)
            {
                entry.HoursPlayed = steamGame.HoursPlayed;
                entry.UpdatedAt = DateTime.UtcNow;
                result.Updated++;
            }
            else
            {
                result.Unchanged++;
            }

            // Only re-check achievements where something plausibly moved.
            if (hoursChanged || achievementsMissing)
                achievementRefresh.Add((entry, steamGame.SteamAppId));
        }

        result.Remaining = Math.Max(newGames.Count - MaxNewGamesPerSync, 0);
        var batch = newGames.Take(MaxNewGamesPerSync).ToList();

        // Fetch everything external first, off the DbContext, then write once.
        var metadata = await FetchMetadataAsync(batch, cancellationToken);
        var refreshed = await FetchAchievementsAsync(
            achievementRefresh.Select(item => item.AppId).ToList(), cancellationToken);

        foreach (var (entry, appId) in achievementRefresh)
        {
            if (!refreshed.TryGetValue(appId, out var achievements) || achievements.AchievementsTotal == null)
                continue;

            if (entry.AchievementsEarned == achievements.AchievementsEarned &&
                entry.AchievementsTotal == achievements.AchievementsTotal)
            {
                continue;
            }

            entry.AchievementsEarned = achievements.AchievementsEarned;
            entry.AchievementsTotal = achievements.AchievementsTotal;
            entry.UpdatedAt = DateTime.UtcNow;
        }

        foreach (var steamGame in batch)
        {
            metadata.TryGetValue(steamGame.SteamAppId, out var fetched);
            var igdbMatch = fetched.Igdb;
            var achievements = fetched.Achievements;

            _db.Games.Add(new Game
            {
                Title = steamGame.Name,
                CoverUrl = igdbMatch?.CoverUrl ?? steamGame.CoverUrl,
                Genre = igdbMatch?.Genres.FirstOrDefault(),
                ReleaseYear = igdbMatch?.ReleaseYear,
                Developer = igdbMatch?.Developers.FirstOrDefault(),
                Summary = igdbMatch?.Summary,
                IgdbId = igdbMatch?.Id,
                SteamAppId = steamGame.SteamAppId,
                UserEntries = new List<UserEntry>
                {
                    new()
                    {
                        PlatformId = pcPlatform.Id,
                        Status = steamGame.HoursPlayed == 0 ? PlayStatus.Backlog : PlayStatus.Playing,
                        HoursPlayed = steamGame.HoursPlayed,
                        AchievementsEarned = achievements?.AchievementsEarned,
                        AchievementsTotal = achievements?.AchievementsTotal,
                        Source = EntrySource.Steam,
                        UpdatedAt = DateTime.UtcNow
                    }
                }
            });

            result.Added++;
            result.Games.Add(steamGame.Name);
        }

        await _db.SaveChangesAsync(cancellationToken);

        _logger.LogInformation(
            "Steam sync finished: {Added} added, {Updated} updated, {Skipped} skipped, {Remaining} remaining",
            result.Added, result.Updated, result.Skipped, result.Remaining);

        return result;
    }

    private async Task<Dictionary<int, (SteamAchievementResult? Achievements, IgdbGameResult? Igdb)>>
        FetchMetadataAsync(IReadOnlyList<SteamGameResult> games, CancellationToken cancellationToken)
    {
        var fetched = new ConcurrentDictionary<int, (SteamAchievementResult? Achievements, IgdbGameResult? Igdb)>();
        if (games.Count == 0)
            return new Dictionary<int, (SteamAchievementResult? Achievements, IgdbGameResult? Igdb)>();

        await Parallel.ForEachAsync(
            games,
            new ParallelOptions { MaxDegreeOfParallelism = 4, CancellationToken = cancellationToken },
            async (game, token) =>
            {
                var achievements = await _steam.GetAchievementsAsync(game.SteamAppId, token);

                IgdbGameResult? igdb = null;
                try
                {
                    // IgdbService paces its own calls; a lookup failing should
                    // not lose the game, it just means less metadata.
                    igdb = (await _igdb.SearchAsync(game.Name, token)).FirstOrDefault();
                }
                catch (UpstreamServiceException ex)
                {
                    _logger.LogWarning("IGDB lookup failed for {Title}: {Message}", game.Name, ex.Message);
                }

                fetched[game.SteamAppId] = (achievements, igdb);
            });

        return new Dictionary<int, (SteamAchievementResult? Achievements, IgdbGameResult? Igdb)>(fetched);
    }

    private async Task<Dictionary<int, SteamAchievementResult>> FetchAchievementsAsync(
        IReadOnlyList<int> appIds,
        CancellationToken cancellationToken)
    {
        var fetched = new ConcurrentDictionary<int, SteamAchievementResult>();
        if (appIds.Count == 0)
            return new Dictionary<int, SteamAchievementResult>();

        await Parallel.ForEachAsync(
            appIds,
            new ParallelOptions { MaxDegreeOfParallelism = 6, CancellationToken = cancellationToken },
            async (appId, token) =>
            {
                fetched[appId] = await _steam.GetAchievementsAsync(appId, token);
            });

        return new Dictionary<int, SteamAchievementResult>(fetched);
    }
}
