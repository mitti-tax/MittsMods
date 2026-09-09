using System.ComponentModel.DataAnnotations;
using MittsModsApi.Models;
using MittsModsApi.Validation;

namespace MittsModsApi.DTOs;

/// <summary>
/// A game as it appears in list responses. Deliberately omits the long IGDB
/// summary — across a few hundred games that text dominates the payload, and
/// nothing in the grid displays it. Fetch <see cref="GameDto"/> for the detail view.
/// </summary>
public class GameListItemDto
{
    public int Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? CoverUrl { get; set; }
    public string? Genre { get; set; }
    public int? ReleaseYear { get; set; }
    public string? Developer { get; set; }
    public int? IgdbId { get; set; }
    public int? SteamAppId { get; set; }
    public bool IsFavourite { get; set; }
    public DateTime CreatedAt { get; set; }
    public List<UserEntryDto> UserEntries { get; set; } = new();
}

/// <summary>A game with its full metadata, for the detail view.</summary>
public class GameDto : GameListItemDto
{
    public string? Summary { get; set; }
}

public class UserEntryDto
{
    public int Id { get; set; }
    public int PlatformId { get; set; }
    public string PlatformName { get; set; } = string.Empty;
    // Enums, not strings: this shape is projected straight into SQL, and a
    // ToString() on a converted enum column has no translation. They still
    // serialise as the same "Backlog" / "Original" strings on the wire, via
    // the JsonStringEnumConverter registered in program.cs.
    public PlayStatus Status { get; set; }
    public decimal? HoursPlayed { get; set; }
    public int? Rating { get; set; }
    public string? Notes { get; set; }
    public int? AchievementsEarned { get; set; }
    public int? AchievementsTotal { get; set; }
    public PlayMode? Mode { get; set; }
    public HardwareType Hardware { get; set; } = HardwareType.Original;
    public EntrySource Source { get; set; }
    public DateTime? StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class CreateGameDto
{
    [Required(AllowEmptyStrings = false)]
    [StringLength(300, MinimumLength = 1)]
    public string Title { get; set; } = string.Empty;

    [StringLength(1000)]
    [Url]
    public string? CoverUrl { get; set; }

    [StringLength(100)]
    public string? Genre { get; set; }

    [Range(1950, 2200)]
    public int? ReleaseYear { get; set; }

    [StringLength(200)]
    public string? Developer { get; set; }

    [StringLength(5000)]
    public string? Summary { get; set; }

    [Range(1, int.MaxValue)]
    public int? IgdbId { get; set; }

    [Range(1, int.MaxValue)]
    public int? SteamAppId { get; set; }

    [Required]
    public CreateUserEntryDto Entry { get; set; } = new();
}

/// <summary>The personal log fields for a new entry.</summary>
public class CreateUserEntryDto
{
    [Range(1, int.MaxValue, ErrorMessage = "A platform must be selected.")]
    public int PlatformId { get; set; }

    [Required(AllowEmptyStrings = false)]
    [EnumName(typeof(PlayStatus))]
    public string Status { get; set; } = nameof(PlayStatus.Backlog);

    [Range(0.0, 100_000.0)]
    public decimal? HoursPlayed { get; set; }

    [Range(1, 10)]
    public int? Rating { get; set; }

    [StringLength(4000)]
    public string? Notes { get; set; }

    [Range(0, 100_000)]
    public int? AchievementsEarned { get; set; }

    [Range(0, 100_000)]
    public int? AchievementsTotal { get; set; }

    [EnumName(typeof(PlayMode))]
    public string? Mode { get; set; }

    [EnumName(typeof(HardwareType))]
    public string? Hardware { get; set; } = nameof(HardwareType.Original);

    public DateTime? StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
}

/// <summary>
/// The full state of an entry. This is a PUT, so it replaces every field the
/// client owns — sending null for notes or rating clears them, which the old
/// merge-only behaviour made impossible.
/// </summary>
public class UpdateEntryDto
{
    [Range(1, int.MaxValue, ErrorMessage = "A platform must be selected.")]
    public int PlatformId { get; set; }

    [Required(AllowEmptyStrings = false)]
    [EnumName(typeof(PlayStatus))]
    public string Status { get; set; } = string.Empty;

    [Range(0.0, 100_000.0)]
    public decimal? HoursPlayed { get; set; }

    [Range(1, 10)]
    public int? Rating { get; set; }

    [StringLength(4000)]
    public string? Notes { get; set; }

    [Range(0, 100_000)]
    public int? AchievementsEarned { get; set; }

    [Range(0, 100_000)]
    public int? AchievementsTotal { get; set; }

    [EnumName(typeof(PlayMode))]
    public string? Mode { get; set; }

    [EnumName(typeof(HardwareType))]
    public string? Hardware { get; set; }

    public DateTime? StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
}

/// <summary>Filtering, sorting and paging for GET /api/games.</summary>
public class GameQuery
{
    public const int MaxPageSize = 200;

    /// <summary>Free text matched against the title and developer.</summary>
    [StringLength(100)]
    public string? Q { get; set; }

    [EnumName(typeof(PlayStatus))]
    public string? Status { get; set; }

    [Range(1, int.MaxValue)]
    public int? PlatformId { get; set; }

    public bool? Favourite { get; set; }

    /// <summary>Only games with at least this many hours logged.</summary>
    [Range(0.0, 100_000.0)]
    public decimal? MinHours { get; set; }

    /// <summary>title, -title, added, played, hours, rating or year.</summary>
    [StringLength(20)]
    public string Sort { get; set; } = "title";

    [Range(1, int.MaxValue)]
    public int Page { get; set; } = 1;

    [Range(1, MaxPageSize)]
    public int PageSize { get; set; } = 60;
}

public class PagedResult<T>
{
    public IReadOnlyList<T> Items { get; init; } = Array.Empty<T>();
    public int Page { get; init; }
    public int PageSize { get; init; }
    public int TotalCount { get; init; }
    public int TotalPages => PageSize <= 0 ? 0 : (int)Math.Ceiling(TotalCount / (double)PageSize);
    public bool HasMore => Page < TotalPages;
}

/// <summary>Library-wide totals, aggregated in the database.</summary>
public class LibraryStatsDto
{
    public int TotalGames { get; set; }
    public int TotalEntries { get; set; }
    public decimal TotalHours { get; set; }
    public int Favourites { get; set; }
    public double? AverageRating { get; set; }
    public int AchievementsEarned { get; set; }
    public int AchievementsTotal { get; set; }

    /// <summary>Distinct games per status — a game counts once per status it holds.</summary>
    public Dictionary<string, int> GamesByStatus { get; set; } = new();

    public List<PlatformStatDto> TopPlatforms { get; set; } = new();
}

public class PlatformStatDto
{
    public int PlatformId { get; set; }
    public string PlatformName { get; set; } = string.Empty;
    public int Games { get; set; }
    public decimal Hours { get; set; }
}
