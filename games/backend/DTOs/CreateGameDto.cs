namespace MittsModsApi.DTOs;

/// <summary>
/// What the API returns when you ask for a game.
/// A flat, clean representation — no EF navigation objects exposed.
/// </summary>
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
    public DateTime CreatedAt { get; set; }

    // The personal log entries for this game
    public List<UserEntryDto> UserEntries { get; set; } = new();
}

/// <summary>
/// A single personal log entry, embedded in GameDto.
/// </summary>
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
    public string Source { get; set; } = string.Empty;
    public DateTime? StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

/// <summary>
/// What the frontend sends when adding a new game manually.
/// Title is the only required field — everything else can be filled in later
/// or auto-populated from IGDB in M3.
/// </summary>
public class CreateGameDto
{
    public required string Title { get; set; }
    public string? CoverUrl { get; set; }
    public string? Genre { get; set; }
    public int? ReleaseYear { get; set; }
    public string? Developer { get; set; }
    public string? Summary { get; set; }
    public int? IgdbId { get; set; }
    public int? SteamAppId { get; set; }

    // A game entry requires at least one UserEntry (the platform + your personal data)
    public required CreateUserEntryDto Entry { get; set; }
}

/// <summary>
/// The personal log portion of a new game submission.
/// </summary>
public class CreateUserEntryDto
{
    public required int PlatformId { get; set; }
    public string Status { get; set; } = "Backlog";
    public decimal? HoursPlayed { get; set; }
    public int? Rating { get; set; }
    public string? Notes { get; set; }
    public int? AchievementsEarned { get; set; }
    public int? AchievementsTotal { get; set; }
    public DateTime? StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
}

/// <summary>
/// What the frontend sends when updating an existing UserEntry.
/// All fields optional — only provided fields should be updated.
/// </summary>
public class UpdateEntryDto
{
    public int? PlatformId { get; set; }
    public string? Status { get; set; }
    public decimal? HoursPlayed { get; set; }
    public int? Rating { get; set; }
    public string? Notes { get; set; }
    public int? AchievementsEarned { get; set; }
    public int? AchievementsTotal { get; set; }
    public DateTime? StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
}