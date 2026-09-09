using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;
using MittsModsApi.DTOs;

namespace MittsModsApi.Services;

public class IgdbService
{
    private const string TokenCacheKey = "igdb_access_token";
    private const string SearchCachePrefix = "igdb_search_";
    private const int MaxQueryLength = 100;

    // IGDB allows four requests a second. Serialising outbound calls behind a
    // minimum interval keeps a large Steam sync from tripping the limit.
    private static readonly TimeSpan MinimumRequestInterval = TimeSpan.FromMilliseconds(260);
    private static readonly SemaphoreSlim RequestGate = new(1, 1);
    private static readonly SemaphoreSlim TokenGate = new(1, 1);
    private static DateTimeOffset _lastRequestAt = DateTimeOffset.MinValue;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    private readonly HttpClient _http;
    private readonly IMemoryCache _cache;
    private readonly IConfiguration _config;
    private readonly ILogger<IgdbService> _logger;

    public IgdbService(HttpClient http, IMemoryCache cache, IConfiguration config, ILogger<IgdbService> logger)
    {
        _http = http;
        _cache = cache;
        _config = config;
        _logger = logger;
    }

    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(_config["Twitch:ClientId"]) &&
        !string.IsNullOrWhiteSpace(_config["Twitch:ClientSecret"]);

    public async Task<List<IgdbGameResult>> SearchAsync(string query, CancellationToken cancellationToken = default)
    {
        if (!IsConfigured)
            throw new UpstreamServiceException("IGDB", "IGDB credentials are not configured on the server.");

        var term = query.Trim();
        if (term.Length > MaxQueryLength)
            term = term[..MaxQueryLength];

        var cacheKey = SearchCachePrefix + term.ToLowerInvariant();
        if (_cache.TryGetValue(cacheKey, out List<IgdbGameResult>? cached) && cached != null)
            return cached;

        var token = await GetAccessTokenAsync(cancellationToken);
        var clientId = _config["Twitch:ClientId"];

        // IGDB takes an APICalypse query in the body. The search term lands
        // inside a quoted string, so quotes and backslashes must be escaped or
        // a title like Ratchet & Clank: "Up Your Arsenal" rewrites the query.
        var body =
            $"""
             search "{EscapeSearchTerm(term)}";
             fields name, summary, cover.url, first_release_date,
                    genres.name, involved_companies.developer,
                    involved_companies.company.name,
                    platforms.name, platforms.abbreviation;
             limit 20;
             """;

        var json = await SendAsync(() =>
        {
            var request = new HttpRequestMessage(HttpMethod.Post, "https://api.igdb.com/v4/games")
            {
                Content = new StringContent(body, Encoding.UTF8, "text/plain")
            };
            request.Headers.TryAddWithoutValidation("Client-ID", clientId);
            request.Headers.TryAddWithoutValidation("Authorization", $"Bearer {token}");
            return request;
        }, cancellationToken);

        List<IgdbRawGame> raw;
        try
        {
            raw = JsonSerializer.Deserialize<List<IgdbRawGame>>(json, JsonOptions) ?? new();
        }
        catch (JsonException ex)
        {
            throw new UpstreamServiceException("IGDB", "IGDB returned an unreadable response.", ex);
        }

        var results = raw.Select(MapToResult).ToList();

        // Cache misses too — a title IGDB does not know still costs a request.
        _cache.Set(cacheKey, results, TimeSpan.FromHours(6));

        return results;
    }

    private async Task<string> GetAccessTokenAsync(CancellationToken cancellationToken)
    {
        if (_cache.TryGetValue(TokenCacheKey, out string? cachedToken) && cachedToken != null)
            return cachedToken;

        // Without this gate every concurrent request during a sync would fetch
        // its own token from Twitch.
        await TokenGate.WaitAsync(cancellationToken);
        try
        {
            if (_cache.TryGetValue(TokenCacheKey, out cachedToken) && cachedToken != null)
                return cachedToken;

            var clientId = _config["Twitch:ClientId"];
            var clientSecret = _config["Twitch:ClientSecret"];

            var json = await SendAsync(() => new HttpRequestMessage(
                HttpMethod.Post,
                "https://id.twitch.tv/oauth2/token" +
                $"?client_id={Uri.EscapeDataString(clientId!)}" +
                $"&client_secret={Uri.EscapeDataString(clientSecret!)}" +
                "&grant_type=client_credentials"),
                cancellationToken);

            using var document = JsonDocument.Parse(json);

            if (!document.RootElement.TryGetProperty("access_token", out var tokenElement) ||
                tokenElement.GetString() is not { Length: > 0 } token)
            {
                throw new UpstreamServiceException("IGDB", "Twitch did not return an access token.");
            }

            var expiresIn = document.RootElement.TryGetProperty("expires_in", out var expiresElement)
                ? expiresElement.GetInt32()
                : 3600;

            // Refresh a minute early so a token never expires mid-request.
            _cache.Set(TokenCacheKey, token, TimeSpan.FromSeconds(Math.Max(expiresIn - 60, 60)));
            _logger.LogInformation("Fetched a new IGDB access token, valid for {ExpiresIn}s", expiresIn);

            return token;
        }
        finally
        {
            TokenGate.Release();
        }
    }

    /// <summary>Sends a request, spacing calls out to stay inside IGDB's rate limit.</summary>
    private async Task<string> SendAsync(
        Func<HttpRequestMessage> requestFactory,
        CancellationToken cancellationToken)
    {
        await RequestGate.WaitAsync(cancellationToken);
        try
        {
            var sinceLast = DateTimeOffset.UtcNow - _lastRequestAt;
            if (sinceLast < MinimumRequestInterval)
                await Task.Delay(MinimumRequestInterval - sinceLast, cancellationToken);

            using var request = requestFactory();
            using var response = await _http.SendAsync(request, cancellationToken);
            _lastRequestAt = DateTimeOffset.UtcNow;

            if (!response.IsSuccessStatusCode)
            {
                throw new UpstreamServiceException(
                    "IGDB",
                    $"IGDB responded with {(int)response.StatusCode} {response.ReasonPhrase}.");
            }

            return await response.Content.ReadAsStringAsync(cancellationToken);
        }
        catch (HttpRequestException ex)
        {
            throw new UpstreamServiceException("IGDB", "Could not reach IGDB.", ex);
        }
        catch (TaskCanceledException ex) when (!cancellationToken.IsCancellationRequested)
        {
            throw new UpstreamServiceException("IGDB", "IGDB timed out.", ex);
        }
        finally
        {
            RequestGate.Release();
        }
    }

    private static string EscapeSearchTerm(string term)
    {
        var escaped = new StringBuilder(term.Length + 8);

        foreach (var character in term)
        {
            if (char.IsControl(character))
            {
                escaped.Append(' ');
                continue;
            }

            if (character is '"' or '\\')
                escaped.Append('\\');

            escaped.Append(character);
        }

        return escaped.ToString();
    }

    private static IgdbGameResult MapToResult(IgdbRawGame raw)
    {
        // IGDB cover URLs come back protocol-relative and thumbnail sized.
        string? coverUrl = null;
        if (!string.IsNullOrWhiteSpace(raw.cover?.url))
        {
            var url = raw.cover!.url!.Replace("t_thumb", "t_cover_big");
            coverUrl = url.StartsWith("//", StringComparison.Ordinal) ? "https:" + url : url;
        }

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
            Id = raw.id,
            Name = raw.name ?? string.Empty,
            Summary = raw.summary,
            CoverUrl = coverUrl,
            ReleaseYear = releaseYear,
            Genres = genres,
            Developers = developers,
            Platforms = platforms
        };
    }
}
