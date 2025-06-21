using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Whiteboard.Models;

namespace Whiteboard.Controllers;

[ApiController]
[Route("api/[controller]")]
public class PlayersController : ControllerBase
{
    private readonly GameDbContext _context;

    public PlayersController(GameDbContext context)
    {
        _context = context;
    }

    [HttpPost("join")]
    public async Task<IActionResult> JoinGame([FromBody] JoinGameRequest request)
    {
        var game = await _context.Games
            .Include(g => g.Players)
            .FirstOrDefaultAsync(g => g.JoinCode == request.JoinCode);
            
        if (game == null)
        {
            return NotFound("Game not found");
        }

        // Check if player already exists in this game
        var existingPlayer = game.Players.FirstOrDefault(p => p.Name == request.PlayerName);
        if (existingPlayer != null)
        {
            return Ok(existingPlayer);
        }

        var player = new Player
        {
            Name = request.PlayerName,
            IsReader = !game.Players.Any(), // Set as reader if no players exist
            GameId = game.GameId
        };

        _context.Players.Add(player);
        await _context.SaveChangesAsync();
        return Ok(player);
    }
}

public class JoinGameRequest
{
    public string JoinCode { get; set; } = string.Empty;
    public string PlayerName { get; set; } = string.Empty;
}
