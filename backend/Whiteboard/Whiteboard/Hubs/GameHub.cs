using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;
using Microsoft.EntityFrameworkCore;
using Whiteboard.Models;
using System.Collections.Concurrent;

namespace Whiteboard.Hubs;

public class GameHub : Hub
{
    private readonly ILogger<GameHub> _logger;
    private readonly GameDbContext _context;
    
    // Track disconnected players with a grace period
    private static readonly ConcurrentDictionary<string, (string playerId, string playerName, string joinCode, DateTime disconnectTime)> _disconnectedPlayers = new();
    private const int RECONNECTION_GRACE_PERIOD_MINUTES = 5; // 5 minutes to reconnect

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
        
        var game = await _context.Games
            .Include(g => g.Players)
            .FirstOrDefaultAsync(g => g.JoinCode == joinCode);
            
        if (game == null)
        {
            _logger.LogError("Game not found: {JoinCode}", joinCode);
            throw new HubException("Game not found");
        }

        var player = game.Players.FirstOrDefault(p => p.Name == playerName);
        if (player == null)
        {
            _logger.LogInformation("Player not found, creating new player: {PlayerName}", playerName);
            player = new Player
            {
                Name = playerName,
                IsReader = !game.Players.Any(),
                GameId = game.GameId
            };
            _context.Players.Add(player);
            await _context.SaveChangesAsync();
        }

        if (player == null) 
        {
            _logger.LogError("Player could not be found or created for {PlayerName}", playerName);
            throw new HubException("Player could not be found or created");
        }

        // Add to new group and store player info
        await Groups.AddToGroupAsync(Context.ConnectionId, joinCode);
        Context.Items["PlayerId"] = player.PlayerId.ToString();
        Context.Items["JoinCode"] = joinCode;

        // Send the actual database player ID, not the connection ID
        await Clients.Group(joinCode).SendAsync("PlayerJoined", player.PlayerId.ToString(), player.Name);
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
        var playerId = Context.Items["PlayerId"]?.ToString();
        
        if (string.IsNullOrEmpty(playerId))
        {
            _logger.LogError("PlayerId not found for connection {ConnectionId}", Context.ConnectionId);
            throw new HubException("Player not identified");
        }

        var player = await _context.Players.FindAsync(int.Parse(playerId));
        if (player == null)
        {
            _logger.LogError("Player not found in database: {PlayerId}", playerId);
            throw new HubException("Player not found");
        }
        
        await Clients.Group(joinCode).SendAsync("AnswerReceived", playerId, player.Name, answer);
        _logger.LogInformation("Answer submitted by {PlayerName} in game {JoinCode}", player.Name, joinCode);
    }

    public async Task RevealAnswers(string joinCode)
    {
        _logger.LogInformation("Revealing answers in game {JoinCode}", joinCode);
        await Clients.Group(joinCode).SendAsync("AnswersRevealed");
        _logger.LogInformation("Answers revealed successfully in game {JoinCode}", joinCode);
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        if (exception != null)
        {
            _logger.LogError(exception, "Client {ConnectionId} disconnected with error", Context.ConnectionId);
        }

        var playerId = Context.Items["PlayerId"]?.ToString();
        var joinCode = Context.Items["JoinCode"]?.ToString();
        
        if (!string.IsNullOrEmpty(playerId) && !string.IsNullOrEmpty(joinCode))
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, joinCode);
            await Clients.Group(joinCode).SendAsync("PlayerLeft", playerId);
            _logger.LogInformation("Player {PlayerId} left game {JoinCode}", playerId, joinCode);
        }
        
        await base.OnDisconnectedAsync(exception);
    }
    
    // Clean up expired disconnected players periodically
    public static void CleanupExpiredDisconnections()
    {
        var now = DateTime.UtcNow;
        var expiredKeys = _disconnectedPlayers
            .Where(kvp => now - kvp.Value.disconnectTime > TimeSpan.FromMinutes(RECONNECTION_GRACE_PERIOD_MINUTES))
            .Select(kvp => kvp.Key)
            .ToList();
            
        foreach (var key in expiredKeys)
        {
            if (_disconnectedPlayers.TryRemove(key, out var player))
            {
                // Note: We can't send SignalR messages from this static method
                // The cleanup is handled in OnDisconnectedAsync with Task.Run
            }
        }
    }
} 