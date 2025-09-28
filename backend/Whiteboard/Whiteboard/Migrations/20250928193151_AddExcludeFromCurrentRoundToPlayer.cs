using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Whiteboard.Migrations
{
    /// <inheritdoc />
    public partial class AddExcludeFromCurrentRoundToPlayer : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "ExcludeFromCurrentRound",
                table: "Players",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ExcludeFromCurrentRound",
                table: "Players");
        }
    }
}
