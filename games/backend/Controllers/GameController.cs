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

    public GamesController(AppDbContext db) { _db = db; }

    [HttpGet]
    public async Task<ActionResult<List<GameDto>>> GetAll()
    {
        var games = await _db.Games
            .Include(g => g.UserEntries).ThenInclude(e => e.Platform)
            .OrderBy(g => g.Title)
            .ToListAsync();
        return Ok(games.Select(MapToDto).ToList());
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<GameDto>> GetById(int id)
    {
        var game = await _db.Games
            .Include(g => g.UserEntries).ThenInclude(e => e.Platform)
            .FirstOrDefaultAsync(g => g.Id == id);
        if (game == null) return NotFound();
        return Ok(MapToDto(game));
    }

    [HttpPost]
    public async Task<ActionResult<GameDto>> Create([FromBody] CreateGameDto dto)
    {
        var platform = await _db.Platforms.FindAsync(dto.Entry.PlatformId);
        if (platform == null)
            return BadRequest($"Platform with ID {dto.Entry.PlatformId} does not exist.");

        if (!Enum.TryParse<PlayStatus>(dto.Entry.Status, out var status))
            status = PlayStatus.Backlog;

        Enum.TryParse<PlayMode>(dto.Entry.Mode, out var mode);
        if (!Enum.TryParse<HardwareType>(dto.Entry.Hardware, out var hardware))
            hardware = HardwareType.Original;

        var game = new Game
        {
            Title       = dto.Title,
            CoverUrl    = dto.CoverUrl,
            Genre       = dto.Genre,
            ReleaseYear = dto.ReleaseYear,
            Developer   = dto.Developer,
            Summary     = dto.Summary,
            IgdbId      = dto.IgdbId,
            SteamAppId  = dto.SteamAppId,
            UserEntries = new List<UserEntry>
            {
                new UserEntry
                {
                    PlatformId         = dto.Entry.PlatformId,
                    Status             = status,
                    HoursPlayed        = dto.Entry.HoursPlayed,
                    Rating             = dto.Entry.Rating,
                    Notes              = dto.Entry.Notes,
                    AchievementsEarned = dto.Entry.AchievementsEarned,
                    AchievementsTotal  = dto.Entry.AchievementsTotal,
                    Mode               = dto.Entry.Mode != null ? mode : null,
                    Hardware           = hardware,
                    StartedAt          = dto.Entry.StartedAt,
                    CompletedAt        = dto.Entry.CompletedAt,
                    Source             = EntrySource.Manual
                }
            }
        };

        _db.Games.Add(game);
        await _db.SaveChangesAsync();

        await _db.Entry(game).Collection(g => g.UserEntries)
            .Query().Include(e => e.Platform).LoadAsync();

        return CreatedAtAction(nameof(GetById), new { id = game.Id }, MapToDto(game));
    }

    [HttpPut("{gameId}/entries/{entryId}")]
    public async Task<ActionResult<GameDto>> UpdateEntry(int gameId, int entryId, [FromBody] UpdateEntryDto dto)
    {
        var entry = await _db.UserEntries
            .Include(e => e.Platform)
            .FirstOrDefaultAsync(e => e.Id == entryId && e.GameId == gameId);
        if (entry == null) return NotFound();

        if (dto.PlatformId.HasValue)
        {
            var platform = await _db.Platforms.FindAsync(dto.PlatformId.Value);
            if (platform == null) return BadRequest($"Platform {dto.PlatformId.Value} not found.");
            entry.PlatformId = dto.PlatformId.Value;
        }

        if (dto.Status != null && Enum.TryParse<PlayStatus>(dto.Status, out var status))
            entry.Status = status;
        if (dto.HoursPlayed.HasValue)    entry.HoursPlayed        = dto.HoursPlayed;
        if (dto.Rating.HasValue)         entry.Rating             = dto.Rating;
        if (dto.Notes != null)           entry.Notes              = dto.Notes;
        if (dto.AchievementsEarned.HasValue) entry.AchievementsEarned = dto.AchievementsEarned;
        if (dto.AchievementsTotal.HasValue)  entry.AchievementsTotal  = dto.AchievementsTotal;
        if (dto.Mode != null)
            entry.Mode = Enum.TryParse<PlayMode>(dto.Mode, out var m) ? m : null;
        if (dto.Hardware != null && Enum.TryParse<HardwareType>(dto.Hardware, out var hw))
            entry.Hardware = hw;
        if (dto.StartedAt.HasValue)      entry.StartedAt          = dto.StartedAt;
        if (dto.CompletedAt.HasValue)    entry.CompletedAt        = dto.CompletedAt;

        entry.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        var game = await _db.Games
            .Include(g => g.UserEntries).ThenInclude(e => e.Platform)
            .FirstAsync(g => g.Id == gameId);
        return Ok(MapToDto(game));
    }

    [HttpPatch("{id}/favourite")]
    public async Task<ActionResult<GameDto>> ToggleFavourite(int id)
    {
        var game = await _db.Games
            .Include(g => g.UserEntries).ThenInclude(e => e.Platform)
            .FirstOrDefaultAsync(g => g.Id == id);
        if (game == null) return NotFound();
        game.IsFavourite = !game.IsFavourite;
        await _db.SaveChangesAsync();
        return Ok(MapToDto(game));
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(int id)
    {
        var game = await _db.Games.FindAsync(id);
        if (game == null) return NotFound();
        _db.Games.Remove(game);
        await _db.SaveChangesAsync();
        return NoContent();
    }

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
        IsFavourite = game.IsFavourite,
        CreatedAt   = game.CreatedAt,
        UserEntries = game.UserEntries.Select(e => new UserEntryDto
        {
            Id                 = e.Id,
            PlatformId         = e.PlatformId,
            PlatformName       = e.Platform?.Name ?? string.Empty,
            Status             = e.Status.ToString(),
            HoursPlayed        = e.HoursPlayed,
            Rating             = e.Rating,
            Notes              = e.Notes,
            AchievementsEarned = e.AchievementsEarned,
            AchievementsTotal  = e.AchievementsTotal,
            Mode               = e.Mode?.ToString(),
            Hardware           = e.Hardware.ToString(),
            Source             = e.Source.ToString(),
            StartedAt          = e.StartedAt,
            CompletedAt        = e.CompletedAt,
            CreatedAt          = e.CreatedAt,
            UpdatedAt          = e.UpdatedAt
        }).ToList()
    };
}