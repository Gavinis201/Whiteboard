using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;
using Microsoft.EntityFrameworkCore;
using Whiteboard.Models;
using System.Collections.Concurrent;
using System.Linq;
using System.Collections.Generic;
using System.Threading.Tasks;
using System;

namespace Whiteboard.Hubs;

public class GameHub : Hub
{
    private readonly ILogger<GameHub> _logger;
    private readonly GameDbContext _context;
    
    private static readonly ConcurrentDictionary<string, (string playerId, string playerName, string joinCode, DateTime disconnectTime)> _disconnectedPlayers = new();
    private const int RECONNECTION_GRACE_PERIOD_MINUTES = 5;

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
            
        if (game == null) throw new HubException("Game not found");

        var isReconnecting = game.Players.Any(p => p.Name == playerName);
        Player currentPlayer;

        if (isReconnecting)
        {
            currentPlayer = game.Players.First(p => p.Name == playerName);
            _logger.LogInformation("Player {PlayerName} reconnecting.", playerName);
        }
        else
        {
            currentPlayer = new Player
            {
                Name = playerName,
                IsReader = !game.Players.Any(),
                GameId = game.GameId
            };
            _context.Players.Add(currentPlayer);
            await _context.SaveChangesAsync();
            _logger.LogInformation("New player {PlayerName} created.", playerName);
        }
        
        await Groups.AddToGroupAsync(Context.ConnectionId, joinCode);
        Context.Items["PlayerId"] = currentPlayer.PlayerId.ToString();
        Context.Items["JoinCode"] = joinCode;
        Context.Items["PlayerName"] = playerName;

        // --- STATE SYNC LOGIC ---

        // 1. Get the final, updated list of all players
        var updatedPlayers = await _context.Players.Where(p => p.GameId == game.GameId).ToListAsync();

        // 2. Find the current active round and its answers
        var activeRound = await _context.Rounds
            .OrderByDescending(r => r.RoundId)
            .FirstOrDefaultAsync(r => r.GameId == game.GameId && !r.IsCompleted);
            
        List<Answer> currentAnswers = new List<Answer>();
        if (activeRound != null)
        {
            currentAnswers = await _context.Answers
                .Where(a => a.RoundId == activeRound.RoundId)
                .ToListAsync();
        }

        // 3. Send the complete state to the client that just joined/reconnected
        await Clients.Caller.SendAsync("GameStateSynced", new
        {
            Players = updatedPlayers,
            ActiveRound = activeRound,
            CurrentAnswers = currentAnswers
        });
        
        // 4. Broadcast the updated player list to everyone else in the group
        await Clients.GroupExcept(joinCode, Context.ConnectionId).SendAsync("PlayerListUpdated", updatedPlayers);
        
