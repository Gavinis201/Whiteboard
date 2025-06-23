using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Whiteboard.Models;

namespace Whiteboard.Controllers;

[ApiController]
[Route("api/[controller]")]
public class GamesController : ControllerBase
{
    private readonly GameDbContext _context;
    private static readonly Random _random = new Random();
    private const string _chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

    public GamesController(GameDbContext context)
    {
        _context = context;
    }

    [HttpPost("create")]
    public async Task<IActionResult> CreateGame()
    {
        string joinCode;
        bool isUnique;
        
        do
        {
            joinCode = new string(Enumerable.Repeat(_chars, 6)
                .Select(s => s[_random.Next(s.Length)]).ToArray());
            
            isUnique = !await _context.Games.AnyAsync(g => g.JoinCode == joinCode);
        } while (!isUnique);

        var game = new Game 
        { 
            IsActive = true,
            JoinCode = joinCode
        };
        
        _context.Games.Add(game);
        await _context.SaveChangesAsync();
        return Ok(game);
    }

    [HttpGet("{joinCode}")]
    public async Task<IActionResult> GetGame(string joinCode)
    {
        var game = await _context.Games.Include(g => g.Players).FirstOrDefaultAsync(g => g.JoinCode == joinCode);
        if (game == null) return NotFound();
        return Ok(game);
    }
}
