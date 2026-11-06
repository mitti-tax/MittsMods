using System.Net;
using System.Net.Http.Json;
using MittsModsApi.DTOs;

namespace MittsModsApi.Tests;

public class SteamSyncTests(ApiFactory api) : ApiTest(api)
{
    // One game as Steam's GetOwnedGames lists it
    internal static object Owned(int appId, string name, int minutes = 0, DateTime? lastPlayed = null, int minutesLastTwoWeeks = 0) => new
    {
        appid = appId, name, playtime_forever = minutes, playtime_2weeks = minutesLastTwoWeeks,
        rtime_last_played = lastPlayed is { } d ? new DateTimeOffset(d).ToUnixTimeSeconds() : 0,
    };

    internal static void Library(ApiFactory api, params object[] games) =>
        api.Http.On("IPlayerService/GetOwnedGames", new { response = new { game_count = games.Length, games } });

    private void Library(params object[] games) => Library(Api, games);

    private async Task<SteamSyncResult> Sync() => await Ok<SteamSyncResult>(await Admin.PostAsync("/api/steam/sync", null));

    private async Task<GameDto> Game(string title) => (await GetGames(Admin)).Single(g => g.Title == title);

    // Puts a never-played Steam game in the library, for tests elsewhere that need a Steam entry
    internal static async Task<GameDto> ImportOne(ApiFactory api, HttpClient admin, string name, int appId)
    {
        Library(api, Owned(appId, name));
        await Ok<SteamSyncResult>(await admin.PostAsync("/api/steam/sync", null));
        return (await Ok<List<GameDto>>(await admin.GetAsync("/api/games"))).Single(g => g.SteamAppId == appId);
    }

    // Backdates every status change of a game, as if it happened that many days ago
    private Task Backdate(int gameId, int days) => Api.Sql($"""
        UPDATE "StatusChanges" SET "ChangedAt" = now() - interval '{days} days'
        WHERE "UserEntryId" IN (SELECT "Id" FROM "UserEntries" WHERE "GameId" = {gameId})
        """);

    private static readonly DateTime Now = DateTime.UtcNow;

    // ---- Importing ----

    [Fact]
    public async Task New_games_come_in_as_Playing_only_if_played_in_the_last_two_weeks()
    {
        Library(
            Owned(1, "Two week playtime", minutes: 600, lastPlayed: Now.AddDays(-1), minutesLastTwoWeeks: 90),
            Owned(2, "Short launch", minutes: 600, lastPlayed: Now.AddDays(-3)),   // too short for playtime_2weeks
            Owned(3, "Old favourite", minutes: 6000, lastPlayed: Now.AddDays(-15)),
            Owned(4, "Never launched"));

        var result = await Sync();

        Assert.Equal((4, 0, 0, 0, 0), (result.Added, result.Updated, result.Skipped, result.MovedToPlaying, result.MovedToBacklog));
        Assert.Equal(["Old favourite", "Two week playtime", "Short launch", "Never launched"], result.Games); // most played first
        Assert.Equal("Playing", (await Game("Two week playtime")).UserEntries[0].Status);
        Assert.Equal("Playing", (await Game("Short launch")).UserEntries[0].Status);
        Assert.Equal("Backlog", (await Game("Old favourite")).UserEntries[0].Status);
        Assert.Equal("Backlog", (await Game("Never launched")).UserEntries[0].Status);
    }

    [Fact]
    public async Task Imported_games_are_PC_Steam_entries_with_hours_and_last_played()
    {
        var lastPlayed = new DateTime(2026, 1, 2, 3, 4, 5, DateTimeKind.Utc);
        Library(Owned(220, "Half-Life 2", minutes: 125, lastPlayed: lastPlayed));

        await Sync();

        var game = await Game("Half-Life 2");
        var e = game.UserEntries.Single();
        Assert.Equal((220, "PC", "Steam", 2.1m, lastPlayed), (game.SteamAppId, e.PlatformName, e.Source, e.HoursPlayed, e.LastPlayedAt));
        Assert.Equal("https://cdn.akamai.steamstatic.com/steam/apps/220/library_600x900.jpg", game.CoverUrl);
        Assert.Equal(["Backlog"], e.History.Select(h => h.Status));
    }

