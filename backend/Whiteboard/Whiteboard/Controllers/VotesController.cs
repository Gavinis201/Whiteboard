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

    [HttpGet("debug/all")]
    public async Task<IActionResult> GetAllVotes()
    {
        Console.WriteLine("🔍 GetAllVotes called - checking all votes in database");
        
        var allVotes = await _context.Votes
            .Include(v => v.VoterPlayer)
            .Include(v => v.VotedAnswer)
            .ToListAsync();
        
        Console.WriteLine($"🔍 Total votes in database: {allVotes.Count}");
        
        var result = allVotes.Select(v => new
        {
            VoteId = v.VoteId,
            VoterPlayerId = v.VoterPlayerId,
            VoterName = v.VoterPlayer?.Name,
            VotedAnswerId = v.VotedAnswerId,
            VotedAnswerPlayerName = v.VotedAnswer?.PlayerName,
            RoundId = v.RoundId
        }).ToList();
        
        return Ok(result);
    }

    [HttpGet("detailed-results/{roundId}")]
    public async Task<IActionResult> GetDetailedVoteResults(int roundId)
    {
        Console.WriteLine($"🔍 GetDetailedVoteResults called for roundId: {roundId}");
        
        // First, let's check if there are any votes at all for this round
        var allVotesForRound = await _context.Votes
            .Where(v => v.RoundId == roundId)
            .ToListAsync();
        
        Console.WriteLine($"🔍 Found {allVotesForRound.Count} total votes for round {roundId}");
        
        if (allVotesForRound.Any())
        {
            Console.WriteLine($"🔍 Vote details:");
            foreach (var vote in allVotesForRound)
            {
                Console.WriteLine($"  - VoteId: {vote.VoteId}, VoterPlayerId: {vote.VoterPlayerId}, VotedAnswerId: {vote.VotedAnswerId}, RoundId: {vote.RoundId}");
            }
        }
        
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

        Console.WriteLine($"🔍 Detailed results count: {detailedResults.Count}");
        foreach (var result in detailedResults)
        {
            Console.WriteLine($"🔍 Result - AnswerId: {result.AnswerId}, PlayerName: {result.PlayerName}, VoteCount: {result.VoteCount}, Voters: {string.Join(", ", result.Voters.Select(v => v.VoterName))}");
        }

        return Ok(detailedResults);
    }
} 