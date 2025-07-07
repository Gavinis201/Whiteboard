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
        // Check if player has already voted in this round
        var existingVote = await _context.Votes
            .FirstOrDefaultAsync(v => v.VoterPlayerId == vote.VoterPlayerId && 
                                     v.RoundId == vote.RoundId);
        
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
                VoteCount = g.Count(),
                TotalVotes = _context.Votes.Count(v => v.RoundId == roundId)
            })
            .OrderByDescending(r => r.VoteCount)
            .ToListAsync();

        return Ok(voteResults);
    }

    [HttpGet("player/{playerId}/round/{roundId}")]
    public async Task<IActionResult> GetPlayerVotes(int playerId, int roundId)
    {
        var votes = await _context.Votes
            .Include(v => v.VotedAnswer)
            .Where(v => v.VoterPlayerId == playerId && v.RoundId == roundId)
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
                VoteCount = g.Count(),
                TotalVotes = _context.Votes.Count(v => v.RoundId == roundId),
                Voters = g.Select(v => new
                {
                    VoterName = v.VoterPlayer.Name
                }).ToList()
            })
            .OrderByDescending(r => r.VoteCount)
            .ToListAsync();

        return Ok(detailedResults);
    }
} 