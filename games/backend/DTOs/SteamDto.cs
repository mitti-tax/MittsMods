namespace MittsModsApi.DTOs;

/// <summary>
/// A game from the Steam library fetch.
/// </summary>
public class SteamGameResult
{
    public int SteamAppId { get; set; }
    public string Name { get; set; } = string.Empty;
    public decimal HoursPlayed { get; set; }
    public string? CoverUrl { get; set; }
}

/// <summary>
/// Achievement data for a single Steam app.
/// </summary>
public class SteamAchievementResult
{
    public int AppId { get; set; }
    public int? AchievementsEarned { get; set; }
    public int? AchievementsTotal { get; set; }
}

/// <summary>
/// Summary returned after a sync operation.
/// </summary>
public class SteamSyncResult
{
    public int Added { get; set; }
    public int Updated { get; set; }
    public int Skipped { get; set; }
    public List<string> Games { get; set; } = new();
}