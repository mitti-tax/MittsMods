using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MittsModsApi.Migrations
{
    /// <inheritdoc />
    public partial class AddLibraryIndexes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_Games_CreatedAt",
                table: "Games",
                column: "CreatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_Games_IgdbId",
                table: "Games",
                column: "IgdbId");

            migrationBuilder.CreateIndex(
                name: "IX_Games_SteamAppId",
                table: "Games",
                column: "SteamAppId");

            migrationBuilder.CreateIndex(
                name: "IX_Games_Title",
                table: "Games",
                column: "Title");

            migrationBuilder.CreateIndex(
                name: "IX_UserEntries_Status",
                table: "UserEntries",
                column: "Status");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Games_CreatedAt",
                table: "Games");

            migrationBuilder.DropIndex(
                name: "IX_Games_IgdbId",
                table: "Games");

            migrationBuilder.DropIndex(
                name: "IX_Games_SteamAppId",
                table: "Games");

            migrationBuilder.DropIndex(
                name: "IX_Games_Title",
                table: "Games");

            migrationBuilder.DropIndex(
                name: "IX_UserEntries_Status",
                table: "UserEntries");
        }
    }
}
