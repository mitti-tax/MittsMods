using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using MittsModsApi.DTOs;
using MittsModsApi.Models;

namespace MittsModsApi.Tests;

public class GamesTests(ApiFactory api) : ApiTest(api)
{
    // Every field of an entry, as the frontend sends it (PUT replaces the entry)
    private static object EntryBody(UserEntryDto e, object? changes = null)
    {
        var body = new Dictionary<string, object?>
        {
            ["platformId"] = e.PlatformId, ["status"] = e.Status, ["hoursPlayed"] = e.HoursPlayed,
            ["rating"] = e.Rating, ["notes"] = e.Notes, ["achievementsEarned"] = e.AchievementsEarned,
            ["achievementsTotal"] = e.AchievementsTotal, ["mode"] = e.Mode, ["hardware"] = e.Hardware,
            ["startedAt"] = e.StartedAt, ["completedAt"] = e.CompletedAt,
        };
        foreach (var p in changes?.GetType().GetProperties() ?? [])
            body[p.Name] = p.GetValue(changes);
        return body;
    }

    private async Task<GameDto> UpdateEntry(GameDto g, object changes, int index = 0) =>
        await Ok<GameDto>(await Admin.PutAsJsonAsync($"/api/games/{g.Id}/entries/{g.UserEntries[index].Id}",
            EntryBody(g.UserEntries[index], changes)));

    private Task<GameDto> SteamGame(string name = "Portal 2", int appId = 620) =>
        SteamSyncTests.ImportOne(Api, Admin, name, appId);

    // ---- Reading ----

    [Fact]
    public async Task Games_come_back_sorted_by_title_with_their_entries()
    {
        await CreateGame("Zelda", platformId: PS2);
        await CreateGame("Advance Wars", status: "Playing");

        var games = await GetGames(Guest);

        Assert.Equal(["Advance Wars", "Zelda"], games.Select(g => g.Title));
        var entry = games[0].UserEntries.Single();
        Assert.Equal(("Xbox 360", "Playing", "Manual", "Original"), (entry.PlatformName, entry.Status, entry.Source, entry.Hardware));
    }

    [Fact]
    public async Task Status_filter_returns_games_with_an_entry_in_that_status()
    {
        var both = await CreateGame("Both", "Backlog");
        await Ok<GameDto>(await Admin.PostAsJsonAsync($"/api/games/{both.Id}/entries", new { platformId = PS2, status = "Playing" }));
        await CreateGame("Backlog only", "Backlog");
        await CreateGame("Playing only", "Playing");

        var playing = await GetGames(Guest, "?status=Playing");

        Assert.Equal(["Both", "Playing only"], playing.Select(g => g.Title));
    }

    [Theory]
    [InlineData("Bogus")]
    [InlineData("1")]     // a number parses as an enum value, but isn't a status name
    [InlineData("99")]
    [InlineData("playing")]
    public async Task Unknown_status_filter_is_a_400(string status)
    {
        await Status(HttpStatusCode.BadRequest, Guest.GetAsync($"/api/games?status={status}"));
    }

    [Fact]
    public async Task Hidden_games_are_only_visible_to_the_admin()
    {
        var hidden = await CreateGame("Hidden");
        await CreateGame("Shown");
        await Ok<List<GameDto>>(await Admin.PatchAsJsonAsync("/api/games/bulk", new { ids = new[] { hidden.Id }, hidden = true }));

        Assert.Equal(["Shown"], (await GetGames(Guest)).Select(g => g.Title));
        Assert.Equal(["Hidden", "Shown"], (await GetGames(Admin)).Select(g => g.Title));
        await Status(HttpStatusCode.NotFound, Guest.GetAsync($"/api/games/{hidden.Id}"));
        Assert.True((await GetGame(hidden.Id)).IsHidden);
    }

    [Fact]
    public async Task Missing_game_is_a_404()
    {
        await Status(HttpStatusCode.NotFound, Guest.GetAsync("/api/games/12345"));
    }

    [Fact]
    public async Task Platforms_are_seeded()
    {
        var platforms = await Ok<List<Platform>>(await Guest.GetAsync("/api/platforms"));

        Assert.Equal(27, platforms.Count);
        Assert.Contains(platforms, p => p is { Id: 1, Name: "PC", Abbreviation: "PC" });
    }

    // ---- Creating ----

