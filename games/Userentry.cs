namespace MittsModsApi.Models;

/// <summary>
/// The personal log entry for a game — YOUR data.
/// Tracks how you played it, what you thought, how long, etc.
/// A single Game can have multiple UserEntries (e.g. played Doom on PC and on a modded console).
/// </summary>
public class UserEntry
{
    public int Id { get; set; }

    // Foreign keys
    public int GameId { get; set; }
    public int PlatformId { get; set; }

    // Play status
    public PlayStatus Status { get; set; } = PlayStatus.Backlog;

    // Hours — decimal to allow e.g. 1.5 hours
    public decimal? HoursPlayed { get; set; }

    // Rating — 1 to 10, nullable if not yet rated
    public int? Rating { get; set; }

    // Personal notes / mini review
    public string? Notes { get; set; }

    // Achievements
    public int? AchievementsEarned { get; set; }
    public int? AchievementsTotal { get; set; }

    // Where this entry came from
    public EntrySource Source { get; set; } = EntrySource.Manual;

    // Dates
    public DateTime? StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public Game Game { get; set; } = null!;
    public Platform Platform { get; set; } = null!;
}

public enum PlayStatus
{
    Backlog,
    Playing,
    Completed,
    Dropped,
    OnHold
}

public enum EntrySource
{
    Manual,   // Added by hand
    Steam     // Imported from Steam API
}