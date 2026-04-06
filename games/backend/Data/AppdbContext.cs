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

        modelBuilder.Entity<UserEntry>()
            .HasOne(e => e.Game)
            .WithMany(g => g.UserEntries)
            .HasForeignKey(e => e.GameId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<UserEntry>()
            .HasOne(e => e.Platform)
            .WithMany(p => p.UserEntries)
            .HasForeignKey(e => e.PlatformId)
            .OnDelete(DeleteBehavior.Restrict);

        // Store enums as strings for readability
        modelBuilder.Entity<UserEntry>()
            .Property(e => e.Status).HasConversion<string>();
        modelBuilder.Entity<UserEntry>()
            .Property(e => e.Source).HasConversion<string>();
        modelBuilder.Entity<UserEntry>()
            .Property(e => e.Mode).HasConversion<string>();
        modelBuilder.Entity<UserEntry>()
            .Property(e => e.Hardware).HasConversion<string>();

        // --- Platform seed data ---
        modelBuilder.Entity<Platform>().HasData(

            // PC
            new Platform { Id = 1,  Name = "PC",               Abbreviation = "PC"    },

            // Xbox
            new Platform { Id = 2,  Name = "Xbox",             Abbreviation = "XBOX"  },
            new Platform { Id = 3,  Name = "Xbox 360",         Abbreviation = "X360"  },
            new Platform { Id = 4,  Name = "Xbox One",         Abbreviation = "XONE"  },
            new Platform { Id = 5,  Name = "Xbox Series S/X",  Abbreviation = "XSX"   },

            // PlayStation home
            new Platform { Id = 6,  Name = "PlayStation",      Abbreviation = "PS1"   },
            new Platform { Id = 7,  Name = "PlayStation 2",    Abbreviation = "PS2"   },
            new Platform { Id = 8,  Name = "PlayStation 3",    Abbreviation = "PS3"   },
            new Platform { Id = 9,  Name = "PlayStation 4",    Abbreviation = "PS4"   },
            new Platform { Id = 10, Name = "PlayStation 5",    Abbreviation = "PS5"   },

            // PlayStation handheld
            new Platform { Id = 11, Name = "PSP",              Abbreviation = "PSP"   },
            new Platform { Id = 12, Name = "PS Vita",          Abbreviation = "VITA"  },

            // Nintendo home
            new Platform { Id = 13, Name = "NES",              Abbreviation = "NES"   },
            new Platform { Id = 14, Name = "SNES",             Abbreviation = "SNES"  },
            new Platform { Id = 15, Name = "Nintendo 64",      Abbreviation = "N64"   },
            new Platform { Id = 16, Name = "GameCube",         Abbreviation = "GCN"   },
            new Platform { Id = 17, Name = "Wii",              Abbreviation = "WII"   },
            new Platform { Id = 18, Name = "Wii U",            Abbreviation = "WIIU"  },
            new Platform { Id = 19, Name = "Nintendo Switch",  Abbreviation = "NSW"   },
            new Platform { Id = 20, Name = "Nintendo Switch 2",Abbreviation = "NSW2"  },

            // Nintendo handheld
            new Platform { Id = 21, Name = "Game Boy",         Abbreviation = "GB"    },
            new Platform { Id = 22, Name = "Game Boy Color",   Abbreviation = "GBC"   },
            new Platform { Id = 23, Name = "Game Boy Advance", Abbreviation = "GBA"   },
            new Platform { Id = 24, Name = "Nintendo DS",      Abbreviation = "NDS"   },
            new Platform { Id = 25, Name = "Nintendo 3DS",     Abbreviation = "3DS"   },

            // Sega
            new Platform { Id = 26, Name = "Sega Dreamcast",   Abbreviation = "DC"    },

            // Other
            new Platform { Id = 27, Name = "Other",            Abbreviation = "OTH"   }
        );
    }
}