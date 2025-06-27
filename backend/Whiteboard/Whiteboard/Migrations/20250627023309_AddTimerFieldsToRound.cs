using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Whiteboard.Migrations
{
    /// <inheritdoc />
    public partial class AddTimerFieldsToRound : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "TimerDurationMinutes",
                table: "Rounds",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "TimerStartTime",
                table: "Rounds",
                type: "TEXT",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "TimerDurationMinutes",
                table: "Rounds");

            migrationBuilder.DropColumn(
                name: "TimerStartTime",
                table: "Rounds");
        }
    }
}