    [Fact]
    public async Task Imported_games_get_details_from_their_exact_IGDB_match()
    {
        Library(Owned(220, "Half-Life 2"), Owned(221, "Unknown To IGDB"));
        Api.Http.On("external_games", new[]
        {
            new
            {
                uid = "220",
                game = new
                {
                    id = 233, name = "Half-Life 2", summary = "Gordon again",
                    cover = new { url = "//images.igdb.com/igdb/image/upload/t_thumb/co1.jpg" },
                    first_release_date = new DateTimeOffset(2004, 11, 16, 0, 0, 0, TimeSpan.Zero).ToUnixTimeSeconds(),
                    genres = new[] { new { name = "Shooter" }, new { name = "Adventure" } },
                    involved_companies = new object[]
                    {
                        new { developer = false, company = new { name = "Sierra" } },
                        new { developer = true, company = new { name = "Valve" } },
                    },
                },
            },
        });
        Api.Http.On("game_time_to_beats", new[] { new { game_id = 233, normally = 13 * 3600 } });

        await Sync();

        var hl2 = await Game("Half-Life 2");
        Assert.Equal((233, "Shooter", "Valve", 2004, "Gordon again", 13),
            (hl2.IgdbId, hl2.Genre, hl2.Developer, hl2.ReleaseYear, hl2.Summary, hl2.TimeToBeatHours));
        Assert.Equal("https://images.igdb.com/igdb/image/upload/t_cover_big/co1.jpg", hl2.CoverUrl);

        // No match means no details: better blank than another game's
        var unknown = await Game("Unknown To IGDB");
        Assert.Equal((null, null, null), (unknown.IgdbId, unknown.Genre, unknown.TimeToBeatHours));
        Assert.Contains("/221/", unknown.CoverUrl);

        var lookup = Api.Http.Calls.Single(c => c.Url.EndsWith("external_games")).Body;
        Assert.Contains("""where uid = ("220","221") & external_game_source = 1""", lookup);
    }

    [Fact]
    public async Task Time_to_beat_skips_junk_and_falls_back_to_hastily()
    {
        Library(Owned(1, "Sandbox"), Owned(2, "Short"), Owned(3, "Hasty only"));
        Api.Http.On("external_games", new[]
        {
            new { uid = "1", game = new { id = 11, name = "Sandbox" } },
            new { uid = "2", game = new { id = 12, name = "Short" } },
            new { uid = "3", game = new { id = 13, name = "Hasty only" } },
        });
        Api.Http.On("game_time_to_beats", new object[]
        {
            new { game_id = 11, normally = 33501 * 3600 },    // player-reported nonsense
            new { game_id = 12, normally = 600 },             // 10 minutes rounds up to 1 hour
            new { game_id = 13, hastily = 4 * 3600 },
        });

        await Sync();

        Assert.Null((await Game("Sandbox")).TimeToBeatHours);
        Assert.Equal(1, (await Game("Short")).TimeToBeatHours);
        Assert.Equal(4, (await Game("Hasty only")).TimeToBeatHours);
    }

    [Fact]
    public async Task A_sync_still_imports_when_IGDB_is_down()
    {
        Library(Owned(1, "Game"));
        // no IGDB routes: every IGDB call fails
        var result = await Sync();
        Assert.Equal(1, result.Added);
        Assert.Null((await Game("Game")).IgdbId);
    }