        _logger.LogInformation("Sent full game state to {PlayerName} and updated player list to the group.", playerName);
    }

    public async Task StartRound(string joinCode, string prompt)
    {
        _logger.LogInformation("Starting round in game {JoinCode} with prompt: {Prompt}", joinCode, prompt);
        
        var game = await _context.Games.FirstOrDefaultAsync(g => g.JoinCode == joinCode);
        if (game == null) throw new HubException("Game not found.");

        // Save the new round to the database
        var newRound = new Round
        {
            Prompt = prompt,
            IsCompleted = false,
            GameId = game.GameId
        };
        _context.Rounds.Add(newRound);
        await _context.SaveChangesAsync();

        await Clients.Group(joinCode).SendAsync("RoundStarted", prompt);
        _logger.LogInformation("Round started and saved successfully in game {JoinCode}", joinCode);
    }

    public async Task SubmitAnswer(string joinCode, string answer)
    {
        var playerIdStr = Context.Items["PlayerId"]?.ToString();
        if (string.IsNullOrEmpty(playerIdStr) || !int.TryParse(playerIdStr, out var playerId))
        {
            throw new HubException("Player not identified");
        }

        var player = await _context.Players.FindAsync(playerId);
        if (player == null) throw new HubException("Player not found");
        
        var activeRound = await _context.Rounds
            .OrderByDescending(r => r.RoundId)
            .FirstOrDefaultAsync(r => r.GameId == player.GameId && !r.IsCompleted);
            
        if (activeRound == null) throw new HubException("No active round to submit an answer to.");

        // Save the new answer to the database
        var newAnswer = new Answer
        {
            Content = answer,
            PlayerName = player.Name,
            PlayerId = player.PlayerId,
            RoundId = activeRound.RoundId
        };
        _context.Answers.Add(newAnswer);
        await _context.SaveChangesAsync();

        await Clients.Group(joinCode).SendAsync("AnswerReceived", playerId.ToString(), player.Name, answer);
        _logger.LogInformation("Answer submitted and saved by {PlayerName} in game {JoinCode}", player.Name, joinCode);
    }

    public async Task LeaveGame(string joinCode)
    {
        var playerIdStr = Context.Items["PlayerId"]?.ToString();
        var playerName = Context.Items["PlayerName"]?.ToString();
        
        if (string.IsNullOrEmpty(playerIdStr) || string.IsNullOrEmpty(playerName))
        {
            throw new HubException("Player not identified");
        }

        _logger.LogInformation("Player {PlayerName} intentionally leaving game {JoinCode}", playerName, joinCode);
        
        // Remove from disconnected players list if they were there (for reconnection)
        var disconnectedKey = $"{joinCode}_{playerName}";
        _disconnectedPlayers.TryRemove(disconnectedKey, out _);
        
        // Remove player from database immediately
        if (int.TryParse(playerIdStr, out var playerId))
        {
            var player = await _context.Players.FindAsync(playerId);
            if (player != null)
            {
                var gameId = player.GameId;
                var isHost = player.IsReader;
                
                // If the host is leaving, kick all other players
                if (isHost)
                {
                    _logger.LogInformation("Host {PlayerName} is leaving, kicking all other players from game {JoinCode}", playerName, joinCode);
                    
                    // Get all other players in the game
                    var otherPlayers = await _context.Players.Where(p => p.GameId == gameId && p.PlayerId != playerId).ToListAsync();
                    
                    // Kick each player
                    foreach (var otherPlayer in otherPlayers)
                    {
                        var otherDisconnectedKey = $"{joinCode}_{otherPlayer.Name}";
                        _disconnectedPlayers.TryRemove(otherDisconnectedKey, out _);
                        
                        // Notify the kicked player
                        await Clients.Group(joinCode).SendAsync("PlayerKicked", otherPlayer.PlayerId.ToString(), otherPlayer.Name);
                        _logger.LogInformation("Kicked player {PlayerName} because host left", otherPlayer.Name);
                    }
                    
                    // Remove all players from the game
                    _context.Players.RemoveRange(otherPlayers);
                    
                    // Also remove any active rounds and answers for this game
                    var activeRounds = await _context.Rounds.Where(r => r.GameId == gameId && !r.IsCompleted).ToListAsync();
                    foreach (var round in activeRounds)
                    {
                        var roundAnswers = await _context.Answers.Where(a => a.RoundId == round.RoundId).ToListAsync();
                        _context.Answers.RemoveRange(roundAnswers);
                    }
                    _context.Rounds.RemoveRange(activeRounds);
                    
                    // Remove the host player
                    _context.Players.Remove(player);
                    await _context.SaveChangesAsync();
                    _logger.LogInformation("Host {PlayerName} removed from database", playerName);
                    
                    // Send empty player list to remaining players (host is still in group at this point)
                    await Clients.Group(joinCode).SendAsync("PlayerListUpdated", new List<Player>());
                    _logger.LogInformation("Sent empty player list to group {JoinCode} after host left", joinCode);
                }
                else
                {
                    // Remove the leaving player
                    _context.Players.Remove(player);
                    await _context.SaveChangesAsync();
                    _logger.LogInformation("Player {PlayerName} removed from database", playerName);
                    
                    // Update the player list for remaining players
                    var updatedPlayers = await _context.Players.Where(p => p.GameId == gameId).ToListAsync();
                    await Clients.Group(joinCode).SendAsync("PlayerListUpdated", updatedPlayers);
                    _logger.LogInformation("Sent updated player list to group {JoinCode} after player left", joinCode);
                }
            }
        }
        
        // Remove from SignalR group AFTER sending all messages
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, joinCode);
        
        // Clear context items
        Context.Items.Clear();
    }

    public async Task KickPlayer(string joinCode, int playerIdToKick)
    {
        var currentPlayerIdStr = Context.Items["PlayerId"]?.ToString();
        var currentPlayerName = Context.Items["PlayerName"]?.ToString();
        
        if (string.IsNullOrEmpty(currentPlayerIdStr) || string.IsNullOrEmpty(currentPlayerName))
        {
            throw new HubException("Player not identified");
        }

        // Check if the current player is the reader (host)
        var currentPlayer = await _context.Players.FindAsync(int.Parse(currentPlayerIdStr));
        if (currentPlayer == null || !currentPlayer.IsReader)
        {
            throw new HubException("Only the host can kick players");
        }

        // Find the player to kick
        var playerToKick = await _context.Players.FindAsync(playerIdToKick);
        if (playerToKick == null)
        {
            throw new HubException("Player to kick not found");
        }

        // Ensure the player to kick is in the same game
        if (playerToKick.GameId != currentPlayer.GameId)
        {
            throw new HubException("Player is not in the same game");
        }

        // Prevent kicking yourself
        if (playerToKick.PlayerId == currentPlayer.PlayerId)
        {
            throw new HubException("Cannot kick yourself");
        }

        _logger.LogInformation("Host {HostName} kicking player {PlayerName} from game {JoinCode}", currentPlayerName, playerToKick.Name, joinCode);

        // Remove from disconnected players list if they were there
        var disconnectedKey = $"{joinCode}_{playerToKick.Name}";
        _disconnectedPlayers.TryRemove(disconnectedKey, out _);

        // Remove player from database
        _context.Players.Remove(playerToKick);
        await _context.SaveChangesAsync();
        _logger.LogInformation("Player {PlayerName} kicked and removed from database", playerToKick.Name);

        // Notify the kicked player
        await Clients.Group(joinCode).SendAsync("PlayerKicked", playerToKick.PlayerId.ToString(), playerToKick.Name);

        // Update the player list for remaining players
        var updatedPlayers = await _context.Players.Where(p => p.GameId == currentPlayer.GameId).ToListAsync();
        await Clients.Group(joinCode).SendAsync("PlayerListUpdated", updatedPlayers);
        _logger.LogInformation("Sent updated player list to group {JoinCode} after player was kicked", joinCode);
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
            
            // Check if the disconnected player is the host
            if (int.TryParse(playerId, out var playerIdInt))
            {
                var player = await _context.Players.FindAsync(playerIdInt);
                if (player != null && player.IsReader)
                {
                    // Host disconnected - kick all other players immediately
                    _logger.LogInformation("Host {PlayerName} disconnected unexpectedly, kicking all other players from game {JoinCode}", playerName, joinCode);
                    
                    var gameId = player.GameId;
                    var otherPlayers = await _context.Players.Where(p => p.GameId == gameId && p.PlayerId != playerIdInt).ToListAsync();
                    
                    // Kick each player
                    foreach (var otherPlayer in otherPlayers)
                    {
                        var otherDisconnectedKey = $"{joinCode}_{otherPlayer.Name}";
                        _disconnectedPlayers.TryRemove(otherDisconnectedKey, out _);
                        
                        // Notify the kicked player
                        await Clients.Group(joinCode).SendAsync("PlayerKicked", otherPlayer.PlayerId.ToString(), otherPlayer.Name);
                        _logger.LogInformation("Kicked player {PlayerName} because host disconnected", otherPlayer.Name);
                    }
                    
                    // Remove all players from the game
                    _context.Players.RemoveRange(otherPlayers);
                    _context.Players.Remove(player);
                    await _context.SaveChangesAsync();
                    
                    // Send empty player list to remaining players
                    await Clients.Group(joinCode).SendAsync("PlayerListUpdated", new List<Player>());
                    _logger.LogInformation("Sent empty player list to group {JoinCode} after host disconnected", joinCode);
                    
                    return; // Don't add host to reconnection list
                }
            }
            
            // For non-host players, add to reconnection list
            var disconnectedKey = $"{joinCode}_{playerName}";
            _disconnectedPlayers.TryAdd(disconnectedKey, (playerId, playerName, joinCode, DateTime.UtcNow));
            
            _logger.LogInformation("Player {PlayerName} disconnected from game {JoinCode}, added to reconnection list", playerName, joinCode);
            
            _ = Task.Run(async () =>
            {
                await Task.Delay(TimeSpan.FromMinutes(RECONNECTION_GRACE_PERIOD_MINUTES));
                await CleanupExpiredPlayer(disconnectedKey, playerId, joinCode);
            });
        }
        
        await base.OnDisconnectedAsync(exception);
    }
    
    private async Task CleanupExpiredPlayer(string disconnectedKey, string playerId, string joinCode)
    {
        if (_disconnectedPlayers.TryRemove(disconnectedKey, out var disconnectedInfo))
        {
            _logger.LogInformation("Player {PlayerName} did not reconnect, removing from game {JoinCode}", disconnectedInfo.playerName, joinCode);
            
            int gameId = 0;
            try
            {
                var player = await _context.Players.FindAsync(int.Parse(playerId));
                if (player != null)
                {
                    gameId = player.GameId;
                    _context.Players.Remove(player);
                    await _context.SaveChangesAsync();
                    _logger.LogInformation("Player {PlayerName} removed from database", disconnectedInfo.playerName);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error removing player {PlayerName} from database", disconnectedInfo.playerName);
            }
            
            if (gameId > 0)
            {
                var updatedPlayers = await _context.Players.Where(p => p.GameId == gameId).ToListAsync();
                await Clients.Group(joinCode).SendAsync("PlayerListUpdated", updatedPlayers);
                _logger.LogInformation("Sent updated player list to group {JoinCode} after player removal", joinCode);
            }
        }
    }
}