namespace MittsModsApi.Models;

/// <summary>
/// A platform/console the game was played on.
/// Pre-seeded with common platforms, but can be extended.
/// </summary>
public class Platform
{
    public int Id { get; set; }
    public required string Name { get; set; }   // e.g. "Sega Dreamcast", "Xbox 360", "PC"
    public string? Abbreviation { get; set; }   // e.g. "DC", "X360", "PC"

    // Navigation
    public ICollection<UserEntry> UserEntries { get; set; } = new List<UserEntry>();
}