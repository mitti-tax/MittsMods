using System.Net;
using MittsModsApi.DTOs;

namespace MittsModsApi.Tests;

public class SearchTests(ApiFactory api) : ApiTest(api)
{
    private static readonly object[] Halo =
    [
        new
        {
            id = 740, name = "Halo: Combat Evolved", summary = "Ring world",
            cover = new { url = "//images.igdb.com/igdb/image/upload/t_thumb/co2.jpg" },
            first_release_date = new DateTimeOffset(2001, 11, 15, 0, 0, 0, TimeSpan.Zero).ToUnixTimeSeconds(),
            genres = new[] { new { name = "Shooter" } },
            involved_companies = new object[]
            {
                new { developer = true, company = new { name = "Bungie" } },
                new { developer = false, company = new { name = "Microsoft" } },
            },
            platforms = new[] { new { name = "Xbox", abbreviation = "XBOX" }, new { name = "PC (Microsoft Windows)", abbreviation = "PC" } },
        },
        new { id = 741, name = "Halo 2" }, // IGDB leaves out fields it has nothing for
    ];

    [Fact]
    public async Task Search_maps_IGDB_results()
    {
        Api.Http.On("api.igdb.com/v4/games", Halo);

        var results = await Ok<List<IgdbGameResult>>(await Admin.GetAsync("/api/search?q=halo"));

        Assert.Equal(2, results.Count);
        var r = results[0];
        Assert.Equal((740, "Halo: Combat Evolved", "Ring world", 2001), (r.Id, r.Name, r.Summary, r.ReleaseYear));
        Assert.Equal("https://images.igdb.com/igdb/image/upload/t_cover_big/co2.jpg", r.CoverUrl);
        Assert.Equal(["Shooter"], r.Genres);
        Assert.Equal(["Bungie"], r.Developers); // publishers left out
        Assert.Equal(["Xbox", "PC (Microsoft Windows)"], r.Platforms);
        Assert.Equal((null, null, 0), (results[1].CoverUrl, results[1].ReleaseYear, results[1].Genres.Count));
    }

    [Fact]
    public async Task Search_sends_the_client_id_and_token()
    {
        Api.Http.On("api.igdb.com/v4/games", Halo);
        await Ok<List<IgdbGameResult>>(await Admin.GetAsync("/api/search?q=halo"));
        Assert.Contains("grant_type=client_credentials", Api.Http.Calls[0].Url);
        Assert.Contains("search \"halo\";", Api.Http.Calls[1].Body);
    }

    [Fact]
    public async Task Quotes_in_a_search_cannot_break_the_IGDB_query()
    {
        Api.Http.On("api.igdb.com/v4/games", Array.Empty<object>());
        await Ok<List<IgdbGameResult>>(await Admin.GetAsync("/api/search?q=" + Uri.EscapeDataString("\"Halo\"; limit 500; \\")));
        Assert.Contains("search \"Halo; limit 500; \";", Api.Http.Calls.Last().Body);
    }

    [Fact]
    public async Task Repeat_searches_come_from_the_cache()
    {
        Api.Http.On("api.igdb.com/v4/games", Halo);
        await Ok<List<IgdbGameResult>>(await Admin.GetAsync("/api/search?q=Halo"));
        var again = await Ok<List<IgdbGameResult>>(await Admin.GetAsync("/api/search?q=%20halo%20"));

        Assert.Equal(2, again.Count);
        Assert.Equal(1, Api.Http.CallsTo("v4/games"));
        Assert.Equal(1, Api.Http.CallsTo("oauth2/token")); // the token is reused too
    }

    [Fact]
    public async Task An_expired_IGDB_token_is_replaced_and_the_search_retried_once()
    {
        var calls = 0;
        Api.Http.On("api.igdb.com/v4/games", _ => Task.FromResult(++calls == 1
            ? new HttpResponseMessage(HttpStatusCode.Unauthorized)
            : new HttpResponseMessage(HttpStatusCode.OK) { Content = System.Net.Http.Json.JsonContent.Create(Halo) }));

        var results = await Ok<List<IgdbGameResult>>(await Admin.GetAsync("/api/search?q=halo"));

        Assert.Equal(2, results.Count);
        Assert.Equal(2, Api.Http.CallsTo("oauth2/token"));
    }

    [Fact]
    public async Task A_token_that_keeps_failing_is_not_retried_forever()
    {
        Api.Http.On("api.igdb.com/v4/games", new { }, HttpStatusCode.Unauthorized);
        var res = await Admin.GetAsync("/api/search?q=halo");
        Assert.False(res.IsSuccessStatusCode);
        Assert.Equal(2, Api.Http.CallsTo("v4/games"));
    }

    [Theory]
    [InlineData("/api/search?q=a")]
    [InlineData("/api/search?q=%20%20")]
    [InlineData("/api/search")]
    public async Task Search_needs_at_least_two_characters(string path)
    {
        await Status(HttpStatusCode.BadRequest, Admin.GetAsync(path));
        Assert.Empty(Api.Http.Calls);
    }
}
