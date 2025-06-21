using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;
using Microsoft.EntityFrameworkCore;
using Whiteboard.Models;

namespace Whiteboard.Hubs;

public class GameHub : Hub
{
    private readonly ILogger<GameHub> _logger;
    private readonly GameDbContext _context;

    public GameHub(ILogger<GameHub> logger, GameDbContext context)
    {
        _logger = logger;
        _context = context;
    }

    public override async Task OnConnectedAsync()
    {
        _logger.LogInformation("Client connected: {ConnectionId}", Context.ConnectionId);
        await base.OnConnectedAsync();
    }

    public async Task JoinGame(string joinCode, string playerName)
    {
        _logger.LogInformation("Client {ConnectionId} joining game: {JoinCode} as {PlayerName}", Context.ConnectionId, joinCode, playerName);
        
        // Remove from any existing groups
        var existingGroups = Context.Items.Keys.Where(k => k.ToString().StartsWith("game_")).ToList();
        foreach (var group in existingGroups)
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, group.ToString());
        }

        // Clear any existing player data
        Context.Items.Clear();

        // Find or create the player in the database
        var game = await _context.Games
            .Include(g => g.Players)
            .FirstOrDefaultAsync(g => g.JoinCode == joinCode);
            
        if (game == null)
        {
            _logger.LogError("Game not found: {JoinCode}", joinCode);
            throw new Exception("Game not found");
        }

        // Find existing player or create new one
        var player = game.Players.FirstOrDefault(p => p.Name == playerName);
        if (player == null)
        {
            player = new Player
            {
                Name = playerName,
                IsReader = !game.Players.Any(), // Set as reader if no players exist
                GameId = game.GameId
            };
            _context.Players.Add(player);
            await _context.SaveChangesAsync();
            _logger.LogInformation("Created new player: {PlayerId} for game: {JoinCode}", player.PlayerId, joinCode);
        }

        // Add to new group and store player info
        await Groups.AddToGroupAsync(Context.ConnectionId, joinCode);
        Context.Items["PlayerName"] = playerName;
        Context.Items["PlayerId"] = player.PlayerId.ToString();
        Context.Items["JoinCode"] = joinCode;
        Context.Items[$"game_{joinCode}"] = true; // Mark this connection as part of the game

        // Send the actual database player ID, not the connection ID
        await Clients.Group(joinCode).SendAsync("PlayerJoined", player.PlayerId.ToString(), playerName);
        _logger.LogInformation("Client {ConnectionId} successfully joined game: {JoinCode} as {PlayerName} (PlayerId: {PlayerId})", Context.ConnectionId, joinCode, playerName, player.PlayerId);
    }

    public async Task StartRound(string joinCode, string prompt)
    {
        _logger.LogInformation("Starting round in game {JoinCode} with prompt: {Prompt}", joinCode, prompt);
        await Clients.Group(joinCode).SendAsync("RoundStarted", prompt);
        _logger.LogInformation("Round started successfully in game {JoinCode}", joinCode);
    }

    public async Task SubmitAnswer(string joinCode, string answer)
    {
        _logger.LogInformation("Client {ConnectionId} submitting answer in game {JoinCode}", Context.ConnectionId, joinCode);
        
        // Verify the player is in the correct game
        if (!Context.Items.ContainsKey($"game_{joinCode}"))
        {
            _logger.LogError("Player {ConnectionId} not in game {JoinCode}", Context.ConnectionId, joinCode);
            throw new Exception("Player not in game");
        }

        var playerName = Context.Items["PlayerName"]?.ToString();
        var playerId = Context.Items["PlayerId"]?.ToString();
        
        if (string.IsNullOrEmpty(playerName))
        {
            _logger.LogError("Player name not found in connection context for {ConnectionId}", Context.ConnectionId);
            throw new Exception("Player name not found in connection context");
        }

        // Use the actual player ID if available, otherwise use connection ID as fallback
        var answerPlayerId = !string.IsNullOrEmpty(playerId) ? playerId : Context.ConnectionId;
        
        await Clients.Group(joinCode).SendAsync("AnswerReceived", answerPlayerId, playerName, answer);
        _logger.LogInformation("Answer submitted successfully by {PlayerName} (PlayerId: {PlayerId}) in game {JoinCode}", playerName, answerPlayerId, joinCode);
    }

    public async Task RevealAnswers(string joinCode)
    {
        _logger.LogInformation("Revealing answers in game {JoinCode}", joinCode);
        await Clients.Group(joinCode).SendAsync("AnswersRevealed");
        _logger.LogInformation("Answers revealed successfully in game {JoinCode}", joinCode);
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        _logger.LogInformation("Client disconnected: {ConnectionId}", Context.ConnectionId);
        if (exception != null)
        {
            _logger.LogError(exception, "Client {ConnectionId} disconnected with error", Context.ConnectionId);
        }
        
        // Get the player ID before removing from groups
        var playerId = Context.Items["PlayerId"]?.ToString();
        var joinCode = Context.Items["JoinCode"]?.ToString();
        
        // Remove from all groups
        var groups = Context.Items.Keys.Where(k => k.ToString().StartsWith("game_")).ToList();
        foreach (var group in groups)
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, group.ToString());
        }
        
        await base.OnDisconnectedAsync(exception);
        
        // Send the actual player ID if we have it, otherwise send connection ID as fallback
        if (!string.IsNullOrEmpty(playerId) && !string.IsNullOrEmpty(joinCode))
        {
            await Clients.Group(joinCode).SendAsync("PlayerLeft", playerId);
            _logger.LogInformation("Player {PlayerId} left game {JoinCode}", playerId, joinCode);
        }
        else
        {
            await Clients.All.SendAsync("PlayerLeft", Context.ConnectionId);
            _logger.LogInformation("Player with connection {ConnectionId} left (no player ID found)", Context.ConnectionId);
        }
    }
} 