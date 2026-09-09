using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MittsModsApi.Data;
using MittsModsApi.DTOs;
using MittsModsApi.Models;
using MittsModsApi.Security;

namespace MittsModsApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class GamesController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly ILogger<GamesController> _logger;

    public GamesController(AppDbContext db, ILogger<GamesController> logger)
    {
        _db = db;
        _logger = logger;
    }

    // -------------------------------------------------------
    // GET /api/games
    // Filtering, sorting and paging all happen in the database.
    // The previous version loaded every game with every entry and
    // every platform on each page load and filtered in the browser.
    // -------------------------------------------------------
    [HttpGet]
    public async Task<ActionResult<PagedResult<GameListItemDto>>> GetAll(
        [FromQuery] GameQuery query,
        CancellationToken cancellationToken)
    {
        var games = _db.Games.AsNoTracking();

        if (!string.IsNullOrWhiteSpace(query.Q))
        {
            var pattern = $"%{EscapeLikePattern(query.Q.Trim())}%";
            games = games.Where(g =>
                EF.Functions.ILike(g.Title, pattern) ||
                (g.Developer != null && EF.Functions.ILike(g.Developer, pattern)));
        }

        if (!string.IsNullOrWhiteSpace(query.Status))
        {
            var status = Enum.Parse<PlayStatus>(query.Status, ignoreCase: true);
            games = games.Where(g => g.UserEntries.Any(e => e.Status == status));
        }

        if (query.PlatformId is int platformId)
            games = games.Where(g => g.UserEntries.Any(e => e.PlatformId == platformId));

        if (query.Favourite == true)
            games = games.Where(g => g.IsFavourite);

        if (query.MinHours is decimal minHours)
            games = games.Where(g => g.UserEntries.Any(e => e.HoursPlayed >= minHours));

        var totalCount = await games.CountAsync(cancellationToken);

        var pageSize = Math.Clamp(query.PageSize, 1, GameQuery.MaxPageSize);
        var page = Math.Max(query.Page, 1);

        var items = await ProjectToListItem(ApplySort(games, query.Sort))
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        return Ok(new PagedResult<GameListItemDto>
        {
            Items = items,
            Page = page,
            PageSize = pageSize,
            TotalCount = totalCount
        });
    }

    // -------------------------------------------------------
    // GET /api/games/stats
    // Aggregated by the database rather than by downloading the
    // whole library and reducing it in the browser.
    // -------------------------------------------------------
    [HttpGet("stats")]
    public async Task<ActionResult<LibraryStatsDto>> GetStats(CancellationToken cancellationToken)
    {
        // A game counts once per status it holds, matching what the old
        // client-side reduce produced — but as indexed EXISTS counts rather
        // than by downloading the library.
        var gamesByStatus = new Dictionary<string, int>();
        foreach (var status in Enum.GetValues<PlayStatus>())
        {
            gamesByStatus[status.ToString()] = await _db.Games
                .CountAsync(g => g.UserEntries.Any(e => e.Status == status), cancellationToken);
        }

        var platformTotals = await _db.UserEntries
            .AsNoTracking()
            .GroupBy(e => e.PlatformId)
            .Select(g => new
            {
                PlatformId = g.Key,
                // One entry per platform per game, so entries are games here.
                Games = g.Count(),
                Hours = g.Sum(e => e.HoursPlayed ?? 0m)
            })
            .OrderByDescending(p => p.Games)
            .Take(5)
            .ToListAsync(cancellationToken);

        var platformIds = platformTotals.Select(p => p.PlatformId).ToList();
        var platformNames = await _db.Platforms
            .AsNoTracking()
            .Where(p => platformIds.Contains(p.Id))
            .ToDictionaryAsync(p => p.Id, p => p.Name, cancellationToken);

        var averageRating = await _db.UserEntries
            .AsNoTracking()
            .Where(e => e.Rating != null)
            .AverageAsync(e => (double?)e.Rating, cancellationToken);

        return Ok(new LibraryStatsDto
        {
            TotalGames = await _db.Games.CountAsync(cancellationToken),
            TotalEntries = await _db.UserEntries.CountAsync(cancellationToken),
            TotalHours = Math.Round(
                await _db.UserEntries.SumAsync(e => e.HoursPlayed ?? 0m, cancellationToken), 1),
            Favourites = await _db.Games.CountAsync(g => g.IsFavourite, cancellationToken),
            AverageRating = averageRating.HasValue ? Math.Round(averageRating.Value, 1) : null,
            AchievementsEarned = await _db.UserEntries
                .SumAsync(e => e.AchievementsEarned ?? 0, cancellationToken),
            AchievementsTotal = await _db.UserEntries
                .SumAsync(e => e.AchievementsTotal ?? 0, cancellationToken),
            GamesByStatus = gamesByStatus,
            TopPlatforms = platformTotals
                .Select(p => new PlatformStatDto
                {
                    PlatformId = p.PlatformId,
                    PlatformName = platformNames.GetValueOrDefault(p.PlatformId, "Unknown"),
                    Games = p.Games,
                    Hours = Math.Round(p.Hours, 1)
                })
                .ToList()
        });
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<GameDto>> GetById(int id, CancellationToken cancellationToken)
    {
        var game = await ProjectToDetail(_db.Games.AsNoTracking().Where(g => g.Id == id))
            .FirstOrDefaultAsync(cancellationToken);

        return game == null ? GameNotFound(id) : Ok(game);
    }

    [HttpPost]
    [AdminOnly]
    public async Task<ActionResult<GameDto>> Create(
        [FromBody] CreateGameDto dto,
        CancellationToken cancellationToken)
    {
        var platformExists = await _db.Platforms
            .AnyAsync(p => p.Id == dto.Entry.PlatformId, cancellationToken);

        if (!platformExists)
            return Problem(
                statusCode: StatusCodes.Status400BadRequest,
                title: "Unknown platform",
                detail: $"Platform with ID {dto.Entry.PlatformId} does not exist.");

        // Adding the same game twice is nearly always a mistake — point the
        // caller at the existing record so it can add an entry to it instead.
        var duplicate = await FindDuplicateAsync(dto.IgdbId, dto.SteamAppId, cancellationToken);
        if (duplicate != null)
        {
            return Conflict(new
            {
                title = "Already in the library",
                detail = $"\"{duplicate.Title}\" is already tracked.",
                gameId = duplicate.Id
            });
        }

        var game = new Game
        {
            Title = dto.Title.Trim(),
            CoverUrl = Normalise(dto.CoverUrl),
            Genre = Normalise(dto.Genre),
            ReleaseYear = dto.ReleaseYear,
            Developer = Normalise(dto.Developer),
            Summary = Normalise(dto.Summary),
            IgdbId = dto.IgdbId,
            SteamAppId = dto.SteamAppId,
            UserEntries = new List<UserEntry> { BuildEntry(dto.Entry) }
        };

        _db.Games.Add(game);
        await _db.SaveChangesAsync(cancellationToken);

        _logger.LogInformation("Added game {GameId} ({Title})", game.Id, game.Title);

        var created = await ProjectToDetail(_db.Games.AsNoTracking().Where(g => g.Id == game.Id))
            .FirstAsync(cancellationToken);

        return CreatedAtAction(nameof(GetById), new { id = game.Id }, created);
    }

    // -------------------------------------------------------
    // POST /api/games/{gameId}/entries
    // Log the same game on a second platform.
    // -------------------------------------------------------
    [HttpPost("{gameId:int}/entries")]
    [AdminOnly]
    public async Task<ActionResult<GameDto>> AddEntry(
        int gameId,
        [FromBody] CreateUserEntryDto dto,
        CancellationToken cancellationToken)
    {
        var game = await _db.Games
            .Include(g => g.UserEntries)
            .FirstOrDefaultAsync(g => g.Id == gameId, cancellationToken);

        if (game == null)
            return GameNotFound(gameId);

        var platformExists = await _db.Platforms
            .AnyAsync(p => p.Id == dto.PlatformId, cancellationToken);

        if (!platformExists)
            return Problem(
                statusCode: StatusCodes.Status400BadRequest,
                title: "Unknown platform",
                detail: $"Platform with ID {dto.PlatformId} does not exist.");

        if (game.UserEntries.Any(e => e.PlatformId == dto.PlatformId))
            return Conflict(new
            {
                title = "Already logged on that platform",
                detail = $"\"{game.Title}\" already has an entry for this platform."
            });

        game.UserEntries.Add(BuildEntry(dto));
        await _db.SaveChangesAsync(cancellationToken);

        return Ok(await LoadDetailAsync(gameId, cancellationToken));
    }

    // -------------------------------------------------------
    // PUT /api/games/{gameId}/entries/{entryId}
    // Replaces the caller-owned fields of an entry.
    // -------------------------------------------------------
    [HttpPut("{gameId:int}/entries/{entryId:int}")]
    [AdminOnly]
    public async Task<ActionResult<GameDto>> UpdateEntry(
        int gameId,
        int entryId,
        [FromBody] UpdateEntryDto dto,
        CancellationToken cancellationToken)
    {
        var entry = await _db.UserEntries
            .FirstOrDefaultAsync(e => e.Id == entryId && e.GameId == gameId, cancellationToken);

        if (entry == null)
            return Problem(
                statusCode: StatusCodes.Status404NotFound,
                title: "Entry not found",
                detail: $"Game {gameId} has no entry {entryId}.");

        if (entry.PlatformId != dto.PlatformId)
        {
            var platformExists = await _db.Platforms
                .AnyAsync(p => p.Id == dto.PlatformId, cancellationToken);

            if (!platformExists)
                return Problem(
                    statusCode: StatusCodes.Status400BadRequest,
                    title: "Unknown platform",
                    detail: $"Platform with ID {dto.PlatformId} does not exist.");

            var clash = await _db.UserEntries.AnyAsync(
                e => e.GameId == gameId && e.PlatformId == dto.PlatformId && e.Id != entryId,
                cancellationToken);

            if (clash)
                return Conflict(new
                {
                    title = "Already logged on that platform",
                    detail = "This game already has an entry for that platform."
                });

            entry.PlatformId = dto.PlatformId;
        }

        entry.Status = Enum.Parse<PlayStatus>(dto.Status, ignoreCase: true);
        entry.HoursPlayed = dto.HoursPlayed;
        entry.Rating = dto.Rating;
        entry.Notes = Normalise(dto.Notes);
        entry.AchievementsEarned = dto.AchievementsEarned;
        entry.AchievementsTotal = dto.AchievementsTotal;
        entry.Mode = ParseOptionalEnum<PlayMode>(dto.Mode);
        entry.Hardware = ParseOptionalEnum<HardwareType>(dto.Hardware) ?? HardwareType.Original;
        entry.StartedAt = ToUtc(dto.StartedAt);
        entry.CompletedAt = ToUtc(dto.CompletedAt);
        entry.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync(cancellationToken);

        return Ok(await LoadDetailAsync(gameId, cancellationToken));
    }

    [HttpDelete("{gameId:int}/entries/{entryId:int}")]
    [AdminOnly]
    public async Task<ActionResult<GameDto>> DeleteEntry(
        int gameId,
        int entryId,
        CancellationToken cancellationToken)
    {
        var entries = await _db.UserEntries
            .Where(e => e.GameId == gameId)
            .ToListAsync(cancellationToken);

        var entry = entries.FirstOrDefault(e => e.Id == entryId);
        if (entry == null)
            return Problem(
                statusCode: StatusCodes.Status404NotFound,
                title: "Entry not found",
                detail: $"Game {gameId} has no entry {entryId}.");

        if (entries.Count == 1)
            return Problem(
                statusCode: StatusCodes.Status409Conflict,
                title: "Last entry",
                detail: "This is the only entry for the game — delete the game instead.");

        _db.UserEntries.Remove(entry);
        await _db.SaveChangesAsync(cancellationToken);

        return Ok(await LoadDetailAsync(gameId, cancellationToken));
    }

    [HttpPatch("{id:int}/favourite")]
    [AdminOnly]
    public async Task<ActionResult<GameDto>> ToggleFavourite(int id, CancellationToken cancellationToken)
    {
        var game = await _db.Games.FirstOrDefaultAsync(g => g.Id == id, cancellationToken);
        if (game == null)
            return GameNotFound(id);

        game.IsFavourite = !game.IsFavourite;
        await _db.SaveChangesAsync(cancellationToken);

        return Ok(await LoadDetailAsync(id, cancellationToken));
    }

    [HttpDelete("{id:int}")]
    [AdminOnly]
    public async Task<IActionResult> Delete(int id, CancellationToken cancellationToken)
    {
        var deleted = await _db.Games
            .Where(g => g.Id == id)
            .ExecuteDeleteAsync(cancellationToken);

        if (deleted == 0)
            return GameNotFound(id);

        _logger.LogInformation("Deleted game {GameId}", id);
        return NoContent();
    }

    // -------------------------------------------------------
    // Helpers
    // -------------------------------------------------------

    private async Task<GameDto> LoadDetailAsync(int gameId, CancellationToken cancellationToken) =>
        await ProjectToDetail(_db.Games.AsNoTracking().Where(g => g.Id == gameId))
            .FirstAsync(cancellationToken);

    private ObjectResult GameNotFound(int id) => Problem(
        statusCode: StatusCodes.Status404NotFound,
        title: "Game not found",
        detail: $"No game with ID {id}.");

    private Task<Game?> FindDuplicateAsync(int? igdbId, int? steamAppId, CancellationToken cancellationToken)
    {
        if (igdbId == null && steamAppId == null)
            return Task.FromResult<Game?>(null);

        return _db.Games
            .AsNoTracking()
            .FirstOrDefaultAsync(
                g => (igdbId != null && g.IgdbId == igdbId) ||
                     (steamAppId != null && g.SteamAppId == steamAppId),
                cancellationToken);
    }

    private static UserEntry BuildEntry(CreateUserEntryDto dto) => new()
    {
        PlatformId = dto.PlatformId,
        Status = Enum.Parse<PlayStatus>(dto.Status, ignoreCase: true),
        HoursPlayed = dto.HoursPlayed,
        Rating = dto.Rating,
        Notes = Normalise(dto.Notes),
        AchievementsEarned = dto.AchievementsEarned,
        AchievementsTotal = dto.AchievementsTotal,
        Mode = ParseOptionalEnum<PlayMode>(dto.Mode),
        Hardware = ParseOptionalEnum<HardwareType>(dto.Hardware) ?? HardwareType.Original,
        StartedAt = ToUtc(dto.StartedAt),
        CompletedAt = ToUtc(dto.CompletedAt),
        Source = EntrySource.Manual
    };

    private static IQueryable<Game> ApplySort(IQueryable<Game> games, string? sort) => sort?.ToLowerInvariant() switch
    {
        "-title" => games.OrderByDescending(g => g.Title).ThenBy(g => g.Id),
        "added" => games.OrderByDescending(g => g.CreatedAt).ThenBy(g => g.Id),
        // Games with no entries sort last rather than first, which is what
        // Postgres would otherwise do with NULLs on a descending sort.
        "played" => games
            .OrderByDescending(g => g.UserEntries.Any())
            .ThenByDescending(g => g.UserEntries.Max(e => (DateTime?)e.UpdatedAt))
            .ThenBy(g => g.Id),
        "hours" => games
            .OrderByDescending(g => g.UserEntries.Sum(e => e.HoursPlayed ?? 0m))
            .ThenBy(g => g.Id),
        "rating" => games
            .OrderByDescending(g => g.UserEntries.Max(e => (int?)e.Rating) ?? 0)
            .ThenBy(g => g.Id),
        "year" => games.OrderByDescending(g => g.ReleaseYear ?? 0).ThenBy(g => g.Id),
        _ => games.OrderBy(g => g.Title).ThenBy(g => g.Id)
    };

    private static IQueryable<GameListItemDto> ProjectToListItem(IQueryable<Game> games) =>
        games.Select(g => new GameListItemDto
        {
            Id = g.Id,
            Title = g.Title,
            CoverUrl = g.CoverUrl,
            Genre = g.Genre,
            ReleaseYear = g.ReleaseYear,
            Developer = g.Developer,
            IgdbId = g.IgdbId,
            SteamAppId = g.SteamAppId,
            IsFavourite = g.IsFavourite,
            CreatedAt = g.CreatedAt,
            UserEntries = g.UserEntries
                .OrderBy(e => e.Id)
                .Select(e => new UserEntryDto
                {
                    Id = e.Id,
                    PlatformId = e.PlatformId,
                    PlatformName = e.Platform.Name,
                    Status = e.Status,
                    HoursPlayed = e.HoursPlayed,
                    Rating = e.Rating,
                    Notes = e.Notes,
                    AchievementsEarned = e.AchievementsEarned,
                    AchievementsTotal = e.AchievementsTotal,
                    Mode = e.Mode,
                    Hardware = e.Hardware,
                    Source = e.Source,
                    StartedAt = e.StartedAt,
                    CompletedAt = e.CompletedAt,
                    CreatedAt = e.CreatedAt,
                    UpdatedAt = e.UpdatedAt
                }).ToList()
        });

    private static IQueryable<GameDto> ProjectToDetail(IQueryable<Game> games) =>
        games.Select(g => new GameDto
        {
            Id = g.Id,
            Title = g.Title,
            CoverUrl = g.CoverUrl,
            Genre = g.Genre,
            ReleaseYear = g.ReleaseYear,
            Developer = g.Developer,
            Summary = g.Summary,
            IgdbId = g.IgdbId,
            SteamAppId = g.SteamAppId,
            IsFavourite = g.IsFavourite,
            CreatedAt = g.CreatedAt,
            UserEntries = g.UserEntries
                .OrderBy(e => e.Id)
                .Select(e => new UserEntryDto
                {
                    Id = e.Id,
                    PlatformId = e.PlatformId,
                    PlatformName = e.Platform.Name,
                    Status = e.Status,
                    HoursPlayed = e.HoursPlayed,
                    Rating = e.Rating,
                    Notes = e.Notes,
                    AchievementsEarned = e.AchievementsEarned,
                    AchievementsTotal = e.AchievementsTotal,
                    Mode = e.Mode,
                    Hardware = e.Hardware,
                    Source = e.Source,
                    StartedAt = e.StartedAt,
                    CompletedAt = e.CompletedAt,
                    CreatedAt = e.CreatedAt,
                    UpdatedAt = e.UpdatedAt
                }).ToList()
        });

    private static string? Normalise(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static TEnum? ParseOptionalEnum<TEnum>(string? value) where TEnum : struct, Enum =>
        string.IsNullOrWhiteSpace(value) ? null : Enum.Parse<TEnum>(value, ignoreCase: true);

    /// <summary>
    /// Npgsql refuses to write a DateTime that is not UTC to a timestamptz
    /// column, and dates deserialised from JSON arrive unspecified or local.
    /// </summary>
    private static DateTime? ToUtc(DateTime? value)
    {
        if (!value.HasValue)
            return null;

        var date = value.Value;
        return date.Kind switch
        {
            DateTimeKind.Utc => date,
            DateTimeKind.Local => date.ToUniversalTime(),
            _ => DateTime.SpecifyKind(date, DateTimeKind.Utc)
        };
    }

    /// <summary>Escapes the LIKE wildcards so a search for "50%" is a literal search.</summary>
    private static string EscapeLikePattern(string value) => value
        .Replace("\\", "\\\\")
        .Replace("%", "\\%")
        .Replace("_", "\\_");
}
