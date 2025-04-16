using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Whiteboard.Models;

namespace Whiteboard.Controllers;

[ApiController]
[Route("api/[controller]")]
public class RoundsController : ControllerBase
{
    private readonly GameDbContext _context;

    public RoundsController(GameDbContext context)
    {
        _context = context;
    }

    [HttpPost("start")]
    public async Task<IActionResult> StartRound([FromBody] Round round)
    {
        _context.Rounds.Add(round);
        await _context.SaveChangesAsync();
        return Ok(round);
    }

    [HttpGet("{gameId}")]
    public async Task<IActionResult> GetRounds(int gameId)
    {
        var rounds = await _context.Rounds.Where(r => r.GameId == gameId).ToListAsync();
        return Ok(rounds);
    }
}