    [Fact]
    public async Task Create_stores_the_game_and_its_first_entry()
    {
        var res = await Admin.PostAsJsonAsync("/api/games", new
        {
            title = "  Shenmue  ", genre = "Adventure", releaseYear = 1999, developer = "Sega AM2",
            entry = new { platformId = 26, status = "Completed", hoursPlayed = 30.5, rating = 9, notes = "Forklifts",
                          mode = "CRT", hardware = "Modded" }
        });
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        var game = await res.Content.ReadFromJsonAsync<GameDto>();

        Assert.Equal($"/api/games/{game!.Id}", res.Headers.Location!.AbsolutePath, ignoreCase: true);
        Assert.Equal(("Shenmue", "Adventure", 1999, "Sega AM2"), (game.Title, game.Genre, game.ReleaseYear, game.Developer));
        var e = game.UserEntries.Single();
        Assert.Equal(("Sega Dreamcast", "Completed", 30.5m, 9, "Forklifts", "CRT", "Modded"),
            (e.PlatformName, e.Status, e.HoursPlayed, e.Rating, e.Notes, e.Mode, e.Hardware));
        Assert.NotNull(e.CompletedAt); // filled in by the status
        Assert.Null(e.StartedAt);
        Assert.Equal(["Completed"], e.History.Select(h => h.Status));
    }

    [Fact]
    public async Task Create_as_Playing_fills_the_start_date()
    {
        var e = (await CreateGame(status: "Playing")).UserEntries.Single();
        Assert.NotNull(e.StartedAt);
        Assert.Null(e.CompletedAt);
    }

    [Fact]
    public async Task Create_keeps_dates_given_by_the_user()
    {
        var started = new DateTime(2020, 5, 1, 12, 0, 0, DateTimeKind.Utc);
        var game = await Ok<GameDto>(await Admin.PostAsJsonAsync("/api/games", new
        {
            title = "Okami", entry = new { platformId = PS2, status = "Playing", startedAt = started }
        }));
        Assert.Equal(started, game.UserEntries.Single().StartedAt);
    }

    [Fact]
    public async Task Create_looks_up_time_to_beat_for_an_IGDB_game()
    {
        Api.Http.On("game_time_to_beats", new[] { new { game_id = 42, normally = 10 * 3600 } });

        var game = await CreateGame(igdbId: 42);

        Assert.Equal(10, game.TimeToBeatHours);
        Assert.Contains("where game_id = (42)", Api.Http.Calls.Single(c => c.Url.EndsWith("game_time_to_beats")).Body);
    }

    [Fact]
    public async Task Create_still_works_when_IGDB_is_down()
    {
        Api.Http.On("game_time_to_beats", new { }, HttpStatusCode.ServiceUnavailable);
        var game = await CreateGame(igdbId: 42);
        Assert.Null(game.TimeToBeatHours);
    }

    [Fact]
    public async Task Create_without_an_IGDB_id_does_not_call_IGDB()
    {
        await CreateGame();
        Assert.Empty(Api.Http.Calls);
    }

    public static TheoryData<object> InvalidGames() => new()
    {
        new { title = "", entry = new { platformId = 1 } },
        new { title = new string('x', 301), entry = new { platformId = 1 } },
        new { title = "x", entry = new { platformId = 999 } },                       // no such platform
        new { title = "x", entry = new { platformId = 1, rating = 11 } },
        new { title = "x", entry = new { platformId = 1, rating = 0 } },
        new { title = "x", entry = new { platformId = 1, hoursPlayed = -1 } },
        new { title = "x", entry = new { platformId = 1, status = "Bogus" } },
        new { title = "x", entry = new { platformId = 1, status = "99" } },
        new { title = "x", entry = new { platformId = 1, hardware = "Toaster" } },
        new { title = "x", entry = new { platformId = 1, mode = "VR" } },
        new { title = "x" },                                                          // no entry
    };

    [Theory, MemberData(nameof(InvalidGames))]
    public async Task Create_rejects_invalid_input(object body)
    {
        await Status(HttpStatusCode.BadRequest, Admin.PostAsJsonAsync("/api/games", body));
        Assert.Empty(await GetGames(Admin));
    }

    [Fact]
    public async Task Create_rejects_a_Steam_game_that_is_already_in_the_library()
    {
        await CreateGame("Portal", steamAppId: 400);
        await Status(HttpStatusCode.Conflict, Admin.PostAsJsonAsync("/api/games",
            new { title = "Portal again", steamAppId = 400, entry = new { platformId = PC } }));
    }