    [Fact]
    public async Task Missing_time_to_beat_is_filled_in_on_a_later_sync()
    {
        Library(Owned(1, "Game"));
        Api.Http.On("external_games", new[] { new { uid = "1", game = new { id = 11, name = "Game" } } });
        await Sync(); // time to beat lookup fails
        Assert.Null((await Game("Game")).TimeToBeatHours);

        Api.Http.On("game_time_to_beats", new[] { new { game_id = 11, normally = 8 * 3600 } });
        await Sync();

        Assert.Equal(8, (await Game("Game")).TimeToBeatHours);
        Assert.Equal(1, Api.Http.CallsTo("external_games")); // known games aren't looked up again
    }

    [Fact]
    public async Task Details_edited_by_hand_are_never_overwritten()
    {
        var game = await ImportOne(Api, Admin, "Steam Name", 1);
        await Ok<GameDto>(await Admin.PutAsJsonAsync($"/api/games/{game.Id}", new { title = "My Name", genre = "Mine" }));
        Library(Owned(1, "Steam Name", minutes: 60));

        await Sync();

        var after = await GetGame(game.Id);
        Assert.Equal(("My Name", "Mine", 1m), (after.Title, after.Genre, after.UserEntries[0].HoursPlayed));
    }

    [Fact]
    public async Task Achievements_are_counted_for_new_games_and_games_played_since_the_last_sync()
    {
        Api.Http.On("GetPlayerAchievements/v1/?key=&steamid=&appid=1", new
        {
            playerstats = new { achievements = new[] { new { achieved = 1 }, new { achieved = 1 }, new { achieved = 0 } } }
        });
        Library(Owned(1, "With achievements", minutes: 60), Owned(2, "Without"));

        await Sync();

        var e = (await Game("With achievements")).UserEntries[0];
        Assert.Equal((2, 3), (e.AchievementsEarned, e.AchievementsTotal));
        Assert.Null((await Game("Without")).UserEntries[0].AchievementsTotal); // the 500 is shrugged off
        Assert.Equal(2, Api.Http.CallsTo("GetPlayerAchievements"));

        await Sync(); // nothing played: no achievement calls
        Assert.Equal(2, Api.Http.CallsTo("GetPlayerAchievements"));

        Library(Owned(1, "With achievements", minutes: 120), Owned(2, "Without"));
        await Sync();
        Assert.Equal(3, Api.Http.CallsTo("GetPlayerAchievements"));
    }

    [Fact]
    public async Task A_sync_with_nothing_new_changes_nothing()
    {
        Library(Owned(1, "Game", minutes: 60, lastPlayed: Now.AddDays(-30)));
        await Sync();
        var before = await Game("Game");

        var result = await Sync();

        Assert.Equal((0, 0, 0, 0), (result.Added, result.Updated, result.MovedToPlaying, result.MovedToBacklog));
        var after = await Game("Game");
        Assert.Equal(before.UserEntries[0].UpdatedAt, after.UserEntries[0].UpdatedAt); // "recently updated" stays honest
        Assert.Single(await GetGames(Admin));
    }

    [Fact]
    public async Task New_playtime_updates_hours()
    {
        Library(Owned(1, "Game", minutes: 60, lastPlayed: Now.AddDays(-30)));
        await Sync();
        Library(Owned(1, "Game", minutes: 150, lastPlayed: Now.AddDays(-20)));

        var result = await Sync();

        Assert.Equal(1, result.Updated);
        var e = (await Game("Game")).UserEntries[0];
        Assert.Equal(2.5m, e.HoursPlayed);
        Assert.Equal(Now.AddDays(-20), e.LastPlayedAt!.Value, TimeSpan.FromSeconds(1)); // Steam has whole seconds
    }

    [Fact]
    public async Task Hidden_games_are_not_added_again()
    {
        var game = await ImportOne(Api, Admin, "Unwanted", 1);
        await Status(HttpStatusCode.NoContent, Admin.DeleteAsync($"/api/games/{game.Id}"));

        var result = await Sync();

        Assert.Equal(0, result.Added);
        Assert.True((await GetGame(game.Id)).IsHidden);
    }

