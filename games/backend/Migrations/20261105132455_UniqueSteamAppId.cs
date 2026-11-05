using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MittsModsApi.Migrations
{
    /// <inheritdoc />
    public partial class UniqueSteamAppId : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Two overlapping Steam syncs imported every game twice. Keep one copy per Steam app:
            // a favourite first, then the one whose entry was edited most recently, then the oldest.
            // Their user entries are removed by the cascade.
            migrationBuilder.Sql("""
                DELETE FROM "Games" WHERE "Id" IN (
                    SELECT "Id" FROM (
                        SELECT g."Id", ROW_NUMBER() OVER (
                            PARTITION BY g."SteamAppId"
                            ORDER BY g."IsFavourite" DESC, MAX(e."UpdatedAt") DESC NULLS LAST, g."Id"
                        ) AS rn
                        FROM "Games" g
                        LEFT JOIN "UserEntries" e ON e."GameId" = g."Id"
                        WHERE g."SteamAppId" IS NOT NULL
                        GROUP BY g."Id", g."SteamAppId", g."IsFavourite"
                    ) ranked
                    WHERE rn > 1
                );
                """);

            migrationBuilder.CreateIndex(
                name: "IX_Games_SteamAppId",
                table: "Games",
                column: "SteamAppId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Games_SteamAppId",
                table: "Games");
        }
    }
}
