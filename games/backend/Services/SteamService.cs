using System.Text.Json;
using MittsModsApi.DTOs;

namespace MittsModsApi.Services;

public class SteamService
{
    private readonly HttpClient _http;
    private readonly IConfiguration _config;
    private readonly ILogger<SteamService> _logger;

    public SteamService(HttpClient http, IConfiguration config, ILogger<SteamService> logger)
    {
        _http = http;
        _config = config;
        _logger = logger;
    }

    // -------------------------------------------------------
    // Fetch the full Steam library with hours played
    // -------------------------------------------------------
    public async Task<List<SteamGameResult>> GetLibraryAsync()
    {
        var apiKey  = _config["Steam:ApiKey"];
        var steamId = _config["Steam:SteamId"];

        var url = $"https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/" +
                  $"?key={apiKey}&steamid={steamId}&include_appinfo=true&include_played_free_games=true";

        var response = await _http.GetAsync(url);
        response.EnsureSuccessStatusCode();

        var json = await response.Content.ReadAsStringAsync();
        using var doc = JsonDocument.Parse(json);

        var games = doc.RootElement
            .GetProperty("response")
            .GetProperty("games");

        var results = new List<SteamGameResult>();

        foreach (var game in games.EnumerateArray())
        {
            var appId      = game.GetProperty("appid").GetInt32();
            var name       = game.GetProperty("name").GetString() ?? string.Empty;
            var minutesPlayed = game.TryGetProperty("playtime_forever", out var pt)
                ? pt.GetInt32() : 0;

            // Cover art from Steam CDN
            var coverUrl = $"https://cdn.akamai.steamstatic.com/steam/apps/{appId}/library_600x900.jpg";

            results.Add(new SteamGameResult
            {
                SteamAppId     = appId,
                Name           = name,
                HoursPlayed    = Math.Round(minutesPlayed / 60.0m, 1),
                CoverUrl       = coverUrl
            });
        }

        _logger.LogInformation("Fetched {Count} games from Steam library", results.Count);
        return results.OrderByDescending(g => g.HoursPlayed).ToList();
    }

    // -------------------------------------------------------
    // Fetch achievements for a specific Steam app
    // -------------------------------------------------------
    public async Task<SteamAchievementResult> GetAchievementsAsync(int appId)
    {
        var apiKey  = _config["Steam:ApiKey"];
        var steamId = _config["Steam:SteamId"];

        var url = $"https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/" +
                  $"?key={apiKey}&steamid={steamId}&appid={appId}";

        try
        {
            var response = await _http.GetAsync(url);
            response.EnsureSuccessStatusCode();

            var json = await response.Content.ReadAsStringAsync();
            using var doc = JsonDocument.Parse(json);

            var playerStats = doc.RootElement.GetProperty("playerstats");

            // Some games have no achievements — check success flag
            if (!playerStats.TryGetProperty("achievements", out var achievements))
                return new SteamAchievementResult { AppId = appId };

            var all     = achievements.GetArrayLength();
            var earned  = achievements.EnumerateArray().Count(a =>
                a.TryGetProperty("achieved", out var v) && v.GetInt32() == 1);

            return new SteamAchievementResult
            {
                AppId               = appId,
                AchievementsEarned  = earned,
                AchievementsTotal   = all
            };
        }
        catch (Exception ex)
        {
            // Some games don't support achievement stats — don't crash the sync
            _logger.LogWarning("Could not fetch achievements for appId {AppId}: {Message}", appId, ex.Message);
            return new SteamAchievementResult { AppId = appId };
        }
    }
}