    [Fact]
    public async Task A_game_added_by_hand_with_a_Steam_id_is_skipped()
    {
        await CreateGame("Added by hand", platformId: PC, steamAppId: 1);
        Library(Owned(1, "Steam name", minutes: 60, lastPlayed: Now));

        var result = await Sync();

        Assert.Equal((0, 1), (result.Added, result.Skipped));
        Assert.Equal("Backlog", (await Game("Added by hand")).UserEntries[0].Status);
    }

    [Fact]
    public async Task A_private_Steam_profile_imports_nothing()
    {
        Api.Http.On("IPlayerService/GetOwnedGames", new { response = new { } });
        var result = await Sync();
        Assert.Equal(0, result.Added);
    }

    [Fact]
    public async Task A_Steam_outage_fails_the_sync_and_changes_nothing()
    {
        await CreateGame();
        var res = await Admin.PostAsync("/api/steam/sync", null); // no Steam route: 500 from Steam
        Assert.False(res.IsSuccessStatusCode);
        Assert.Single(await GetGames(Admin));

        Library(Owned(1, "Game"));
        Assert.Equal(1, (await Sync()).Added); // the lock was released
    }

    [Fact]
    public async Task Only_one_sync_runs_at_a_time()
    {
        var steamCalled = new TaskCompletionSource();
        var release = new TaskCompletionSource();
        Api.Http.On("IPlayerService/GetOwnedGames", async _ =>
        {
            steamCalled.SetResult();
            await release.Task;
            return new HttpResponseMessage(HttpStatusCode.OK) { Content = JsonContent.Create(new { response = new { games = new[] { Owned(1, "Game") } } }) };
        });

        var first = Admin.PostAsync("/api/steam/sync", null);
        await steamCalled.Task;
        await Status(HttpStatusCode.Conflict, Admin.PostAsync("/api/steam/sync", null));
        release.SetResult();

        Assert.Equal(1, (await Ok<SteamSyncResult>(await first)).Added);
        Assert.Single(await GetGames(Admin));
    }

    [Fact]
    public async Task Status_reports_when_the_last_sync_finished()
    {
        Library(Owned(1, "Game"));
        await Sync();

        var status = await Ok<SteamStatus>(await Guest.GetAsync("/api/steam/status"));

        Assert.NotNull(status.LastSyncedAt);
        Assert.InRange(status.LastSyncedAt.Value, DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddMinutes(1));
    }

    // ---- Playing <-> Backlog ----

    [Theory]
    [InlineData("Backlog")]
    [InlineData("Wishlist")]
    public async Task A_game_played_lately_moves_to_Playing(string from)
    {
        var game = await ImportOne(Api, Admin, "Game", 1);
        await Ok<List<GameDto>>(await Admin.PatchAsJsonAsync("/api/games/bulk", new { ids = new[] { game.Id }, status = from }));
        Library(Owned(1, "Game", minutes: 30, lastPlayed: Now.AddHours(-2), minutesLastTwoWeeks: 30));

        var result = await Sync();

        Assert.Equal(1, result.MovedToPlaying);
        var e = (await GetGame(game.Id)).UserEntries[0];
        Assert.Equal("Playing", e.Status);
        Assert.NotNull(e.StartedAt);
        Assert.Equal("Playing", e.History.Last().Status);
    }

    [Theory]
    [InlineData("Completed")]
    [InlineData("Dropped")]
    [InlineData("OnHold")]
    public async Task A_status_set_by_hand_is_left_alone_when_played(string status)
    {
        var game = await ImportOne(Api, Admin, "Game", 1);
        await Ok<List<GameDto>>(await Admin.PatchAsJsonAsync("/api/games/bulk", new { ids = new[] { game.Id }, status }));
        Library(Owned(1, "Game", minutes: 30, lastPlayed: Now, minutesLastTwoWeeks: 30));

        await Sync();

        Assert.Equal(status, (await GetGame(game.Id)).UserEntries[0].Status);
    }