    [Fact]
    public async Task The_database_itself_refuses_two_games_with_one_Steam_app_id()
    {
        await CreateGame("Portal", steamAppId: 400);
        await Assert.ThrowsAsync<DbUpdateException>(() => Api.Db(db =>
        {
            db.Games.Add(new Game { Title = "Portal copy", SteamAppId = 400 });
            return db.SaveChangesAsync();
        }));
    }

    [Fact]
    public async Task Games_with_the_same_title_are_separate_games()
    {
        // Silent Hill 2 (2001) and its remake share a title; nothing merges them
        await CreateGame("Silent Hill 2", platformId: PS2);
        await CreateGame("Silent Hill 2", platformId: PC);
        Assert.Equal(2, (await GetGames(Guest)).Count);
    }

    // ---- Editing details ----

    [Fact]
    public async Task Update_game_changes_details_and_clears_blanks()
    {
        var game = await CreateGame();
        var updated = await Ok<GameDto>(await Admin.PutAsJsonAsync($"/api/games/{game.Id}", new
        {
            title = " Halo 2 Anniversary ", genre = "  ", developer = "343", summary = "", coverUrl = "https://x/y.jpg", releaseYear = 2014
        }));

        Assert.Equal(("Halo 2 Anniversary", null, "343", null, "https://x/y.jpg", 2014),
            (updated.Title, updated.Genre, updated.Developer, updated.Summary, updated.CoverUrl, updated.ReleaseYear));
        Assert.Equal("Halo 2 Anniversary", (await GetGame(game.Id)).Title);
        Assert.Single(updated.UserEntries); // entries untouched
    }

    [Fact]
    public async Task Rematching_to_another_IGDB_game_refreshes_time_to_beat()
    {
        Api.Http.On("game_time_to_beats", new[] { new { game_id = 1, normally = 5 * 3600 }, new { game_id = 2, normally = 20 * 3600 } });
        var game = await CreateGame(igdbId: 1);
        Assert.Equal(5, game.TimeToBeatHours);

        var same = await Ok<GameDto>(await Admin.PutAsJsonAsync($"/api/games/{game.Id}", new { title = "Renamed", igdbId = 1 }));
        Assert.Equal(1, Api.Http.CallsTo("game_time_to_beats")); // same match, no new lookup
        Assert.Equal(5, same.TimeToBeatHours);

        var rematched = await Ok<GameDto>(await Admin.PutAsJsonAsync($"/api/games/{game.Id}", new { title = "Renamed", igdbId = 2 }));
        Assert.Equal(20, rematched.TimeToBeatHours);

        var unmatched = await Ok<GameDto>(await Admin.PutAsJsonAsync($"/api/games/{game.Id}", new { title = "Renamed" }));
        Assert.Null(unmatched.TimeToBeatHours);
    }

    [Theory]
    [InlineData("")]
    [InlineData(null)]
    public async Task Update_game_needs_a_title(string? title)
    {
        var game = await CreateGame();
        await Status(HttpStatusCode.BadRequest, Admin.PutAsJsonAsync($"/api/games/{game.Id}", new { title }));
    }

    [Fact]
    public async Task Update_game_rejects_impossible_release_years()
    {
        var game = await CreateGame();
        await Status(HttpStatusCode.BadRequest, Admin.PutAsJsonAsync($"/api/games/{game.Id}", new { title = "x", releaseYear = 1800 }));
    }

    [Fact]
    public async Task Update_missing_game_is_a_404()
    {
        await Status(HttpStatusCode.NotFound, Admin.PutAsJsonAsync("/api/games/999", new { title = "x" }));
    }

    // ---- Editing entries ----

    [Fact]
    public async Task Update_entry_replaces_every_field()
    {
        var game = await CreateGame();
        game = await UpdateEntry(game, new { hoursPlayed = 12.5, rating = 8, notes = "Great", mode = "TV", hardware = "Emulator",
                                             achievementsEarned = 3, achievementsTotal = 10 });
        var e = game.UserEntries.Single();
        Assert.Equal((12.5m, 8, "Great", "TV", "Emulator", 3, 10),
            (e.HoursPlayed, e.Rating, e.Notes, e.Mode, e.Hardware, e.AchievementsEarned, e.AchievementsTotal));

        // null clears; a missing hardware leaves it as it is
        game = await UpdateEntry(game, new { rating = (int?)null, notes = "  ", mode = (string?)null, hardware = (string?)null });
        e = game.UserEntries.Single();
        Assert.Equal((null, null, null, "Emulator", 12.5m), (e.Rating, e.Notes, e.Mode, e.Hardware, e.HoursPlayed));
    }

