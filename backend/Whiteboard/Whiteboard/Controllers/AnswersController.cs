using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Whiteboard.Models;

namespace Whiteboard.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AnswersController : ControllerBase
{
    private readonly GameDbContext _context;

    public AnswersController(GameDbContext context)
    {
        _context = context;
    }

    [HttpPost("submit")]
    public async Task<IActionResult> SubmitAnswer([FromBody] Answer answer)
    {
        _context.Answers.Add(answer);
        await _context.SaveChangesAsync();
        return Ok(answer);
    }

    [HttpGet("round/{roundId}")]
    public async Task<IActionResult> GetAnswersForRound(int roundId)
    {
        var answers = await _context.Answers
            .Include(a => a.Player)
            .Where(a => a.RoundId == roundId)
            .ToListAsync();

        return Ok(answers);
    }
}
