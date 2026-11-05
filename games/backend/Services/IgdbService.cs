using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;
using MittsModsApi.DTOs;

namespace MittsModsApi.Services;

public class IgdbService
{
    private readonly HttpClient _http;
    private readonly IMemoryCache _cache;
    private readonly IConfiguration _config;
    private readonly ILogger<IgdbService> _logger;

    // Cache keys
    private const string TokenCacheKey = "igdb_access_token";
    private const string SearchCachePrefix = "igdb_search_";

    public IgdbService(HttpClient http, IMemoryCache cache, IConfiguration config, ILogger<IgdbService> logger)
    {
        _http = http;
        _cache = cache;
        _config = config;
        _logger = logger;
    }

    public async Task<List<IgdbGameResult>> SearchAsync(string query)
    {
        var cacheKey = $"{SearchCachePrefix}{query.ToLower().Trim()}";

        // Return cached result if available
        if (_cache.TryGetValue(cacheKey, out List<IgdbGameResult>? cached) && cached != null)
        {
            _logger.LogInformation("IGDB cache hit for query: {Query}", query);
            return cached;
        }

        // IGDB uses POST requests with a body query language.
        // Strip quotes/backslashes so a title like `"Hello" World` can't break out of the search string.
        var safeQuery = query.Replace("\\", "").Replace("\"", "");
        var raw = await QueryAsync<IgdbRawGame>("games", $@"
            search ""{safeQuery}"";
            fields {GameFields};
            limit 20;
        ");

        var results = raw.Select(MapToResult).ToList();

        // Cache results for 1 hour
        _cache.Set(cacheKey, results, TimeSpan.FromHours(1));

        return results;
    }

    // Exact IGDB games for Steam app ids, via IGDB's Steam links (external_game_source 1 = Steam).
    // A name search is fuzzy and often ranks a spin-off or bundle first (Fallout -> Fallout Tactics).
    public async Task<Dictionary<int, IgdbGameResult>> GetBySteamAppIdsAsync(IEnumerable<int> appIds)
    {
        var results = new Dictionary<int, IgdbGameResult>();
        foreach (var chunk in appIds.Distinct().Chunk(500)) // 500 = IGDB's max page size
        {
            var uids = string.Join(",", chunk.Select(id => $"\"{id}\""));
            var gameFields = string.Join(", ", GameFields.Split(", ").Select(f => "game." + f));
            var links = await QueryAsync<IgdbRawExternalGame>("external_games", $@"
                fields uid, {gameFields};
                where uid = ({uids}) & external_game_source = 1;
                limit 500;
            ");
            foreach (var link in links)
                if (link.game != null && int.TryParse(link.uid, out var appId))
                    results.TryAdd(appId, MapToResult(link.game));
        }
        return results;
    }

    private const string GameFields =
        "name, summary, cover.url, first_release_date, genres.name, " +
        "involved_companies.developer, involved_companies.company.name, " +
        "platforms.name, platforms.abbreviation";

    private async Task<List<T>> QueryAsync<T>(string endpoint, string body)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, $"https://api.igdb.com/v4/{endpoint}")
        {
            Content = new StringContent(body)
        };
        request.Headers.Add("Client-ID", _config["Twitch:ClientId"]);
        request.Headers.Add("Authorization", $"Bearer {await GetAccessTokenAsync()}");

        var response = await _http.SendAsync(request);
        response.EnsureSuccessStatusCode();

        var json = await response.Content.ReadAsStringAsync();
        var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
        return JsonSerializer.Deserialize<List<T>>(json, options) ?? new();
    }


    private async Task<string> GetAccessTokenAsync()
    {
        if (_cache.TryGetValue(TokenCacheKey, out string? cachedToken) && cachedToken != null)
            return cachedToken;

        var clientId = _config["Twitch:ClientId"];
        var clientSecret = _config["Twitch:ClientSecret"];

        var tokenRequest = new HttpRequestMessage(HttpMethod.Post,
            $"https://id.twitch.tv/oauth2/token?client_id={clientId}&client_secret={clientSecret}&grant_type=client_credentials");

        var response = await _http.SendAsync(tokenRequest);
        response.EnsureSuccessStatusCode();

        var json = await response.Content.ReadAsStringAsync();
        using var doc = JsonDocument.Parse(json);

        var token = doc.RootElement.GetProperty("access_token").GetString()!;
        var expiresIn = doc.RootElement.GetProperty("expires_in").GetInt32();

        // Cache token for slightly less than its actual expiry to be safe
        _cache.Set(TokenCacheKey, token, TimeSpan.FromSeconds(expiresIn - 60));

        _logger.LogInformation("Fetched new IGDB access token, expires in {ExpiresIn}s", expiresIn);

        return token;
    }

    private static IgdbGameResult MapToResult(IgdbRawGame raw)
    {
        // IGDB cover URLs come as //images.igdb.com/... (no protocol)
        // We upgrade the size from thumb (t_thumb) to cover_big
        string? coverUrl = null;
        if (raw.cover?.url != null)
        {
            coverUrl = "https:" + raw.cover.url.Replace("t_thumb", "t_cover_big");
        }

        // IGDB release dates are Unix timestamps
        int? releaseYear = null;
        if (raw.first_release_date.HasValue)
        {
            releaseYear = DateTimeOffset
                .FromUnixTimeSeconds(raw.first_release_date.Value)
                .Year;
        }

        var genres = raw.genres?
            .Where(g => g.name != null)
            .Select(g => g.name!)
            .ToList() ?? new();

        var developers = raw.involved_companies?
            .Where(c => c.developer && c.company?.name != null)
            .Select(c => c.company!.name!)
            .ToList() ?? new();

        var platforms = raw.platforms?
            .Where(p => p.name != null)
            .Select(p => p.name!)
            .ToList() ?? new();

        return new IgdbGameResult
        {
            Id          = raw.id,
            Name        = raw.name ?? string.Empty,
            Summary     = raw.summary,
            CoverUrl    = coverUrl,
            ReleaseYear = releaseYear,
            Genres      = genres,
            Developers  = developers,
            Platforms   = platforms
        };
    }
}