    [Fact]
    public async Task Status_changes_are_logged_and_fill_empty_dates_once()
    {
        var game = await CreateGame();
        game = await UpdateEntry(game, new { status = "Playing" });
        var started = game.UserEntries[0].StartedAt;
        Assert.NotNull(started);

        game = await UpdateEntry(game, new { status = "OnHold" });
        game = await UpdateEntry(game, new { status = "Playing" });
        Assert.Equal(started, game.UserEntries[0].StartedAt); // a second start keeps the first date

        game = await UpdateEntry(game, new { status = "Completed" });
        game = await UpdateEntry(game, new { status = "Completed", notes = "edit" }); // same status: not logged again

        var e = game.UserEntries[0];
        Assert.NotNull(e.CompletedAt);
        Assert.Equal(["Backlog", "Playing", "OnHold", "Playing", "Completed"], e.History.Select(h => h.Status));
    }

    [Fact]
    public async Task Dates_set_by_hand_win_over_the_automatic_ones()
    {
        var game = await CreateGame();
        var started = new DateTime(2019, 1, 2, 12, 0, 0, DateTimeKind.Utc);
        game = await UpdateEntry(game, new { status = "Playing", startedAt = started });
        Assert.Equal(started, game.UserEntries[0].StartedAt);

        game = await UpdateEntry(game, new { startedAt = (DateTime?)null });
        Assert.Null(game.UserEntries[0].StartedAt); // clearing a date sticks; the status didn't change
    }

    [Fact]
    public async Task Update_entry_can_move_to_another_platform()
    {
        var game = await UpdateEntry(await CreateGame(), new { platformId = PS2 });
        Assert.Equal((PS2, "PlayStation 2"), (game.UserEntries[0].PlatformId, game.UserEntries[0].PlatformName));
    }

    [Fact]
    public async Task Update_entry_refuses_a_platform_the_game_already_has()
    {
        var game = await CreateGame();
        game = await Ok<GameDto>(await Admin.PostAsJsonAsync($"/api/games/{game.Id}/entries", new { platformId = PS2 }));
        await Status(HttpStatusCode.Conflict, Admin.PutAsJsonAsync($"/api/games/{game.Id}/entries/{game.UserEntries[0].Id}",
            EntryBody(game.UserEntries[0], new { platformId = PS2 })));
    }

    [Fact]
    public async Task The_Steam_entry_stays_on_PC()
    {
        var game = await SteamGame();
        await Status(HttpStatusCode.BadRequest, Admin.PutAsJsonAsync($"/api/games/{game.Id}/entries/{game.UserEntries[0].Id}",
            EntryBody(game.UserEntries[0], new { platformId = PS2 })));
        Assert.Equal(PC, (await GetGame(game.Id)).UserEntries[0].PlatformId);
    }

    public static TheoryData<object> InvalidEntryChanges() => new()
    {
        new { platformId = 999 },
        new { status = "Bogus" },
        new { status = "99" },
        new { hardware = "Toaster" },
        new { hardware = "9" },
        new { mode = "VR" },
        new { rating = 11 },
        new { hoursPlayed = -5 },
    };

    [Theory, MemberData(nameof(InvalidEntryChanges))]
    public async Task Update_entry_rejects_invalid_values(object changes)
    {
        var game = await CreateGame();
        await Status(HttpStatusCode.BadRequest, Admin.PutAsJsonAsync($"/api/games/{game.Id}/entries/{game.UserEntries[0].Id}",
            EntryBody(game.UserEntries[0], changes)));
        var e = (await GetGame(game.Id)).UserEntries[0];
        Assert.Equal(("Backlog", "Original", Xbox360), (e.Status, e.Hardware, e.PlatformId)); // nothing half-saved
    }

    [Fact]
    public async Task Update_entry_of_another_game_is_a_404()
    {
        var a = await CreateGame("A");
        var b = await CreateGame("B");
        await Status(HttpStatusCode.NotFound, Admin.PutAsJsonAsync($"/api/games/{b.Id}/entries/{a.UserEntries[0].Id}",
            EntryBody(a.UserEntries[0])));
    }

