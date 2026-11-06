using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MittsModsApi.Data;
using MittsModsApi.DTOs;
using MittsModsApi.Models;
using MittsModsApi.Services;

namespace MittsModsApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class GamesController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IgdbService _igdb;
    private readonly ILogger<GamesController> _logger;

    public GamesController(AppDbContext db, IgdbService igdb, ILogger<GamesController> logger)
    {
        _db = db;
        _igdb = igdb;
        _logger = logger;
    }

    private IQueryable<Game> WithEntries() =>
        _db.Games
            .Include(g => g.UserEntries).ThenInclude(e => e.Platform)
            .Include(g => g.UserEntries).ThenInclude(e => e.History)
            .AsSplitQuery();

    private Task<Game?> Load(int id) => WithEntries().FirstOrDefaultAsync(g => g.Id == id);

    // Hidden games (incl. "deleted" Steam games) are only shown to the admin
    private bool IsAdmin() => AdminToken.IsAdmin(HttpContext);

    // GET /api/games?status=Playing: only games with an entry in that status (the blog's Now Playing)
    [HttpGet]
    public async Task<ActionResult<List<GameDto>>> GetAll([FromQuery] string? status)
    {
        var query = WithEntries();
        if (!IsAdmin()) query = query.Where(g => !g.IsHidden);
        if (status != null)
        {
            if (!Enum.TryParse<PlayStatus>(status, out var s) || !Enum.IsDefined(s)) return BadRequest($"Unknown status {status}.");
            query = query.Where(g => g.UserEntries.Any(e => e.Status == s));
        }
        var games = await query.OrderBy(g => g.Title).ToListAsync();
        return Ok(games.Select(MapToDto).ToList());
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<GameDto>> GetById(int id)
    {
        var game = await Load(id);
        if (game == null || (game.IsHidden && !IsAdmin())) return NotFound();
        return Ok(MapToDto(game));
    }

    [HttpPost]
    public async Task<ActionResult<GameDto>> Create([FromBody] CreateGameDto dto)
    {
        if (dto.SteamAppId != null && await _db.Games.AnyAsync(g => g.SteamAppId == dto.SteamAppId))
            return Conflict("That Steam game is already in the library.");

        var (entry, error) = await BuildEntry(dto.Entry);
        if (entry == null) return BadRequest(error);

        var game = new Game
        {
            Title       = dto.Title.Trim(),
            CoverUrl    = dto.CoverUrl,
            Genre       = dto.Genre,
            ReleaseYear = dto.ReleaseYear,
            Developer   = dto.Developer,
            Summary     = dto.Summary,
            IgdbId      = dto.IgdbId,
            SteamAppId  = dto.SteamAppId,
            UserEntries = new List<UserEntry> { entry }
        };
        game.TimeToBeatHours = await TimeToBeat(game.IgdbId);

        _db.Games.Add(game);
        await _db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetById), new { id = game.Id }, MapToDto((await Load(game.Id))!));
    }

    // PUT /api/games/{id}: fix the game's details (title, cover, IGDB match...)
    [HttpPut("{id}")]
    public async Task<ActionResult<GameDto>> UpdateGame(int id, [FromBody] UpdateGameDto dto)
    {
        var game = await Load(id);
        if (game == null) return NotFound();

        var rematched = dto.IgdbId != game.IgdbId;
        game.Title       = dto.Title.Trim();
        game.CoverUrl    = Blank(dto.CoverUrl);
        game.Genre       = Blank(dto.Genre);
        game.ReleaseYear = dto.ReleaseYear;
        game.Developer   = Blank(dto.Developer);
        game.Summary     = Blank(dto.Summary);
        game.IgdbId      = dto.IgdbId;
        if (rematched) game.TimeToBeatHours = await TimeToBeat(dto.IgdbId);

        await _db.SaveChangesAsync();
        return Ok(MapToDto(game));
    }

    // PATCH /api/games/bulk: one status/platform/hidden change for many games.
    // Status and platform change each game's main (first) entry, the one its card shows;
    // other platforms' entries are left alone.
    [HttpPatch("bulk")]
    public async Task<ActionResult<List<GameDto>>> Bulk([FromBody] BulkUpdateDto dto)
    {
        PlayStatus? status = null;
        if (dto.Status != null)
        {
            if (!Enum.TryParse<PlayStatus>(dto.Status, out var s)) return BadRequest($"Unknown status {dto.Status}.");
            status = s;
        }
        if (dto.PlatformId != null && !await _db.Platforms.AnyAsync(p => p.Id == dto.PlatformId))
            return BadRequest($"Platform {dto.PlatformId} not found.");

        var games = await WithEntries().Where(g => dto.Ids.Contains(g.Id)).ToListAsync();
        foreach (var game in games)
        {
            if (dto.Hidden != null) game.IsHidden = dto.Hidden.Value;
            var entry = game.UserEntries.OrderBy(e => e.Id).FirstOrDefault();
            if (entry == null || (status == null && dto.PlatformId == null)) continue;
            if (status != null) entry.SetStatus(status.Value);
            // Skip if another entry already has that platform, so a game never lists it twice,
            // and skip Steam entries: they stay on PC
            if (dto.PlatformId is int pid && entry.Source != EntrySource.Steam
                && !game.UserEntries.Any(e => e != entry && e.PlatformId == pid))
                entry.PlatformId = pid;
            entry.UpdatedAt = DateTime.UtcNow;
        }
        await _db.SaveChangesAsync();

        // Reload so platform names reflect a platform change
        var ids = games.Select(g => g.Id).ToList();
        var fresh = await WithEntries().Where(g => ids.Contains(g.Id)).ToListAsync();
        return Ok(fresh.Select(MapToDto).ToList());
    }

    // POST /api/games/{id}/entries: log the game on another platform
    [HttpPost("{id}/entries")]
    public async Task<ActionResult<GameDto>> AddEntry(int id, [FromBody] CreateUserEntryDto dto)
    {
        var game = await _db.Games.FindAsync(id);
        if (game == null) return NotFound();
        if (await _db.UserEntries.AnyAsync(e => e.GameId == id && e.PlatformId == dto.PlatformId))
            return Conflict("This game is already logged on that platform.");

        var (entry, error) = await BuildEntry(dto);
        if (entry == null) return BadRequest(error);
        entry.GameId = id;
        _db.UserEntries.Add(entry);
        await _db.SaveChangesAsync();
        return Ok(MapToDto((await Load(id))!));
    }

    [HttpPut("{gameId}/entries/{entryId}")]
    public async Task<ActionResult<GameDto>> UpdateEntry(int gameId, int entryId, [FromBody] UpdateEntryDto dto)
    {
        var entry = await _db.UserEntries
            .FirstOrDefaultAsync(e => e.Id == entryId && e.GameId == gameId);
        if (entry == null) return NotFound();

        if (dto.PlatformId.HasValue && dto.PlatformId != entry.PlatformId)
        {
            // The Steam entry is the game's Steam copy, so it's always PC
            if (entry.Source == EntrySource.Steam) return BadRequest("The Steam entry stays on PC.");
            var platform = await _db.Platforms.FindAsync(dto.PlatformId.Value);
            if (platform == null) return BadRequest($"Platform {dto.PlatformId.Value} not found.");
            if (await _db.UserEntries.AnyAsync(e => e.GameId == gameId && e.Id != entryId && e.PlatformId == dto.PlatformId))
                return Conflict("This game is already logged on that platform.");
            entry.PlatformId = dto.PlatformId.Value;
        }

        if (dto.Hardware != null && Enum.TryParse<HardwareType>(dto.Hardware, out var hw))
            entry.Hardware = hw;

        // PUT replaces the optional fields: null clears them, so clients send the full entry
        entry.HoursPlayed        = dto.HoursPlayed;
        entry.Rating             = dto.Rating;
        entry.Notes              = string.IsNullOrWhiteSpace(dto.Notes) ? null : dto.Notes;
        entry.AchievementsEarned = dto.AchievementsEarned;
        entry.AchievementsTotal  = dto.AchievementsTotal;
        entry.Mode               = Enum.TryParse<PlayMode>(dto.Mode, out var m) ? m : null;
        entry.StartedAt          = dto.StartedAt;
        entry.CompletedAt        = dto.CompletedAt;

        // After the dates, so a status change only fills dates that are still empty
        if (dto.Status != null && Enum.TryParse<PlayStatus>(dto.Status, out var status))
            entry.SetStatus(status);

        entry.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(MapToDto((await Load(gameId))!));
    }

    // DELETE /api/games/{gameId}/entries/{entryId}: remove one platform; a game keeps at least one
    [HttpDelete("{gameId}/entries/{entryId}")]
    public async Task<ActionResult<GameDto>> DeleteEntry(int gameId, int entryId)
    {
        var entries = await _db.UserEntries.Where(e => e.GameId == gameId).ToListAsync();
        var entry = entries.FirstOrDefault(e => e.Id == entryId);
        if (entry == null) return NotFound();
        if (entries.Count == 1) return BadRequest("A game needs at least one platform. Delete the game instead.");
        // Sync updates hours through the Steam entry; without it the game would stop updating
        if (entry.Source == EntrySource.Steam) return BadRequest("The Steam entry can't be removed. Hide the game instead.");
        _db.UserEntries.Remove(entry);
        await _db.SaveChangesAsync();
        return Ok(MapToDto((await Load(gameId))!));
    }

    [HttpPatch("{id}/favourite")]
    public async Task<ActionResult<GameDto>> ToggleFavourite(int id)
    {
        var game = await Load(id);
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
        // A deleted Steam game would come back on the next sync, so it's hidden instead
        if (game.SteamAppId != null) game.IsHidden = true;
        else _db.Games.Remove(game);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    private async Task<(UserEntry? entry, string? error)> BuildEntry(CreateUserEntryDto dto)
    {
        if (!await _db.Platforms.AnyAsync(p => p.Id == dto.PlatformId))
            return (null, $"Platform with ID {dto.PlatformId} does not exist.");

        if (!Enum.TryParse<PlayStatus>(dto.Status, out var status))
            status = PlayStatus.Backlog;
        if (!Enum.TryParse<HardwareType>(dto.Hardware, out var hardware))
            hardware = HardwareType.Original;

        var entry = new UserEntry
        {
            PlatformId         = dto.PlatformId,
            HoursPlayed        = dto.HoursPlayed,
            Rating             = dto.Rating,
            Notes              = string.IsNullOrWhiteSpace(dto.Notes) ? null : dto.Notes,
            AchievementsEarned = dto.AchievementsEarned,
            AchievementsTotal  = dto.AchievementsTotal,
            Mode               = Enum.TryParse<PlayMode>(dto.Mode, out var mode) ? mode : null,
            Hardware           = hardware,
            StartedAt          = dto.StartedAt,
            CompletedAt        = dto.CompletedAt,
            Source             = EntrySource.Manual
        };
        entry.SetStatus(status);
        return (entry, null);
    }

    // Optional extra from IGDB; a failure just leaves it empty
    private async Task<int?> TimeToBeat(int? igdbId)
    {
        if (igdbId == null) return null;
        try { return (await _igdb.GetTimeToBeatAsync([igdbId.Value])).GetValueOrDefault(igdbId.Value) is var h and > 0 ? h : null; }
        catch (Exception ex)
        {
            _logger.LogWarning("IGDB time to beat failed: {Message}", ex.Message);
            return null;
        }
    }

    private static string? Blank(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();

    private static GameDto MapToDto(Game game) => new GameDto
    {
        Id              = game.Id,
        Title           = game.Title,
        CoverUrl        = game.CoverUrl,
        Genre           = game.Genre,
        ReleaseYear     = game.ReleaseYear,
        Developer       = game.Developer,
        Summary         = game.Summary,
        IgdbId          = game.IgdbId,
        SteamAppId      = game.SteamAppId,
        IsFavourite     = game.IsFavourite,
        IsHidden        = game.IsHidden,
        TimeToBeatHours = game.TimeToBeatHours,
        CreatedAt       = game.CreatedAt,
        UserEntries = game.UserEntries.OrderBy(e => e.Id).Select(e => new UserEntryDto
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
            LastPlayedAt       = e.LastPlayedAt,
            StartedAt          = e.StartedAt,
            CompletedAt        = e.CompletedAt,
            CreatedAt          = e.CreatedAt,
            UpdatedAt          = e.UpdatedAt,
            History            = e.History.OrderBy(c => c.ChangedAt)
                .Select(c => new StatusChangeDto(c.Status.ToString(), c.ChangedAt)).ToList()
        }).ToList()
    };
}
