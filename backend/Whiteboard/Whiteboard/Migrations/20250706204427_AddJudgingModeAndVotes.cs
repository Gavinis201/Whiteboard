using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Whiteboard.Migrations
{
    /// <inheritdoc />
    public partial class AddJudgingModeAndVotes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "JudgingModeEnabled",
                table: "Games",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateTable(
                name: "Votes",
                columns: table => new
                {
                    VoteId = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    VoterPlayerId = table.Column<int>(type: "INTEGER", nullable: false),
                    VotedAnswerId = table.Column<int>(type: "INTEGER", nullable: false),
                    Rank = table.Column<int>(type: "INTEGER", nullable: false),
                    RoundId = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Votes", x => x.VoteId);
                    table.ForeignKey(
                        name: "FK_Votes_Answers_VotedAnswerId",
                        column: x => x.VotedAnswerId,
                        principalTable: "Answers",
                        principalColumn: "AnswerId",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_Votes_Players_VoterPlayerId",
                        column: x => x.VoterPlayerId,
                        principalTable: "Players",
                        principalColumn: "PlayerId",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_Votes_Rounds_RoundId",
                        column: x => x.RoundId,
                        principalTable: "Rounds",
                        principalColumn: "RoundId",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Votes_RoundId",
                table: "Votes",
                column: "RoundId");

            migrationBuilder.CreateIndex(
                name: "IX_Votes_VotedAnswerId",
                table: "Votes",
                column: "VotedAnswerId");

            migrationBuilder.CreateIndex(
                name: "IX_Votes_VoterPlayerId",
                table: "Votes",
                column: "VoterPlayerId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Votes");

            migrationBuilder.DropColumn(
                name: "JudgingModeEnabled",
                table: "Games");
        }
    }
}