    // ---- More platforms ----

    [Fact]
    public async Task Add_entry_logs_the_game_on_another_platform()
    {
        var game = await CreateGame();
        game = await Ok<GameDto>(await Admin.PostAsJsonAsync($"/api/games/{game.Id}/entries",
            new { platformId = PS2, status = "Playing", hoursPlayed = 2 }));

        Assert.Equal(["Xbox 360", "PlayStation 2"], game.UserEntries.Select(e => e.PlatformName)); // oldest entry first
        Assert.Equal(("Playing", 2m), (game.UserEntries[1].Status, game.UserEntries[1].HoursPlayed));
    }

    [Fact]
    public async Task Add_entry_refuses_a_platform_the_game_already_has()
    {
        var game = await CreateGame(platformId: PS2);
        await Status(HttpStatusCode.Conflict, Admin.PostAsJsonAsync($"/api/games/{game.Id}/entries", new { platformId = PS2 }));
    }

    [Fact]
    public async Task Add_entry_checks_the_game_and_platform_exist()
    {
        var game = await CreateGame();
        await Status(HttpStatusCode.NotFound, Admin.PostAsJsonAsync("/api/games/999/entries", new { platformId = PS2 }));
        await Status(HttpStatusCode.BadRequest, Admin.PostAsJsonAsync($"/api/games/{game.Id}/entries", new { platformId = 999 }));
    }

    [Fact]
    public async Task Delete_entry_removes_one_platform()
    {
        var game = await CreateGame();
        game = await Ok<GameDto>(await Admin.PostAsJsonAsync($"/api/games/{game.Id}/entries", new { platformId = PS2 }));

        game = await Ok<GameDto>(await Admin.DeleteAsync($"/api/games/{game.Id}/entries/{game.UserEntries[0].Id}"));

        Assert.Equal(["PlayStation 2"], game.UserEntries.Select(e => e.PlatformName));
    }

    [Fact]
    public async Task A_game_keeps_at_least_one_entry()
    {
        var game = await CreateGame();
        await Status(HttpStatusCode.BadRequest, Admin.DeleteAsync($"/api/games/{game.Id}/entries/{game.UserEntries[0].Id}"));
    }

    [Fact]
    public async Task The_Steam_entry_cannot_be_deleted()
    {
        var game = await SteamGame();
        game = await Ok<GameDto>(await Admin.PostAsJsonAsync($"/api/games/{game.Id}/entries", new { platformId = PS2 }));
        await Status(HttpStatusCode.BadRequest, Admin.DeleteAsync($"/api/games/{game.Id}/entries/{game.UserEntries[0].Id}"));
        // the other one can go
        await Status(HttpStatusCode.OK, Admin.DeleteAsync($"/api/games/{game.Id}/entries/{game.UserEntries[1].Id}"));
    }

    [Fact]
    public async Task Delete_missing_entry_is_a_404()
    {
        var game = await CreateGame();
        await Status(HttpStatusCode.NotFound, Admin.DeleteAsync($"/api/games/{game.Id}/entries/999"));
    }

    // ---- Favourite and delete ----

    [Fact]
    public async Task Favourite_toggles()
    {
        var game = await CreateGame();
        Assert.True((await Ok<GameDto>(await Admin.PatchAsync($"/api/games/{game.Id}/favourite", null))).IsFavourite);
        Assert.False((await Ok<GameDto>(await Admin.PatchAsync($"/api/games/{game.Id}/favourite", null))).IsFavourite);
        await Status(HttpStatusCode.NotFound, Admin.PatchAsync("/api/games/999/favourite", null));
    }

    [Fact]
    public async Task Deleting_a_manual_game_removes_it_and_its_history()
    {
        var game = await CreateGame(status: "Playing");
        await Status(HttpStatusCode.NoContent, Admin.DeleteAsync($"/api/games/{game.Id}"));

        await Status(HttpStatusCode.NotFound, Admin.GetAsync($"/api/games/{game.Id}"));
        Assert.Equal((0, 0), await Api.Db(async db => (await db.UserEntries.CountAsync(), await db.StatusChanges.CountAsync())));
    }

