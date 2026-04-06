using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace MittsModsApi.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Games",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Title = table.Column<string>(type: "text", nullable: false),
                    CoverUrl = table.Column<string>(type: "text", nullable: true),
                    Genre = table.Column<string>(type: "text", nullable: true),
                    ReleaseYear = table.Column<int>(type: "integer", nullable: true),
                    Developer = table.Column<string>(type: "text", nullable: true),
                    Summary = table.Column<string>(type: "text", nullable: true),
                    IgdbId = table.Column<int>(type: "integer", nullable: true),
                    SteamAppId = table.Column<int>(type: "integer", nullable: true),
                    IsFavourite = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Games", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Platforms",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Abbreviation = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Platforms", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "UserEntries",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    GameId = table.Column<int>(type: "integer", nullable: false),
                    PlatformId = table.Column<int>(type: "integer", nullable: false),
                    Status = table.Column<string>(type: "text", nullable: false),
                    HoursPlayed = table.Column<decimal>(type: "numeric", nullable: true),
                    Rating = table.Column<int>(type: "integer", nullable: true),
                    Notes = table.Column<string>(type: "text", nullable: true),
                    AchievementsEarned = table.Column<int>(type: "integer", nullable: true),
                    AchievementsTotal = table.Column<int>(type: "integer", nullable: true),
                    Mode = table.Column<string>(type: "text", nullable: true),
                    Hardware = table.Column<string>(type: "text", nullable: false),
                    Source = table.Column<string>(type: "text", nullable: false),
                    StartedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CompletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserEntries", x => x.Id);
                    table.ForeignKey(
                        name: "FK_UserEntries_Games_GameId",
                        column: x => x.GameId,
                        principalTable: "Games",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_UserEntries_Platforms_PlatformId",
                        column: x => x.PlatformId,
                        principalTable: "Platforms",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.InsertData(
                table: "Platforms",
                columns: new[] { "Id", "Abbreviation", "Name" },
                values: new object[,]
                {
                    { 1, "PC", "PC" },
                    { 2, "XBOX", "Xbox" },
                    { 3, "X360", "Xbox 360" },
                    { 4, "XONE", "Xbox One" },
                    { 5, "XSX", "Xbox Series S/X" },
                    { 6, "PS1", "PlayStation" },
                    { 7, "PS2", "PlayStation 2" },
                    { 8, "PS3", "PlayStation 3" },
                    { 9, "PS4", "PlayStation 4" },
                    { 10, "PS5", "PlayStation 5" },
                    { 11, "PSP", "PSP" },
                    { 12, "VITA", "PS Vita" },
                    { 13, "NES", "NES" },
                    { 14, "SNES", "SNES" },
                    { 15, "N64", "Nintendo 64" },
                    { 16, "GCN", "GameCube" },
                    { 17, "WII", "Wii" },
                    { 18, "WIIU", "Wii U" },
                    { 19, "NSW", "Nintendo Switch" },
                    { 20, "NSW2", "Nintendo Switch 2" },
                    { 21, "GB", "Game Boy" },
                    { 22, "GBC", "Game Boy Color" },
                    { 23, "GBA", "Game Boy Advance" },
                    { 24, "NDS", "Nintendo DS" },
                    { 25, "3DS", "Nintendo 3DS" },
                    { 26, "DC", "Sega Dreamcast" },
                    { 27, "OTH", "Other" }
                });

            migrationBuilder.CreateIndex(
                name: "IX_UserEntries_GameId",
                table: "UserEntries",
                column: "GameId");

            migrationBuilder.CreateIndex(
                name: "IX_UserEntries_PlatformId",
                table: "UserEntries",
                column: "PlatformId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "UserEntries");

            migrationBuilder.DropTable(
                name: "Games");

            migrationBuilder.DropTable(
                name: "Platforms");
        }
    }
}
