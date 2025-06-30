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

        // Strict uniqueness check
        var nameTaken = game.Players.Any(p => p.Name.Equals(request.PlayerName, StringComparison.OrdinalIgnoreCase));
        if (nameTaken)
        {
            return BadRequest($"The name '{request.PlayerName}' is already taken. Please choose a different name.");
        }

        var isFirstPlayer = !game.Players.Any();

        var player = new Player
        {
            Name = request.PlayerName,
            IsReader = isFirstPlayer, // First player becomes the reader
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
