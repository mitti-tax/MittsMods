namespace MittsModsApi.Models;

/// <summary>
/// The personal log entry for a game — YOUR data.
/// </summary>
public class UserEntry
{
    public int Id { get; set; }

    public int GameId { get; set; }
    public int PlatformId { get; set; }

    public PlayStatus Status { get; set; } = PlayStatus.Backlog;

    public decimal? HoursPlayed { get; set; }
    public int? Rating { get; set; }
    public string? Notes { get; set; }

    public int? AchievementsEarned { get; set; }
    public int? AchievementsTotal { get; set; }

    // How it was played
    public PlayMode? Mode { get; set; }
    public HardwareType Hardware { get; set; } = HardwareType.Original;

    public EntrySource Source { get; set; } = EntrySource.Manual;

    // From Steam: when the game was last launched
    public DateTime? LastPlayedAt { get; set; }

    public DateTime? StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public Game Game { get; set; } = null!;
    public Platform Platform { get; set; } = null!;
    public ICollection<StatusChange> History { get; set; } = new List<StatusChange>();

    // Every status change goes through here: it fills the start/finish dates and logs the change
    public void SetStatus(PlayStatus status)
    {
        if (status == Status && Id != 0) return; // a new entry always logs its first status
        var now = DateTime.UtcNow;
        Status = status;
        if (status == PlayStatus.Playing) StartedAt ??= now;
        if (status == PlayStatus.Completed) CompletedAt ??= now;
        History.Add(new StatusChange { Status = status, ChangedAt = now });
    }
}

public class StatusChange
{
    public int Id { get; set; }
    public int UserEntryId { get; set; }
    public PlayStatus Status { get; set; }
    public DateTime ChangedAt { get; set; }
}

public enum PlayStatus
{
    Backlog,
    Playing,
    Completed,
    Dropped,
    OnHold,
    Wishlist
}

public enum PlayMode
{
    Handheld,
    TV,
    CRT
}

public enum HardwareType
{
    Original,   // Unmodified retail hardware
    Modded,     // Modified hardware (RGH, CFW, modchips etc.)
    Emulator,   // Software emulation
    Cloud       // Cloud streaming (Game Pass, GeForce Now etc.)
}

public enum EntrySource
{
    Manual,
    Steam
}