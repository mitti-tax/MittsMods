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
    // - Adds new games not already tracked
    // - Updates hours played for existing Steam entries
    // - Sets cover/metadata from the exact IGDB match for each Steam app id
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

        // One batched IGDB request for the whole library. IGDB is optional metadata, so a
        // failure (e.g. rate limit) must not abort the sync — or wipe metadata already stored.
        Dictionary<int, IgdbGameResult>? igdb = null;
        try { igdb = await _igdb.GetBySteamAppIdsAsync(library.Select(g => g.SteamAppId)); }
        catch (Exception ex) { _logger.LogWarning("IGDB lookup failed: {Message}", ex.Message); }

        // Achievements for new games, a few at a time (one Steam call per game)
        var newGames = library.Where(g => !existingByAppId.ContainsKey(g.SteamAppId)).ToList();
        var achievements = new ConcurrentDictionary<int, SteamAchievementResult>();
        await Parallel.ForEachAsync(newGames, new ParallelOptions { MaxDegreeOfParallelism = 8 },
            async (g, _) => achievements[g.SteamAppId] = await _steam.GetAchievementsAsync(g.SteamAppId));

        foreach (var steamGame in library)
        {
            var match = igdb?.GetValueOrDefault(steamGame.SteamAppId);

            if (existingByAppId.TryGetValue(steamGame.SteamAppId, out var existing))
            {
                // Re-apply metadata so games imported with a wrong fuzzy match get corrected
                if (igdb != null) ApplyMetadata(existing, match, steamGame);

                // Update hours on the existing Steam entry
                var entry = existing.UserEntries.FirstOrDefault(e => e.Source == EntrySource.Steam);
                if (entry != null)
                {
                    entry.HoursPlayed = steamGame.HoursPlayed;
                    entry.UpdatedAt = DateTime.UtcNow;
                    result.Updated++;
                }
                else
                {
                    result.Skipped++;
                }
                continue;
            }

            var achieved = achievements[steamGame.SteamAppId];
            var game = new Game
            {
                Title       = steamGame.Name,
                SteamAppId  = steamGame.SteamAppId,
                UserEntries = new List<UserEntry>
                {
                    new UserEntry
                    {
                        PlatformId          = pcPlatform.Id,
                        Status              = steamGame.HoursPlayed == 0 ? PlayStatus.Backlog : PlayStatus.Playing,
                        HoursPlayed         = steamGame.HoursPlayed,
                        AchievementsEarned  = achieved.AchievementsEarned,
                        AchievementsTotal   = achieved.AchievementsTotal,
                        Source              = EntrySource.Steam,
                        UpdatedAt           = DateTime.UtcNow
                    }
                }
            };
            ApplyMetadata(game, match, steamGame);

            _db.Games.Add(game);
            result.Added++;
            result.Games.Add(steamGame.Name);
        }

        await _db.SaveChangesAsync();
        return Ok(result);
    }

    // No exact IGDB match means no metadata: better blank than another game's details
    private static void ApplyMetadata(Game game, IgdbGameResult? match, SteamGameResult steamGame)
    {
        game.IgdbId      = match?.Id;
        game.CoverUrl    = match?.CoverUrl ?? steamGame.CoverUrl;
        game.Genre       = match?.Genres.FirstOrDefault();
        game.ReleaseYear = match?.ReleaseYear;
        game.Developer   = match?.Developers.FirstOrDefault();
        game.Summary     = match?.Summary;
    }
}
