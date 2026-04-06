namespace MittsModsApi.Models;

/// <summary>
/// Stores metadata about a game — either sourced from IGDB, Steam, or entered manually.
/// This is the "what is this game" record, not the personal log entry.
/// </summary>
public class Game
{
    public int Id { get; set; }

    // Core info
    public required string Title { get; set; }
    public string? CoverUrl { get; set; }
    public string? Genre { get; set; }
    public int? ReleaseYear { get; set; }
    public string? Developer { get; set; }
    public string? Summary { get; set; }

    // External IDs — null if not linked to that source
    public int? IgdbId { get; set; }
    public int? SteamAppId { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Navigation — one game can have many user log entries (e.g. played on multiple platforms)
    public ICollection<UserEntry> UserEntries { get; set; } = new List<UserEntry>();
}