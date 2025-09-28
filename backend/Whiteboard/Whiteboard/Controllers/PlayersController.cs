using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Whiteboard.Models;

namespace Whiteboard.Controllers;

[ApiController]
[Route("api/[controller]")]
public class PlayersController : ControllerBase
{
    private readonly GameDbContext _context;
    private readonly ILogger<PlayersController> _logger;

    public PlayersController(GameDbContext context, ILogger<PlayersController> logger)
    {
        _context = context;
        _logger = logger;
    }

    [HttpPost("join")]
    public async Task<IActionResult> JoinGame([FromBody] JoinGameRequest request)
    {
        _logger.LogInformation("REST API JoinGame called for joinCode: {JoinCode}, playerName: {PlayerName}", request.JoinCode, request.PlayerName);
        
        var game = await _context.Games
            .Include(g => g.Players)
            .Include(g => g.Rounds)
            .FirstOrDefaultAsync(g => g.JoinCode == request.JoinCode);
            
        if (game == null)
        {
            _logger.LogWarning("Game not found for joinCode: {JoinCode}", request.JoinCode);
            return NotFound("Game not found");
        }

        _logger.LogInformation("Found game {GameId} with {PlayerCount} existing players", game.GameId, game.Players.Count);
        
        // Log all existing player names for debugging
        foreach (var existingPlayer in game.Players)
        {
            _logger.LogInformation("Existing player: {PlayerName} (ID: {PlayerId})", existingPlayer.Name, existingPlayer.PlayerId);
        }

        // Strict uniqueness check
        var nameTaken = game.Players.Any(p => p.Name.Equals(request.PlayerName, StringComparison.OrdinalIgnoreCase));
        _logger.LogInformation("Name '{RequestedName}' taken check result: {NameTaken}", request.PlayerName, nameTaken);
        
        if (nameTaken)
        {
            _logger.LogWarning("Name '{RequestedName}' is already taken, returning BadRequest", request.PlayerName);
            return BadRequest($"The name '{request.PlayerName}' is already taken. Please choose a different name.");
        }

        var isFirstPlayer = !game.Players.Any();
        _logger.LogInformation("Creating new player '{PlayerName}', isFirstPlayer: {IsFirstPlayer}", request.PlayerName, isFirstPlayer);

        // If a round is currently active, exclude this new player from the current round
        var hasActiveRound = game.Rounds.Any(r => !r.IsCompleted);

        var player = new Player
        {
            Name = request.PlayerName,
            IsReader = isFirstPlayer, // First player becomes the reader
            GameId = game.GameId,
            ExcludeFromCurrentRound = hasActiveRound
        };

        _context.Players.Add(player);
        await _context.SaveChangesAsync();
        
        _logger.LogInformation("Successfully created player '{PlayerName}' with ID {PlayerId}", player.Name, player.PlayerId);
        return Ok(player);
    }
}

public class JoinGameRequest
{
    public string JoinCode { get; set; } = string.Empty;
    public string PlayerName { get; set; } = string.Empty;
}
