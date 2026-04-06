using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MittsModsApi.Data;
using MittsModsApi.DTOs;
using MittsModsApi.Models;

namespace MittsModsApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class GamesController : ControllerBase
{
    private readonly AppDbContext _db;

    public GamesController(AppDbContext db)
    {
        _db = db;
    }

    // -------------------------------------------------------
    // GET /api/games
    // Returns all games with their user entries
    // -------------------------------------------------------
    [HttpGet]
    public async Task<ActionResult<List<GameDto>>> GetAll()
    {
        var games = await _db.Games
            .Include(g => g.UserEntries)
                .ThenInclude(e => e.Platform)
            .OrderBy(g => g.Title)
            .ToListAsync();

        return Ok(games.Select(MapToDto).ToList());
    }

    // -------------------------------------------------------
    // GET /api/games/{id}
    // Returns a single game with full detail
    // -------------------------------------------------------
    [HttpGet("{id}")]
    public async Task<ActionResult<GameDto>> GetById(int id)
    {
        var game = await _db.Games
            .Include(g => g.UserEntries)
                .ThenInclude(e => e.Platform)
            .FirstOrDefaultAsync(g => g.Id == id);

        if (game == null)
            return NotFound();

        return Ok(MapToDto(game));
    }

    // -------------------------------------------------------
    // POST /api/games
    // Adds a new game with an initial user entry
    // -------------------------------------------------------
    [HttpPost]
    public async Task<ActionResult<GameDto>> Create([FromBody] CreateGameDto dto)
    {
        // Validate that the platform exists
        var platform = await _db.Platforms.FindAsync(dto.Entry.PlatformId);
        if (platform == null)
            return BadRequest($"Platform with ID {dto.Entry.PlatformId} does not exist.");

        // Parse status enum — default to Backlog if invalid
        if (!Enum.TryParse<PlayStatus>(dto.Entry.Status, out var status))
            status = PlayStatus.Backlog;

        var game = new Game
        {
            Title      = dto.Title,
            CoverUrl   = dto.CoverUrl,
            Genre      = dto.Genre,
            ReleaseYear= dto.ReleaseYear,
            Developer  = dto.Developer,
            Summary    = dto.Summary,
            IgdbId     = dto.IgdbId,
            SteamAppId = dto.SteamAppId,
            UserEntries = new List<UserEntry>
            {
                new UserEntry
                {
                    PlatformId          = dto.Entry.PlatformId,
                    Status              = status,
                    HoursPlayed         = dto.Entry.HoursPlayed,
                    Rating              = dto.Entry.Rating,
                    Notes               = dto.Entry.Notes,
                    AchievementsEarned  = dto.Entry.AchievementsEarned,
                    AchievementsTotal   = dto.Entry.AchievementsTotal,
                    StartedAt           = dto.Entry.StartedAt,
                    CompletedAt         = dto.Entry.CompletedAt,
                    Source              = EntrySource.Manual
                }
            }
        };

        _db.Games.Add(game);
        await _db.SaveChangesAsync();

        // Reload with platform info before returning
        await _db.Entry(game)
            .Collection(g => g.UserEntries)
            .Query()
            .Include(e => e.Platform)
            .LoadAsync();

        return CreatedAtAction(nameof(GetById), new { id = game.Id }, MapToDto(game));
    }

    // -------------------------------------------------------
    // PUT /api/games/{gameId}/entries/{entryId}
    // Updates a user entry (hours, rating, status, notes etc.)
    // -------------------------------------------------------
    [HttpPut("{gameId}/entries/{entryId}")]
    public async Task<ActionResult<GameDto>> UpdateEntry(int gameId, int entryId, [FromBody] UpdateEntryDto dto)
    {
        var entry = await _db.UserEntries
            .Include(e => e.Platform)
            .FirstOrDefaultAsync(e => e.Id == entryId && e.GameId == gameId);

        if (entry == null)
            return NotFound();

        // Only update fields that were actually provided
        if (dto.PlatformId.HasValue)
        {
            var platform = await _db.Platforms.FindAsync(dto.PlatformId.Value);
            if (platform == null)
                return BadRequest($"Platform with ID {dto.PlatformId.Value} does not exist.");
            entry.PlatformId = dto.PlatformId.Value;
        }

        if (dto.Status != null && Enum.TryParse<PlayStatus>(dto.Status, out var status))
            entry.Status = status;

        if (dto.HoursPlayed.HasValue)
            entry.HoursPlayed = dto.HoursPlayed;

        if (dto.Rating.HasValue)
            entry.Rating = dto.Rating;

        if (dto.Notes != null)
            entry.Notes = dto.Notes;

        if (dto.AchievementsEarned.HasValue)
            entry.AchievementsEarned = dto.AchievementsEarned;

        if (dto.AchievementsTotal.HasValue)
            entry.AchievementsTotal = dto.AchievementsTotal;

        if (dto.StartedAt.HasValue)
            entry.StartedAt = dto.StartedAt;

        if (dto.CompletedAt.HasValue)
            entry.CompletedAt = dto.CompletedAt;

        entry.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        // Return the full updated game
        var game = await _db.Games
            .Include(g => g.UserEntries)
                .ThenInclude(e => e.Platform)
            .FirstAsync(g => g.Id == gameId);

        return Ok(MapToDto(game));
    }

    // -------------------------------------------------------
    // DELETE /api/games/{id}
    // Removes a game and all its entries (cascade)
    // -------------------------------------------------------
    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(int id)
    {
        var game = await _db.Games.FindAsync(id);

        if (game == null)
            return NotFound();

        _db.Games.Remove(game);
        await _db.SaveChangesAsync();

        return NoContent();
    }

    // -------------------------------------------------------
    // Private helper — maps a Game entity to GameDto
    // Keeps mapping logic in one place
    // -------------------------------------------------------
    private static GameDto MapToDto(Game game) => new GameDto
    {
        Id          = game.Id,
        Title       = game.Title,
        CoverUrl    = game.CoverUrl,
        Genre       = game.Genre,
        ReleaseYear = game.ReleaseYear,
        Developer   = game.Developer,
        Summary     = game.Summary,
        IgdbId      = game.IgdbId,
        SteamAppId  = game.SteamAppId,
        CreatedAt   = game.CreatedAt,
        UserEntries = game.UserEntries.Select(e => new UserEntryDto
        {
            Id                  = e.Id,
            PlatformId          = e.PlatformId,
            PlatformName        = e.Platform?.Name ?? string.Empty,
            Status              = e.Status.ToString(),
            HoursPlayed         = e.HoursPlayed,
            Rating              = e.Rating,
            Notes               = e.Notes,
            AchievementsEarned  = e.AchievementsEarned,
            AchievementsTotal   = e.AchievementsTotal,
            Source              = e.Source.ToString(),
            StartedAt           = e.StartedAt,
            CompletedAt         = e.CompletedAt,
            CreatedAt           = e.CreatedAt,
            UpdatedAt           = e.UpdatedAt
        }).ToList()
    };
}