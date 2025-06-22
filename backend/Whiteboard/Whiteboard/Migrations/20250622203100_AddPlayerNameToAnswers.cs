using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Whiteboard.Migrations
{
    /// <inheritdoc />
    public partial class AddPlayerNameToAnswers : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "PlayerName",
                table: "Answers",
                type: "TEXT",
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PlayerName",
                table: "Answers");
        }
    }
}