    [Fact]
    public async Task Deleting_a_Steam_game_hides_it_so_a_sync_does_not_bring_it_back()
    {
        var game = await SteamGame();
        await Status(HttpStatusCode.NoContent, Admin.DeleteAsync($"/api/games/{game.Id}"));

        Assert.True((await GetGame(game.Id)).IsHidden);
        Assert.Empty(await GetGames(Guest));
    }

    [Fact]
    public async Task Delete_missing_game_is_a_404()
    {
        await Status(HttpStatusCode.NotFound, Admin.DeleteAsync("/api/games/999"));
    }

    // ---- Bulk ----

    [Fact]
    public async Task Bulk_status_changes_each_games_main_entry_only()
    {
        var a = await CreateGame("A");
        a = await Ok<GameDto>(await Admin.PostAsJsonAsync($"/api/games/{a.Id}/entries", new { platformId = PS2, status = "Wishlist" }));
        var b = await CreateGame("B", "Completed");
        var untouched = await CreateGame("C");

        var result = await Ok<List<GameDto>>(await Admin.PatchAsJsonAsync("/api/games/bulk", new { ids = new[] { a.Id, b.Id }, status = "Dropped" }));

        Assert.Equal(2, result.Count);
        a = await GetGame(a.Id);
        Assert.Equal(["Dropped", "Wishlist"], a.UserEntries.Select(e => e.Status));
        Assert.Equal(["Backlog", "Dropped"], a.UserEntries[0].History.Select(h => h.Status));
        Assert.Equal("Dropped", (await GetGame(b.Id)).UserEntries[0].Status);
        Assert.Equal("Backlog", (await GetGame(untouched.Id)).UserEntries[0].Status);
    }

    [Fact]
    public async Task Bulk_platform_skips_Steam_entries_and_platforms_a_game_already_has()
    {
        var manual = await CreateGame("Manual");
        var hasPs2 = await CreateGame("Has PS2");
        await Ok<GameDto>(await Admin.PostAsJsonAsync($"/api/games/{hasPs2.Id}/entries", new { platformId = PS2 }));
        var steam = await SteamGame();

        var result = await Ok<List<GameDto>>(await Admin.PatchAsJsonAsync("/api/games/bulk",
            new { ids = new[] { manual.Id, hasPs2.Id, steam.Id }, platformId = PS2 }));

        Assert.Equal("PlayStation 2", result.Single(g => g.Id == manual.Id).UserEntries[0].PlatformName); // fresh names
        Assert.Equal([Xbox360, PS2], (await GetGame(hasPs2.Id)).UserEntries.Select(e => e.PlatformId));
        Assert.Equal(PC, (await GetGame(steam.Id)).UserEntries[0].PlatformId);
    }

    [Fact]
    public async Task Bulk_hide_and_unhide()
    {
        var game = await CreateGame();
        await Ok<List<GameDto>>(await Admin.PatchAsJsonAsync("/api/games/bulk", new { ids = new[] { game.Id }, hidden = true }));
        Assert.Empty(await GetGames(Guest));
        await Ok<List<GameDto>>(await Admin.PatchAsJsonAsync("/api/games/bulk", new { ids = new[] { game.Id }, hidden = false }));
        Assert.Single(await GetGames(Guest));
        Assert.Equal("Backlog", (await GetGame(game.Id)).UserEntries[0].Status); // nothing else changed
    }

    [Fact]
    public async Task Bulk_ignores_ids_that_do_not_exist()
    {
        var game = await CreateGame();
        var result = await Ok<List<GameDto>>(await Admin.PatchAsJsonAsync("/api/games/bulk", new { ids = new[] { game.Id, 999 }, status = "Playing" }));
        Assert.Equal([game.Id], result.Select(g => g.Id));
    }

    public static TheoryData<object> InvalidBulk() => new()
    {
        new { ids = Array.Empty<int>(), status = "Playing" },
        new { ids = new[] { 1 }, status = "Bogus" },
        new { ids = new[] { 1 }, status = "99" },
        new { ids = new[] { 1 }, platformId = 999 },
    };

    [Theory, MemberData(nameof(InvalidBulk))]
    public async Task Bulk_rejects_invalid_changes(object body)
    {
        await CreateGame();
        await Status(HttpStatusCode.BadRequest, Admin.PatchAsJsonAsync("/api/games/bulk", body));
        Assert.Equal("Backlog", (await GetGame(1)).UserEntries[0].Status);
    }
}
