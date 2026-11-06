using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using MittsModsApi.Controllers;

namespace MittsModsApi.Tests;

public class AuthTests(ApiFactory api) : ApiTest(api)
{
    private record TokenResponse(string Token);

    // Each test logs in from its own address so the login rate limit (per visitor) doesn't leak between tests
    private HttpRequestMessage Login(string password, string ip) =>
        new(HttpMethod.Post, "/api/auth/login")
        {
            Content = JsonContent.Create(new { password }),
            Headers = { { "CF-Connecting-IP", ip } }
        };

    [Fact]
    public async Task Login_with_the_right_password_returns_a_token_that_allows_writes()
    {
        var token = (await Ok<TokenResponse>(await Guest.SendAsync(Login(ApiFactory.Password, "10.0.0.1")))).Token;

        await Status(HttpStatusCode.OK, Guest.PostAsJsonAsync("/api/auth/verify", new { token }));
        var client = Api.Guest();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        await Status(HttpStatusCode.NotFound, client.PatchAsync("/api/games/999/favourite", null)); // past the auth check
    }

    [Fact]
    public async Task Login_with_a_wrong_password_is_rejected()
    {
        await Status(HttpStatusCode.Unauthorized, Guest.SendAsync(Login("nope", "10.0.0.2")));
    }

    [Fact]
    public async Task Login_allows_five_tries_a_minute_per_visitor()
    {
        for (var i = 0; i < 5; i++)
            await Status(HttpStatusCode.Unauthorized, Guest.SendAsync(Login("guess", "10.0.0.3")));
        await Status(HttpStatusCode.TooManyRequests, Guest.SendAsync(Login(ApiFactory.Password, "10.0.0.3")));
        // Someone else isn't locked out
        await Status(HttpStatusCode.OK, Guest.SendAsync(Login(ApiFactory.Password, "10.0.0.4")));
    }

    public static TheoryData<string> BadTokens()
    {
        var past = DateTimeOffset.UtcNow.AddMinutes(-1).ToUnixTimeSeconds().ToString();
        var future = DateTimeOffset.UtcNow.AddDays(1).ToUnixTimeSeconds().ToString();
        return new()
        {
            "",
            "garbage",
            "123.456.789",
            $"{past}.{Sign(past, ApiFactory.Password)}",          // expired
            $"{future}.{Sign(future, "another-password")}",       // signed with a different password
            $"{future}.{Sign(past, ApiFactory.Password)}",        // signature of another expiry
            AdminToken.Create(ApiFactory.Password) + "0",          // tampered
        };
    }

    [Theory, MemberData(nameof(BadTokens))]
    public async Task Bad_tokens_fail_verify_and_cannot_write(string token)
    {
        await Status(HttpStatusCode.Unauthorized, Guest.PostAsJsonAsync("/api/auth/verify", new { token }));
        var client = Api.Guest();
        client.DefaultRequestHeaders.TryAddWithoutValidation("Authorization", $"Bearer {token}");
        await Status(HttpStatusCode.Unauthorized, client.PatchAsync("/api/games/1/favourite", null));
    }

    [Fact]
    public void Tokens_expire_after_seven_days()
    {
        var token = AdminToken.Create(ApiFactory.Password);
        var expiry = DateTimeOffset.FromUnixTimeSeconds(long.Parse(token.Split('.')[0]));
        Assert.InRange(expiry, DateTimeOffset.UtcNow.AddDays(7).AddMinutes(-1), DateTimeOffset.UtcNow.AddDays(7).AddMinutes(1));
        Assert.True(AdminToken.IsValid(token, ApiFactory.Password));
        Assert.False(AdminToken.IsValid(token, "changed-password")); // changing the password logs everyone out
    }

    public static TheoryData<string, string> Writes() => new()
    {
        { "POST", "/api/games" },
        { "PUT", "/api/games/1" },
        { "PATCH", "/api/games/bulk" },
        { "POST", "/api/games/1/entries" },
        { "PUT", "/api/games/1/entries/1" },
        { "DELETE", "/api/games/1/entries/1" },
        { "PATCH", "/api/games/1/favourite" },
        { "DELETE", "/api/games/1" },
        { "POST", "/api/steam/sync" },
        { "GET", "/api/search?q=halo" }, // a read, but it spends the IGDB quota
    };

    [Theory, MemberData(nameof(Writes))]
    public async Task Writes_need_the_admin_token(string method, string path)
    {
        var request = new HttpRequestMessage(new HttpMethod(method), path) { Content = JsonContent.Create(new { }) };
        await Status(HttpStatusCode.Unauthorized, Guest.SendAsync(request));
        Assert.Empty(Api.Http.Calls); // rejected before reaching Steam or IGDB
    }

    [Theory]
    [InlineData("/api/games")]
    [InlineData("/api/games?status=Playing")]
    [InlineData("/api/platforms")]
    [InlineData("/api/steam/status")]
    public async Task Reads_are_public(string path)
    {
        await Status(HttpStatusCode.OK, Guest.GetAsync(path));
    }

    [Fact]
    public async Task A_rejected_write_still_has_CORS_headers_so_the_browser_can_read_the_401()
    {
        var request = new HttpRequestMessage(HttpMethod.Delete, "/api/games/1") { Headers = { { "Origin", "https://mittsmods.com" } } };
        var res = await Guest.SendAsync(request);
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
        Assert.Equal("https://mittsmods.com", res.Headers.GetValues("Access-Control-Allow-Origin").Single());
    }

    [Fact]
    public async Task Other_websites_get_no_CORS_access()
    {
        var request = new HttpRequestMessage(HttpMethod.Get, "/api/games") { Headers = { { "Origin", "https://evil.example" } } };
        var res = await Guest.SendAsync(request);
        Assert.False(res.Headers.Contains("Access-Control-Allow-Origin"));
    }

    private static string Sign(string payload, string secret) =>
        Convert.ToHexString(HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes(payload)));
}
