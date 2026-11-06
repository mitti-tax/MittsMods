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
    public DateTime? LastPlayedAt { get; set; }
    public bool PlayedRecently { get; set; } // any playtime in the last two weeks
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
    public int MovedToPlaying { get; set; }
    public int MovedToBacklog { get; set; } // Playing games not played for two weeks
    public List<string> Games { get; set; } = new();
}

public record SteamStatus(DateTime? LastSyncedAt);
