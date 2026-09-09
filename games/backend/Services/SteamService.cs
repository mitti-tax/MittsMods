using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;
using MittsModsApi.DTOs;

namespace MittsModsApi.Services;

public class SteamService
{
    private const string LibraryCacheKey = "steam_library";

    private readonly HttpClient _http;
    private readonly IMemoryCache _cache;
    private readonly IConfiguration _config;
    private readonly ILogger<SteamService> _logger;

    public SteamService(HttpClient http, IMemoryCache cache, IConfiguration config, ILogger<SteamService> logger)
    {
        _http = http;
        _cache = cache;
        _config = config;
        _logger = logger;
    }

    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(_config["Steam:ApiKey"]) &&
        !string.IsNullOrWhiteSpace(_config["Steam:SteamId"]);

    /// <summary>
    /// The full Steam library with hours played, newest playtime first.
    /// Cached briefly so a preview followed by a sync is one upstream call.
    /// </summary>
    public async Task<List<SteamGameResult>> GetLibraryAsync(CancellationToken cancellationToken = default)
    {
        if (_cache.TryGetValue(LibraryCacheKey, out List<SteamGameResult>? cached) && cached != null)
            return cached;

        RequireConfiguration();

        var url = "https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/" +
                  $"?key={Uri.EscapeDataString(_config["Steam:ApiKey"]!)}" +
                  $"&steamid={Uri.EscapeDataString(_config["Steam:SteamId"]!)}" +
                  "&include_appinfo=true&include_played_free_games=true";

        var json = await GetStringAsync(url, cancellationToken);

        using var document = JsonDocument.Parse(json);

        // A private profile, a bad key or an empty library all return a
        // response object with no "games" array — that is not a crash.
        if (!document.RootElement.TryGetProperty("response", out var response) ||
            !response.TryGetProperty("games", out var games) ||
            games.ValueKind != JsonValueKind.Array)
        {
            _logger.LogWarning(
                "Steam returned no games. Check the API key, the Steam ID, and that the profile's game details are public.");
            return new List<SteamGameResult>();
        }

        var results = new List<SteamGameResult>(games.GetArrayLength());

        foreach (var game in games.EnumerateArray())
        {
            if (!game.TryGetProperty("appid", out var appIdElement) ||
                !appIdElement.TryGetInt32(out var appId))
            {
                continue;
            }

            var name = game.TryGetProperty("name", out var nameElement)
                ? nameElement.GetString()
                : null;

            if (string.IsNullOrWhiteSpace(name))
                continue;

            var minutesPlayed = game.TryGetProperty("playtime_forever", out var playtime) &&
                                playtime.TryGetInt32(out var minutes)
                ? minutes
                : 0;

            results.Add(new SteamGameResult
            {
                SteamAppId = appId,
                Name = name.Trim(),
                HoursPlayed = Math.Round(minutesPlayed / 60.0m, 1),
                CoverUrl = $"https://cdn.cloudflare.steamstatic.com/steam/apps/{appId}/library_600x900.jpg"
            });
        }

        results = results.OrderByDescending(g => g.HoursPlayed).ToList();

        _logger.LogInformation("Fetched {Count} games from the Steam library", results.Count);
        _cache.Set(LibraryCacheKey, results, TimeSpan.FromMinutes(5));

        return results;
    }

    /// <summary>
    /// Achievement progress for one app. Plenty of games have no achievements
    /// at all, so a failure here returns empty progress instead of throwing.
    /// </summary>
    public async Task<SteamAchievementResult> GetAchievementsAsync(
        int appId,
        CancellationToken cancellationToken = default)
    {
        if (!IsConfigured)
            return new SteamAchievementResult { AppId = appId };

        var url = "https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/" +
                  $"?key={Uri.EscapeDataString(_config["Steam:ApiKey"]!)}" +
                  $"&steamid={Uri.EscapeDataString(_config["Steam:SteamId"]!)}" +
                  $"&appid={appId}";

        try
        {
            var json = await GetStringAsync(url, cancellationToken);
            using var document = JsonDocument.Parse(json);

            if (!document.RootElement.TryGetProperty("playerstats", out var playerStats) ||
                !playerStats.TryGetProperty("achievements", out var achievements) ||
                achievements.ValueKind != JsonValueKind.Array)
            {
                return new SteamAchievementResult { AppId = appId };
            }

            var total = achievements.GetArrayLength();
            var earned = achievements.EnumerateArray().Count(a =>
                a.TryGetProperty("achieved", out var achieved) &&
                achieved.TryGetInt32(out var value) &&
                value == 1);

            return new SteamAchievementResult
            {
                AppId = appId,
                AchievementsEarned = earned,
                AchievementsTotal = total
            };
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogDebug("No achievement stats for appId {AppId}: {Message}", appId, ex.Message);
            return new SteamAchievementResult { AppId = appId };
        }
    }

    private void RequireConfiguration()
    {
        if (!IsConfigured)
            throw new UpstreamServiceException("Steam", "Steam credentials are not configured on the server.");
    }

    private async Task<string> GetStringAsync(string url, CancellationToken cancellationToken)
    {
        try
        {
            using var response = await _http.GetAsync(url, cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                // Never echo the URL — it carries the API key.
                throw new UpstreamServiceException(
                    "Steam",
                    $"Steam responded with {(int)response.StatusCode} {response.ReasonPhrase}.");
            }

            return await response.Content.ReadAsStringAsync(cancellationToken);
        }
        catch (HttpRequestException ex)
        {
            throw new UpstreamServiceException("Steam", "Could not reach Steam.", ex);
        }
        catch (TaskCanceledException ex) when (!cancellationToken.IsCancellationRequested)
        {
            throw new UpstreamServiceException("Steam", "Steam timed out.", ex);
        }
    }
}
