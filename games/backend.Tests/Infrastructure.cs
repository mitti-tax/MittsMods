using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Http;
using MittsModsApi.Controllers;
using MittsModsApi.Data;
using MittsModsApi.DTOs;
using Testcontainers.PostgreSql;

namespace MittsModsApi.Tests;

// One real Postgres (in Docker, same major version as production) and one in-memory API for the
// whole run. Every outgoing HTTP call (Steam, IGDB, Twitch) goes to FakeHttp, never the internet.
public class ApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    public const string Password = "test-password";
    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder("postgres:17").Build();
    public FakeHttp Http { get; } = new();

    public async Task InitializeAsync()
    {
        await _postgres.StartAsync();
        // program.cs reads DATABASE_URL straight from the environment
        Environment.SetEnvironmentVariable("DATABASE_URL", _postgres.GetConnectionString());
    }

    async Task IAsyncLifetime.DisposeAsync()
    {
        await DisposeAsync();
        await _postgres.DisposeAsync();
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseSetting("AdminPassword", Password);
        builder.UseSetting("Steam:ApiKey", ""); // keeps SteamSyncJob off; tests sync through the endpoint
        builder.ConfigureTestServices(s => s.ConfigureAll<HttpClientFactoryOptions>(o =>
            o.HttpMessageHandlerBuilderActions.Add(b => b.PrimaryHandler = Http)));
    }

    public HttpClient Guest() => CreateClient();

    public HttpClient Admin()
    {
        var client = CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", AdminToken.Create(Password));
        return client;
    }

    // Empty library (the seeded platforms stay), no fake routes, empty IGDB token/search cache
    public async Task Reset()
    {
        await Sql("""TRUNCATE "StatusChanges", "UserEntries", "Games" RESTART IDENTITY CASCADE""");
        ((MemoryCache)Services.GetRequiredService<IMemoryCache>()).Clear();
        Http.Reset();
    }

    public async Task Sql(string sql)
    {
        using var scope = Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.ExecuteSqlRawAsync(sql);
    }

    public async Task<T> Db<T>(Func<AppDbContext, Task<T>> query)
    {
        using var scope = Services.CreateScope();
        return await query(scope.ServiceProvider.GetRequiredService<AppDbContext>());
    }
}

// Stands in for Steam, IGDB and Twitch. Routes match on a piece of the URL; the newest route wins.
// An unmatched call gets a 500, like an outage, so a test never depends on a call it didn't set up.
public class FakeHttp : HttpMessageHandler
{
    private readonly ConcurrentQueue<(string Url, string Body)> _calls = new();
    private readonly List<(string UrlPart, Func<HttpRequestMessage, Task<HttpResponseMessage>> Respond)> _routes = [];

    public (string Url, string Body)[] Calls => _calls.ToArray();
    public int CallsTo(string urlPart) => Calls.Count(c => c.Url.Contains(urlPart));

    public void Reset()
    {
        _calls.Clear();
        lock (_routes) _routes.Clear();
        On("id.twitch.tv/oauth2/token", new { access_token = "igdb-token", expires_in = 3600 });
    }

    public void On(string urlPart, object json, HttpStatusCode status = HttpStatusCode.OK) =>
        On(urlPart, _ => Task.FromResult(new HttpResponseMessage(status) { Content = JsonContent.Create(json) }));

    public void On(string urlPart, Func<HttpRequestMessage, Task<HttpResponseMessage>> respond)
    {
        lock (_routes) _routes.Insert(0, (urlPart, respond));
    }

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
    {
        var url = request.RequestUri!.ToString();
        _calls.Enqueue((url, request.Content == null ? "" : await request.Content.ReadAsStringAsync(ct)));
        Func<HttpRequestMessage, Task<HttpResponseMessage>>? respond;
        lock (_routes) respond = _routes.FirstOrDefault(r => url.Contains(r.UrlPart)).Respond;
        return respond != null ? await respond(request) : new HttpResponseMessage(HttpStatusCode.InternalServerError);
    }

    // Shared by every HttpClient; the client factory would otherwise dispose it when a client expires
    protected override void Dispose(bool disposing) { }
}

[CollectionDefinition("api")]
public class ApiCollection : ICollectionFixture<ApiFactory>;

// Tests share one database, so they run one at a time (one collection) and each starts empty
[Collection("api")]
public abstract class ApiTest(ApiFactory api) : IAsyncLifetime
{
    protected readonly ApiFactory Api = api;
    protected readonly HttpClient Guest = api.Guest();
    protected readonly HttpClient Admin = api.Admin();

    public Task InitializeAsync() => Api.Reset();
    public Task DisposeAsync() => Task.CompletedTask;

    protected const int PC = 1, Xbox360 = 3, PS2 = 7;

    protected static async Task<T> Ok<T>(HttpResponseMessage res)
    {
        Assert.True(res.IsSuccessStatusCode, $"{(int)res.StatusCode}: {await res.Content.ReadAsStringAsync()}");
        return (await res.Content.ReadFromJsonAsync<T>())!;
    }

    protected static async Task Status(HttpStatusCode expected, Task<HttpResponseMessage> request)
    {
        var res = await request;
        Assert.True(res.StatusCode == expected, $"Expected {(int)expected}, got {(int)res.StatusCode}: {await res.Content.ReadAsStringAsync()}");
    }

    protected async Task<GameDto> CreateGame(string title = "Halo 2", string status = "Backlog", int platformId = Xbox360,
        int? igdbId = null, int? steamAppId = null) =>
        await Ok<GameDto>(await Admin.PostAsJsonAsync("/api/games", new
        {
            title, igdbId, steamAppId,
            entry = new { platformId, status }
        }));

    protected async Task<GameDto> GetGame(int id) => await Ok<GameDto>(await Admin.GetAsync($"/api/games/{id}"));

    protected async Task<List<GameDto>> GetGames(HttpClient client, string query = "") =>
        await Ok<List<GameDto>>(await client.GetAsync($"/api/games{query}"));
}
