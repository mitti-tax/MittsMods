using System.ComponentModel.DataAnnotations;

namespace MittsModsApi.DTOs;

public class GameDto
{
    public int Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? CoverUrl { get; set; }
    public string? Genre { get; set; }
    public int? ReleaseYear { get; set; }
    public string? Developer { get; set; }
    public string? Summary { get; set; }
    public int? IgdbId { get; set; }
    public int? SteamAppId { get; set; }
    public bool IsFavourite { get; set; }
    public bool IsHidden { get; set; }
    public int? TimeToBeatHours { get; set; }
    public DateTime CreatedAt { get; set; }
    public List<UserEntryDto> UserEntries { get; set; } = new();
}

public class UserEntryDto
{
    public int Id { get; set; }
    public int PlatformId { get; set; }
    public string PlatformName { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public decimal? HoursPlayed { get; set; }
    public int? Rating { get; set; }
    public string? Notes { get; set; }
    public int? AchievementsEarned { get; set; }
    public int? AchievementsTotal { get; set; }
    public string? Mode { get; set; }
    public string Hardware { get; set; } = "Original";
    public string Source { get; set; } = string.Empty;
    public DateTime? LastPlayedAt { get; set; }
    public DateTime? StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public List<StatusChangeDto> History { get; set; } = new();
}

public record StatusChangeDto(string Status, DateTime ChangedAt);

// Game details only; the log entries are edited separately
public class UpdateGameDto
{
    [Required, MaxLength(300)]
    public required string Title { get; set; }
    public string? CoverUrl { get; set; }
    public string? Genre { get; set; }
    [Range(1950, 2100)]
    public int? ReleaseYear { get; set; }
    public string? Developer { get; set; }
    public string? Summary { get; set; }
    public int? IgdbId { get; set; }
}

// Applies the same change to many games at once; null fields are left alone
public class BulkUpdateDto
{
    [MinLength(1)]
    public List<int> Ids { get; set; } = new();
    public string? Status { get; set; }
    public int? PlatformId { get; set; }
    public bool? Hidden { get; set; }
}

public class CreateGameDto
{
    [Required, MaxLength(300)]
    public required string Title { get; set; }
    public string? CoverUrl { get; set; }
    public string? Genre { get; set; }
    public int? ReleaseYear { get; set; }
    public string? Developer { get; set; }
    public string? Summary { get; set; }
    public int? IgdbId { get; set; }
    public int? SteamAppId { get; set; }
    public required CreateUserEntryDto Entry { get; set; }
}

public class CreateUserEntryDto
{
    public required int PlatformId { get; set; }
    public string Status { get; set; } = "Backlog";
    [Range(0, 100000)]
    public decimal? HoursPlayed { get; set; }
    [Range(1, 10)]
    public int? Rating { get; set; }
    public string? Notes { get; set; }
    public int? AchievementsEarned { get; set; }
    public int? AchievementsTotal { get; set; }
    public string? Mode { get; set; }
    public string Hardware { get; set; } = "Original";
    public DateTime? StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
}

public class UpdateEntryDto
{
    public int? PlatformId { get; set; }
    public string? Status { get; set; }
    [Range(0, 100000)]
    public decimal? HoursPlayed { get; set; }
    [Range(1, 10)]
    public int? Rating { get; set; }
    public string? Notes { get; set; }
    public int? AchievementsEarned { get; set; }
    public int? AchievementsTotal { get; set; }
    public string? Mode { get; set; }
    public string? Hardware { get; set; }
    public DateTime? StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
}
