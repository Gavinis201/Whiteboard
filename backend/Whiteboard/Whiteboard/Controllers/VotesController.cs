using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Whiteboard.Models;

namespace Whiteboard.Controllers;

[ApiController]
[Route("api/[controller]")]
public class VotesController : ControllerBase
{
    private readonly GameDbContext _context;

    public VotesController(GameDbContext context)
    {
        _context = context;
    }

    [HttpPost("submit")]
    public async Task<IActionResult> SubmitVote([FromBody] Vote vote)
    {
        // Check if player has already voted for this rank in this round
        var existingVote = await _context.Votes
            .FirstOrDefaultAsync(v => v.VoterPlayerId == vote.VoterPlayerId && 
                                     v.RoundId == vote.RoundId && 
                                     v.Rank == vote.Rank);
        
        if (existingVote != null)
        {
            // Update existing vote
            existingVote.VotedAnswerId = vote.VotedAnswerId;
        }
        else
        {
            // Add new vote
            _context.Votes.Add(vote);
        }
        
        await _context.SaveChangesAsync();
        return Ok(vote);
    }

    [HttpGet("round/{roundId}")]
    public async Task<IActionResult> GetVotesForRound(int roundId)
    {
        var votes = await _context.Votes
            .Include(v => v.VotedAnswer)
            .Include(v => v.VoterPlayer)
            .Where(v => v.RoundId == roundId)
            .ToListAsync();

        return Ok(votes);
    }

    [HttpGet("results/{roundId}")]
    public async Task<IActionResult> GetVoteResults(int roundId)
    {
        var voteResults = await _context.Votes
            .Include(v => v.VotedAnswer)
            .Where(v => v.RoundId == roundId)
            .GroupBy(v => v.VotedAnswerId)
            .Select(g => new
            {
                AnswerId = g.Key,
                PlayerName = g.First().VotedAnswer.PlayerName,
                FirstPlaceVotes = g.Count(v => v.Rank == 1),
                SecondPlaceVotes = g.Count(v => v.Rank == 2),
                ThirdPlaceVotes = g.Count(v => v.Rank == 3),
                TotalPoints = g.Sum(v => v.Rank == 1 ? 3 : v.Rank == 2 ? 2 : 1)
            })
            .OrderByDescending(r => r.TotalPoints)
            .ThenByDescending(r => r.FirstPlaceVotes)
            .ToListAsync();

        return Ok(voteResults);
    }

    [HttpGet("player/{playerId}/round/{roundId}")]
    public async Task<IActionResult> GetPlayerVotes(int playerId, int roundId)
    {
        var votes = await _context.Votes
            .Include(v => v.VotedAnswer)
            .Where(v => v.VoterPlayerId == playerId && v.RoundId == roundId)
            .OrderBy(v => v.Rank)
            .ToListAsync();

        return Ok(votes);
    }

    [HttpGet("detailed-results/{roundId}")]
    public async Task<IActionResult> GetDetailedVoteResults(int roundId)
    {
        var detailedResults = await _context.Votes
            .Include(v => v.VotedAnswer)
            .Include(v => v.VoterPlayer)
            .Where(v => v.RoundId == roundId)
            .GroupBy(v => v.VotedAnswerId)
            .Select(g => new
            {
                AnswerId = g.Key,
                PlayerName = g.First().VotedAnswer.PlayerName,
                FirstPlaceVotes = g.Count(v => v.Rank == 1),
                SecondPlaceVotes = g.Count(v => v.Rank == 2),
                ThirdPlaceVotes = g.Count(v => v.Rank == 3),
                TotalPoints = g.Sum(v => v.Rank == 1 ? 3 : v.Rank == 2 ? 2 : 1),
                Voters = g.Select(v => new
                {
                    VoterName = v.VoterPlayer.Name,
                    Rank = v.Rank
                }).OrderBy(v => v.Rank).ToList()
            })
            .OrderByDescending(r => r.TotalPoints)
            .ThenByDescending(r => r.FirstPlaceVotes)
            .ToListAsync();

        return Ok(detailedResults);
    }
} 