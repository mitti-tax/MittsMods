using Microsoft.EntityFrameworkCore;
using MittsModsApi.Models;

namespace MittsModsApi.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<Game> Games => Set<Game>();
    public DbSet<Platform> Platforms => Set<Platform>();
    public DbSet<UserEntry> UserEntries => Set<UserEntry>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // UserEntry → Game (required)
        modelBuilder.Entity<UserEntry>()
            .HasOne(e => e.Game)
            .WithMany(g => g.UserEntries)
            .HasForeignKey(e => e.GameId)
            .OnDelete(DeleteBehavior.Cascade);

        // UserEntry → Platform (required)
        modelBuilder.Entity<UserEntry>()
            .HasOne(e => e.Platform)
            .WithMany(p => p.UserEntries)
            .HasForeignKey(e => e.PlatformId)
            .OnDelete(DeleteBehavior.Restrict);

        // Store enums as strings for readability in the DB
        modelBuilder.Entity<UserEntry>()
            .Property(e => e.Status)
            .HasConversion<string>();

        modelBuilder.Entity<UserEntry>()
            .Property(e => e.Source)
            .HasConversion<string>();

        // Seed common platforms
        // These IDs are fixed so migrations stay stable
        modelBuilder.Entity<Platform>().HasData(
            new Platform { Id = 1,  Name = "PC",                  Abbreviation = "PC"   },
            new Platform { Id = 2,  Name = "Sega Dreamcast",      Abbreviation = "DC"   },
            new Platform { Id = 3,  Name = "Xbox 360",            Abbreviation = "X360" },
            new Platform { Id = 4,  Name = "Nintendo Switch",     Abbreviation = "NSW"  },
            new Platform { Id = 5,  Name = "Nintendo Switch Lite",Abbreviation = "NSL"  },
            new Platform { Id = 6,  Name = "PlayStation 2",       Abbreviation = "PS2"  },
            new Platform { Id = 7,  Name = "PlayStation 3",       Abbreviation = "PS3"  },
            new Platform { Id = 8,  Name = "PlayStation 4",       Abbreviation = "PS4"  },
            new Platform { Id = 9,  Name = "Game Boy Advance",    Abbreviation = "GBA"  },
            new Platform { Id = 10, Name = "Nintendo DS",         Abbreviation = "NDS"  },
            new Platform { Id = 11, Name = "Nintendo 3DS",        Abbreviation = "3DS"  },
            new Platform { Id = 12, Name = "Other",               Abbreviation = "OTH"  }
        );
    }
}