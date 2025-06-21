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

        // Check if this is a reconnection attempt
        var existingPlayer = game.Players.FirstOrDefault(p => p.Name == playerName);
        if (existingPlayer != null)
        {
            _logger.LogInformation("Player {PlayerName} reconnecting to game {JoinCode}", playerName, joinCode);
            
            // Remove from disconnected players list if they were there
            var disconnectedKey = $"{joinCode}_{playerName}";
            if (_disconnectedPlayers.TryRemove(disconnectedKey, out var disconnectedPlayer))
            {
                _logger.LogInformation("Player {PlayerName} reconnected within grace period", playerName);
            }
            
            // Add to group and store player info
            await Groups.AddToGroupAsync(Context.ConnectionId, joinCode);
            Context.Items["PlayerId"] = existingPlayer.PlayerId.ToString();
            Context.Items["JoinCode"] = joinCode;
            Context.Items["PlayerName"] = playerName;

            // Notify others that player has reconnected
            await Clients.Group(joinCode).SendAsync("PlayerReconnected", existingPlayer.PlayerId.ToString(), existingPlayer.Name);
            _logger.LogInformation("Player {PlayerName} successfully reconnected to game {JoinCode}", playerName, joinCode);
            return;
        }

        // This is a new player joining
        _logger.LogInformation("New player joining: {PlayerName}", playerName);
        var newPlayer = new Player
        {
            Name = playerName,
            IsReader = !game.Players.Any(),
            GameId = game.GameId
        };
        _context.Players.Add(newPlayer);
        await _context.SaveChangesAsync();

        // Add to group and store player info
        await Groups.AddToGroupAsync(Context.ConnectionId, joinCode);
        Context.Items["PlayerId"] = newPlayer.PlayerId.ToString();
        Context.Items["JoinCode"] = joinCode;
        Context.Items["PlayerName"] = playerName;

        // Send the actual database player ID, not the connection ID
        await Clients.Group(joinCode).SendAsync("PlayerJoined", newPlayer.PlayerId.ToString(), newPlayer.Name);
        _logger.LogInformation("New player {PlayerName} successfully joined game: {JoinCode} (PlayerId: {PlayerId})", playerName, joinCode, newPlayer.PlayerId);
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
        var playerName = Context.Items["PlayerName"]?.ToString();
        
        if (!string.IsNullOrEmpty(playerId) && !string.IsNullOrEmpty(joinCode) && !string.IsNullOrEmpty(playerName))
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, joinCode);
            
            // Add to disconnected players list instead of immediately removing
            var disconnectedKey = $"{joinCode}_{playerName}";
            _disconnectedPlayers.TryAdd(disconnectedKey, (playerId, playerName, joinCode, DateTime.UtcNow));
            
            _logger.LogInformation("Player {PlayerName} disconnected from game {JoinCode}, added to reconnection list", playerName, joinCode);
            
            // Schedule cleanup after grace period
            _ = Task.Run(async () =>
            {
                await Task.Delay(TimeSpan.FromMinutes(RECONNECTION_GRACE_PERIOD_MINUTES));
                await CleanupExpiredPlayer(disconnectedKey, playerId, playerName, joinCode);
            });
        }
        
        await base.OnDisconnectedAsync(exception);
    }
    
    private async Task CleanupExpiredPlayer(string disconnectedKey, string playerId, string playerName, string joinCode)
    {
        if (_disconnectedPlayers.TryRemove(disconnectedKey, out var disconnectedPlayer))
        {
            _logger.LogInformation("Player {PlayerName} did not reconnect within grace period, removing from game {JoinCode}", playerName, joinCode);
            
            // Remove player from database
            try
            {
                var player = await _context.Players.FindAsync(int.Parse(playerId));
                if (player != null)
                {
                    _context.Players.Remove(player);
                    await _context.SaveChangesAsync();
                    _logger.LogInformation("Player {PlayerName} removed from database", playerName);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error removing player {PlayerName} from database", playerName);
            }
            
            // Notify other players that this player has permanently left
            await Clients.Group(joinCode).SendAsync("PlayerLeft", playerId);
        }
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