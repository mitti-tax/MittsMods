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

    public SteamController(SteamService steam, AppDbContext db, IgdbService igdb)
    {
        _steam = steam;
        _db = db;
        _igdb = igdb;
    }

    // -------------------------------------------------------
    // GET /api/steam/library
    // Preview your Steam library without importing anything
    // -------------------------------------------------------
    [HttpGet("library")]
    public async Task<ActionResult<List<SteamGameResult>>> GetLibrary()
    {
        var library = await _steam.GetLibraryAsync();
        return Ok(library);
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

        foreach (var steamGame in library)
        {
            // Check if we already have this Steam game
            var existing = await _db.Games
                .Include(g => g.UserEntries)
                .FirstOrDefaultAsync(g => g.SteamAppId == steamGame.SteamAppId);

            if (existing != null)
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
            await Task.WhenAll(achievementsTask, igdbTask);

            var achievements = achievementsTask.Result;
            var igdbMatch = igdbTask.Result.FirstOrDefault();

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