    [Fact]
    public async Task A_Playing_game_not_played_for_two_weeks_moves_back_to_Backlog()
    {
        Library(Owned(1, "Game", minutes: 600, lastPlayed: Now.AddDays(-1), minutesLastTwoWeeks: 60));
        await Sync();
        var game = await Game("Game");
        Assert.Equal("Playing", game.UserEntries[0].Status);
        await Backdate(game.Id, 20);
        Library(Owned(1, "Game", minutes: 600, lastPlayed: Now.AddDays(-15)));

        var result = await Sync();

        Assert.Equal(1, result.MovedToBacklog);
        var e = (await GetGame(game.Id)).UserEntries[0];
        Assert.Equal("Backlog", e.Status);
        Assert.Equal(["Playing", "Backlog"], e.History.Select(h => h.Status));
        Assert.NotNull(e.StartedAt); // when it was started stays on record
    }

    [Fact]
    public async Task A_never_launched_Playing_game_moves_back_to_Backlog()
    {
        var game = await ImportOne(Api, Admin, "Game", 1);
        await Ok<List<GameDto>>(await Admin.PatchAsJsonAsync("/api/games/bulk", new { ids = new[] { game.Id }, status = "Playing" }));
        await Backdate(game.Id, 15);

        Assert.Equal(1, (await Sync()).MovedToBacklog);
        Assert.Equal("Backlog", (await GetGame(game.Id)).UserEntries[0].Status);
    }

    [Fact]
    public async Task A_game_set_to_Playing_by_hand_gets_two_weeks_before_moving_back()
    {
        // Last played a month ago, but just set to Playing: you're about to pick it up again
        Library(Owned(1, "Game", minutes: 600, lastPlayed: Now.AddDays(-30)));
        await Sync();
        var game = await Game("Game");
        await Ok<List<GameDto>>(await Admin.PatchAsJsonAsync("/api/games/bulk", new { ids = new[] { game.Id }, status = "Playing" }));
        await Api.Sql("""UPDATE "StatusChanges" SET "ChangedAt" = now() - interval '13 days' WHERE "Status" = 'Playing'""");

        Assert.Equal(0, (await Sync()).MovedToBacklog);
        Assert.Equal("Playing", (await GetGame(game.Id)).UserEntries[0].Status);

        await Api.Sql("""UPDATE "StatusChanges" SET "ChangedAt" = now() - interval '15 days' WHERE "Status" = 'Playing'""");
        Assert.Equal(1, (await Sync()).MovedToBacklog);
    }

    [Fact]
    public async Task A_Playing_game_played_lately_stays_Playing()
    {
        Library(Owned(1, "Game", minutes: 600, lastPlayed: Now.AddDays(-1), minutesLastTwoWeeks: 60));
        await Sync();
        var game = await Game("Game");
        await Backdate(game.Id, 60); // started long ago, still going
        Library(Owned(1, "Game", minutes: 660, lastPlayed: Now.AddDays(-2)));

        var result = await Sync();

        Assert.Equal((0, 0), (result.MovedToPlaying, result.MovedToBacklog));
        Assert.Equal("Playing", (await GetGame(game.Id)).UserEntries[0].Status);
    }

    [Fact]
    public async Task Only_the_Steam_entry_is_moved()
    {
        var game = await ImportOne(Api, Admin, "Game", 1);
        await Ok<List<GameDto>>(await Admin.PatchAsJsonAsync("/api/games/bulk", new { ids = new[] { game.Id }, status = "Playing" }));
        await Ok<GameDto>(await Admin.PostAsJsonAsync($"/api/games/{game.Id}/entries", new { platformId = PS2, status = "Playing" }));
        await Backdate(game.Id, 30);

        await Sync();

        Assert.Equal(["Backlog", "Playing"], (await GetGame(game.Id)).UserEntries.Select(e => e.Status));
    }
}
