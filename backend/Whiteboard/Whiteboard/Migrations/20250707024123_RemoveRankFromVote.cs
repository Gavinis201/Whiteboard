using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Whiteboard.Migrations
{
    /// <inheritdoc />
    public partial class RemoveRankFromVote : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Rank",
                table: "Votes");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "Rank",
                table: "Votes",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);
        }
    }
}
