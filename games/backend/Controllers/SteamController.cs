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

    // -------------------------------------------------------
    // POST /api/steam/sync
    // Imports your Steam library into the games database
    // - Adds new games not already tracked
    // - Updates hours played for existing Steam entries
    // - Skips games already in the DB with matching SteamAppId
    // -------------------------------------------------------
    [HttpPost("sync")]
    public async Task<ActionResult<SteamSyncResult>> Sync()
    {
        var library = await _steam.GetLibraryAsync();

        // Get PC platform ID (Steam = PC)
        var pcPlatform = await _db.Platforms.FirstOrDefaultAsync(p => p.Abbreviation == "PC");
        if (pcPlatform == null)
            return StatusCode(500, "PC platform not found in database.");

        var result = new SteamSyncResult();

        // One query for every already-tracked Steam game instead of one per library entry
        var existingByAppId = (await _db.Games
                .Include(g => g.UserEntries)
                .Where(g => g.SteamAppId != null)
                .ToListAsync())
            .DistinctBy(g => g.SteamAppId)
            .ToDictionary(g => g.SteamAppId!.Value);

        foreach (var steamGame in library)
        {
            if (existingByAppId.TryGetValue(steamGame.SteamAppId, out var existing))
            {
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

            // Fetch achievements and IGDB metadata in parallel
            var achievementsTask = _steam.GetAchievementsAsync(steamGame.SteamAppId);
            var igdbTask = _igdb.SearchAsync(steamGame.Name);
            var achievements = await achievementsTask;

            // IGDB is optional metadata — a failure (e.g. rate limit) must not abort the whole sync
            IgdbGameResult? igdbMatch = null;
            try { igdbMatch = (await igdbTask).FirstOrDefault(); }
            catch (Exception ex)
            {
                _logger.LogWarning("IGDB lookup failed for {Name}: {Message}", steamGame.Name, ex.Message);
            }

            // Determine status based on hours played
            var status = steamGame.HoursPlayed == 0
                ? PlayStatus.Backlog
                : PlayStatus.Playing;

            var game = new Game
            {
                Title       = steamGame.Name,
                CoverUrl    = igdbMatch?.CoverUrl ?? steamGame.CoverUrl,
                Genre       = igdbMatch?.Genres.FirstOrDefault(),
                ReleaseYear = igdbMatch?.ReleaseYear,
                Developer   = igdbMatch?.Developers.FirstOrDefault(),
                Summary     = igdbMatch?.Summary,
                IgdbId      = igdbMatch?.Id,
                SteamAppId  = steamGame.SteamAppId,
                UserEntries = new List<UserEntry>
                {
                    new UserEntry
                    {
                        PlatformId          = pcPlatform.Id,
                        Status              = status,
                        HoursPlayed         = steamGame.HoursPlayed,
                        AchievementsEarned  = achievements.AchievementsEarned,
                        AchievementsTotal   = achievements.AchievementsTotal,
                        Source              = EntrySource.Steam,
                        UpdatedAt           = DateTime.UtcNow
                    }
                }
            };

            _db.Games.Add(game);
            result.Added++;
            result.Games.Add(steamGame.Name);
        }

        await _db.SaveChangesAsync();
        return Ok(result);
    }
}