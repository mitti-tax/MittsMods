using MittsModsApi.Models;

namespace MittsModsApi.Tests;

// UserEntry.SetStatus is the one place status changes happen, so its rules are checked directly too
public class ModelTests
{
    [Fact]
    public void A_new_entry_logs_its_first_status_even_if_it_is_the_default()
    {
        var e = new UserEntry();
        e.SetStatus(PlayStatus.Backlog);
        Assert.Equal([PlayStatus.Backlog], e.History.Select(h => h.Status));
    }

    [Fact]
    public void Setting_the_same_status_again_does_nothing()
    {
        var e = new UserEntry { Id = 1, Status = PlayStatus.Playing };
        e.SetStatus(PlayStatus.Playing);
        Assert.Empty(e.History);
        Assert.Null(e.StartedAt);
    }

    [Fact]
    public void Playing_and_Completed_fill_their_dates_only_when_empty()
    {
        var started = new DateTime(2020, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        var e = new UserEntry { Id = 1, StartedAt = started };

        e.SetStatus(PlayStatus.Playing);
        e.SetStatus(PlayStatus.Completed);

        Assert.Equal(started, e.StartedAt);
        Assert.InRange(e.CompletedAt!.Value, DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow);
        Assert.Equal([PlayStatus.Playing, PlayStatus.Completed], e.History.Select(h => h.Status));
    }

    [Theory]
    [InlineData(PlayStatus.Backlog)]
    [InlineData(PlayStatus.Dropped)]
    [InlineData(PlayStatus.OnHold)]
    [InlineData(PlayStatus.Wishlist)]
    public void Other_statuses_leave_the_dates_alone(PlayStatus status)
    {
        var e = new UserEntry { Id = 1, Status = PlayStatus.Playing };
        e.SetStatus(status);
        Assert.Equal((null, null), (e.StartedAt, e.CompletedAt));
    }
}
