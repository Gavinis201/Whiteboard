using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;
using Microsoft.EntityFrameworkCore;
using Whiteboard.Models;
using System.Collections.Concurrent;
using System.Linq;
using System.Collections.Generic;
using System.Threading.Tasks;
using System;
using System.Threading;

namespace Whiteboard.Hubs;

public class GameHub : Hub
{
    private readonly ILogger<GameHub> _logger;
    private readonly GameDbContext _context;
    
    private static readonly ConcurrentDictionary<string, (string playerId, string playerName, string joinCode, DateTime disconnectTime)> _disconnectedPlayers = new();
    private static readonly ConcurrentDictionary<string, string> _playerConnectionIds = new(); // joinCode_playerName -> connectionId
    private const int RECONNECTION_GRACE_PERIOD_MINUTES = 10;
    
    // Timer tracking for backend auto-submission
    private static readonly ConcurrentDictionary<string, (int roundId, DateTime startTime, int durationMinutes, Timer timer)> _activeTimers = new(); // joinCode -> timer info

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
        _logger.LogInformation("SignalR JoinGame called for joinCode: {JoinCode}, playerName: {PlayerName}, connectionId: {ConnectionId}", joinCode, playerName, Context.ConnectionId);
        
        var game = await _context.Games
            .Include(g => g.Players)
            .FirstOrDefaultAsync(g => g.JoinCode == joinCode);
            
        if (game == null) throw new HubException("Game not found");

        _logger.LogInformation("Found game {GameId} with {PlayerCount} existing players", game.GameId, game.Players.Count);
        
        // Log all existing player names for debugging
        foreach (var existingPlayer in game.Players)
        {
            _logger.LogInformation("Existing player: {PlayerName} (ID: {PlayerId})", existingPlayer.Name, existingPlayer.PlayerId);
        }

        // Check if this specific connection is trying to reconnect to an existing session
        var connectionKey = $"{joinCode}_{playerName}";
        var isReconnecting = _playerConnectionIds.TryGetValue(connectionKey, out var existingConnectionId) && 
                            existingConnectionId != Context.ConnectionId;
        
        _logger.LogInformation("Connection key: {ConnectionKey}, isReconnecting: {IsReconnecting}, existingConnectionId: {ExistingConnectionId}", connectionKey, isReconnecting, existingConnectionId);
        
        Player currentPlayer = null;

        if (isReconnecting)
        {
            // This is a legitimate reconnection - find the existing player
            currentPlayer = game.Players.FirstOrDefault(p => p.Name == playerName);
            if (currentPlayer != null)
            {
                _logger.LogInformation("Player {PlayerName} reconnecting with new connection ID {ConnectionId}.", playerName, Context.ConnectionId);
                // Remove from disconnected players list if they were there
                var reconnectingKey = $"{joinCode}_{playerName}";
                if (_disconnectedPlayers.TryRemove(reconnectingKey, out var disconnectedInfo))
                {
                    _logger.LogInformation("Player {PlayerName} successfully reconnected, removed from disconnected list", playerName);
                }
                else
                {
                    _logger.LogInformation("Player {PlayerName} reconnecting but was not in disconnected list", playerName);
                }
            }
            else
            {
                // Player doesn't exist in database, treat as new player
                _logger.LogWarning("Player {PlayerName} marked as reconnecting but not found in database, treating as new player", playerName);
                isReconnecting = false;
            }
        }

        if (!isReconnecting)
        {
            // First, check if a player with this name already exists in the database (from REST API call)
            var existingPlayer = game.Players.FirstOrDefault(p => p.Name.Equals(playerName, StringComparison.OrdinalIgnoreCase));
            
            if (existingPlayer != null)
            {
                _logger.LogInformation("Found existing player '{PlayerName}' with ID {PlayerId} from REST API call", existingPlayer.Name, existingPlayer.PlayerId);
                currentPlayer = existingPlayer;
            }
            else
            {
                // Check if the name is already taken by any player in this game (case-insensitive)
                var nameTaken = game.Players.Any(p => p.Name.Equals(playerName, StringComparison.OrdinalIgnoreCase));
                _logger.LogInformation("Name '{RequestedName}' taken check result: {NameTaken}", playerName, nameTaken);
                
                if (nameTaken)
                {
                    _logger.LogWarning("Name '{RequestedName}' is already taken, throwing HubException", playerName);
                    throw new HubException($"The name '{playerName}' is already taken. Please choose a different name.");
                }

                _logger.LogInformation("Creating new player '{PlayerName}', isFirstPlayer: {IsFirstPlayer}", playerName, !game.Players.Any());
                
                currentPlayer = new Player
                {
                    Name = playerName,
                    IsReader = !game.Players.Any(),
                    GameId = game.GameId
                };
                _context.Players.Add(currentPlayer);
                await _context.SaveChangesAsync();
                _logger.LogInformation("Successfully created player '{PlayerName}' with ID {PlayerId}", currentPlayer.Name, currentPlayer.PlayerId);
            }
        }
        
        await Groups.AddToGroupAsync(Context.ConnectionId, joinCode);
        _logger.LogInformation("Added player {PlayerName} to SignalR group {JoinCode} with connection ID {ConnectionId}", playerName, joinCode, Context.ConnectionId);
        
        Context.Items["PlayerId"] = currentPlayer.PlayerId.ToString();
        Context.Items["JoinCode"] = joinCode;
        Context.Items["PlayerName"] = playerName;

        // Track the connection ID for this player
        string? oldConnectionId = null;
        _playerConnectionIds.AddOrUpdate(connectionKey, Context.ConnectionId, (key, oldValue) => 
        {
            oldConnectionId = oldValue;
            return Context.ConnectionId;
        });
        _logger.LogInformation("Updated connection tracking for {PlayerName}: {OldConnectionId} -> {NewConnectionId}", playerName, oldConnectionId ?? "none", Context.ConnectionId);

        // --- OPTIMIZED STATE SYNC LOGIC ---
        // Combine all queries into a single efficient query

        // Get all players, active round, and answers in one go
        var gameState = await _context.Games
            .Where(g => g.GameId == game.GameId)
            .Select(g => new
            {
                Players = g.Players.ToList(),
                ActiveRound = g.Rounds
                    .Where(r => !r.IsCompleted)
                    .OrderByDescending(r => r.RoundId)
                    .FirstOrDefault(),
                CurrentAnswers = g.Rounds
                    .Where(r => !r.IsCompleted)
                    .OrderByDescending(r => r.RoundId)
                    .SelectMany(r => r.Answers)
                    .ToList(),
                JudgingModeEnabled = g.JudgingModeEnabled
            })
            .FirstOrDefaultAsync();

        if (gameState == null)
        {
            throw new HubException("Game state not found");
        }

        // Send the complete state to the client that just joined/reconnected
        _logger.LogInformation("Sending GameStateSynced with JudgingModeEnabled: {JudgingModeEnabled}", gameState.JudgingModeEnabled);
        await Clients.Caller.SendAsync("GameStateSynced", new
        {
            Players = gameState.Players,
            ActiveRound = gameState.ActiveRound,
            CurrentAnswers = gameState.CurrentAnswers,
            JudgingModeEnabled = gameState.JudgingModeEnabled,
            // Add timer information for reconnecting players
            TimerInfo = gameState.ActiveRound != null && gameState.ActiveRound.TimerStartTime.HasValue ? new
            {
                StartTime = gameState.ActiveRound.TimerStartTime.Value,
                DurationMinutes = gameState.ActiveRound.TimerDurationMinutes,
                RemainingSeconds = gameState.ActiveRound.TimerDurationMinutes.HasValue ? 
                    (int?)Math.Max(0, (int)(gameState.ActiveRound.TimerDurationMinutes.Value * 60 - (DateTime.UtcNow - gameState.ActiveRound.TimerStartTime.Value).TotalSeconds)) : null
            } : null
        });
        
        // Broadcast the updated player list to everyone else in the group
        await Clients.GroupExcept(joinCode, Context.ConnectionId).SendAsync("PlayerListUpdated", gameState.Players);
        
        _logger.LogInformation("Sent full game state to {PlayerName} and updated player list to the group.", playerName);
    }

    public async Task StartRound(string joinCode, string prompt, int? timerDurationMinutes = null)
    {
        _logger.LogInformation("Starting round in game {JoinCode} with prompt: {Prompt} and timer: {TimerDuration} minutes", joinCode, prompt, timerDurationMinutes);
        
        var game = await _context.Games.FirstOrDefaultAsync(g => g.JoinCode == joinCode);
        if (game == null) throw new HubException("Game not found.");

        // Save the new round to the database
        var newRound = new Round
        {
            Prompt = prompt,
            IsCompleted = false,
            GameId = game.GameId,
            TimerDurationMinutes = timerDurationMinutes,
            TimerStartTime = timerDurationMinutes.HasValue ? DateTime.UtcNow : null
        };
        _context.Rounds.Add(newRound);
        await _context.SaveChangesAsync();

        // Set up backend timer if duration is specified
        if (timerDurationMinutes.HasValue && timerDurationMinutes.Value > 0)
        {
            var timerKey = joinCode;
            
            // Dispose of any existing timer for this game
            if (_activeTimers.TryRemove(timerKey, out var existingTimer))
            {
                existingTimer.timer?.Dispose();
            }
            
            // Create new timer for auto-submission
            var timer = new Timer(async _ => await AutoSubmitRemainingAnswers(joinCode, newRound.RoundId), null, 
                TimeSpan.FromMinutes(timerDurationMinutes.Value), Timeout.InfiniteTimeSpan);
            
            _activeTimers.TryAdd(timerKey, (newRound.RoundId, DateTime.UtcNow, timerDurationMinutes.Value, timer));
            
            _logger.LogInformation("Backend timer started for game {JoinCode} with {Duration} minutes", joinCode, timerDurationMinutes.Value);
        }

        // Send the roundId along with the prompt and timer info so frontend can properly track submissions
        await Clients.Group(joinCode).SendAsync("RoundStarted", prompt, newRound.RoundId, timerDurationMinutes);
        _logger.LogInformation("Round started and saved successfully in game {JoinCode} with roundId {RoundId}", joinCode, newRound.RoundId);
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

        // Check if player has already submitted an answer for this round
        var existingAnswer = await _context.Answers
            .FirstOrDefaultAsync(a => a.PlayerId == player.PlayerId && a.RoundId == activeRound.RoundId);
            
        if (existingAnswer != null)
        {
            throw new HubException("You have already submitted an answer for this round.");
        }

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

        await Clients.Group(joinCode).SendAsync("AnswerReceived", playerId.ToString(), player.Name, answer, newAnswer.AnswerId);
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
        var leaveDisconnectedKey = $"{joinCode}_{playerName}";
        _disconnectedPlayers.TryRemove(leaveDisconnectedKey, out _);
        
        // Remove connection tracking
        var leaveConnectionKey = $"{joinCode}_{playerName}";
        _playerConnectionIds.TryRemove(leaveConnectionKey, out _);
        
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
                    
                    // Get all other players in the game (only those still in the database)
                    var otherPlayers = await _context.Players.Where(p => p.GameId == gameId && p.PlayerId != playerId).ToListAsync();
                    
                    // Send empty player list to all players BEFORE removing them from the group
                    await Clients.Group(joinCode).SendAsync("PlayerListUpdated", new List<Player>());
                    _logger.LogInformation("Sent empty player list to group {JoinCode} before kicking players", joinCode);
                    
                    // Kick each player who is still in the database
                    foreach (var otherPlayer in otherPlayers)
                    {
                        var otherDisconnectedKey = $"{joinCode}_{otherPlayer.Name}";
                        _disconnectedPlayers.TryRemove(otherDisconnectedKey, out _);
                        
                        // Remove connection tracking for kicked players
                        var otherConnectionKey = $"{joinCode}_{otherPlayer.Name}";
                        if (_playerConnectionIds.TryRemove(otherConnectionKey, out var otherConnectionId))
                        {
                            // Remove kicked player from SignalR group
                            await Groups.RemoveFromGroupAsync(otherConnectionId, joinCode);
                            _logger.LogInformation("Removed kicked player {PlayerName} from SignalR group", otherPlayer.Name);
                        }
                        
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
        _logger.LogInformation("Removed player {PlayerName} from SignalR group {JoinCode}", playerName, joinCode);
        
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
        var kickDisconnectedKey = $"{joinCode}_{playerToKick.Name}";
        _disconnectedPlayers.TryRemove(kickDisconnectedKey, out _);

        // Remove player from database
        _context.Players.Remove(playerToKick);
        await _context.SaveChangesAsync();
        _logger.LogInformation("Player {PlayerName} kicked and removed from database", playerToKick.Name);

        // Notify the kicked player BEFORE removing them from the group
        await Clients.Group(joinCode).SendAsync("PlayerKicked", playerToKick.PlayerId.ToString(), playerToKick.Name);

        // Remove the kicked player from the SignalR group AFTER sending the event
        var kickedPlayerConnectionKey = $"{joinCode}_{playerToKick.Name}";
        if (_playerConnectionIds.TryRemove(kickedPlayerConnectionKey, out var kickedPlayerConnectionId))
        {
            await Groups.RemoveFromGroupAsync(kickedPlayerConnectionId, joinCode);
            _logger.LogInformation("Removed kicked player {PlayerName} from SignalR group", playerToKick.Name);
        }

        // Update the player list for remaining players
        var updatedPlayers = await _context.Players.Where(p => p.GameId == currentPlayer.GameId).ToListAsync();
        await Clients.Group(joinCode).SendAsync("PlayerListUpdated", updatedPlayers);
        _logger.LogInformation("Sent updated player list to group {JoinCode} after player was kicked", joinCode);
    }

    public async Task ToggleJudgingMode(string joinCode, bool enabled)
    {
        var playerIdStr = Context.Items["PlayerId"]?.ToString();
        if (string.IsNullOrEmpty(playerIdStr) || !int.TryParse(playerIdStr, out var playerId))
        {
            throw new HubException("Player not identified");
        }

        var player = await _context.Players.FindAsync(playerId);
        if (player == null) throw new HubException("Player not found");
        
        if (!player.IsReader) throw new HubException("Only the host can toggle judging mode");

        var game = await _context.Games.FirstOrDefaultAsync(g => g.JoinCode == joinCode);
        if (game == null) throw new HubException("Game not found");

        game.JudgingModeEnabled = enabled;
        await _context.SaveChangesAsync();

        await Clients.Group(joinCode).SendAsync("JudgingModeToggled", enabled);
        
        _logger.LogInformation("Judging mode {Enabled} for game {JoinCode} by host {HostName}", enabled ? "enabled" : "disabled", joinCode, player.Name);
    }

    public async Task SubmitVote(string joinCode, int votedAnswerId)
    {
        var playerIdStr = Context.Items["PlayerId"]?.ToString();
        if (string.IsNullOrEmpty(playerIdStr) || !int.TryParse(playerIdStr, out var voterPlayerId))
        {
            throw new HubException("Player not identified");
        }

        var voter = await _context.Players.FindAsync(voterPlayerId);
        if (voter == null) throw new HubException("Player not found");

        var game = await _context.Games
            .Include(g => g.Players)
            .Include(g => g.Rounds)
            .FirstOrDefaultAsync(g => g.JoinCode == joinCode);
        if (game == null) throw new HubException("Game not found");

        var activeRound = game.Rounds
            .Where(r => !r.IsCompleted)
            .OrderByDescending(r => r.RoundId)
            .FirstOrDefault();
        if (activeRound == null) throw new HubException("No active round found");

        // Check if the answer exists and belongs to this round
        var answer = await _context.Answers
            .FirstOrDefaultAsync(a => a.AnswerId == votedAnswerId && a.RoundId == activeRound.RoundId);
        if (answer == null) throw new HubException("Answer not found");

        // Check if player has already voted in this round
        var existingVote = await _context.Votes
            .FirstOrDefaultAsync(v => v.VoterPlayerId == voterPlayerId && 
                                     v.RoundId == activeRound.RoundId);
        
        if (existingVote != null)
        {
            // Update existing vote
            existingVote.VotedAnswerId = votedAnswerId;
        }
        else
        {
            // Add new vote
            var vote = new Vote
            {
                VoterPlayerId = voterPlayerId,
                VotedAnswerId = votedAnswerId,
                RoundId = activeRound.RoundId
            };
            _context.Votes.Add(vote);
        }
        
        await _context.SaveChangesAsync();

        // Broadcast vote results to all players
        await BroadcastVoteResults(joinCode, activeRound.RoundId);
        
        _logger.LogInformation("Vote submitted by {PlayerName} for answer {AnswerId}", voter.Name, votedAnswerId);
    }

    private int GetMaxVotesForPlayerCount(int playerCount)
    {
        // 2 players: Top 1 drawing
        // 3 players: Top 1 and 2nd place  
        // 4+ players: Top 1, 2nd, and 3rd place
        if (playerCount <= 2) return 1;
        if (playerCount == 3) return 2;
        return 3;
    }

    public async Task<int> GetMaxVotesForGame(string joinCode)
    {
        var game = await _context.Games
            .Include(g => g.Players)
            .FirstOrDefaultAsync(g => g.JoinCode == joinCode);
        
        if (game == null) throw new HubException("Game not found");
        
        return GetMaxVotesForPlayerCount(game.Players.Count);
    }

    private async Task BroadcastVoteResults(string joinCode, int roundId)
    {
        var game = await _context.Games
            .Include(g => g.Players)
            .FirstOrDefaultAsync(g => g.JoinCode == joinCode);

        var voteResults = await _context.Votes
            .Include(v => v.VotedAnswer)
            .Where(v => v.RoundId == roundId)
            .GroupBy(v => v.VotedAnswerId)
            .Select(g => new
            {
                AnswerId = g.Key,
                PlayerName = g.First().VotedAnswer.PlayerName,
                VoteCount = g.Count(),
                TotalVotes = _context.Votes.Count(v => v.RoundId == roundId)
            })
            .OrderByDescending(r => r.VoteCount)
            .ToListAsync();

        await Clients.Group(joinCode).SendAsync("VoteResultsUpdated", voteResults, 1);
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        if (exception != null)
        {
            _logger.LogError(exception, "Client {ConnectionId} disconnected with error", Context.ConnectionId);
        }
        else
        {
            _logger.LogInformation("Client {ConnectionId} disconnected normally", Context.ConnectionId);
        }
        
        var playerId = Context.Items["PlayerId"]?.ToString();
        var joinCode = Context.Items["JoinCode"]?.ToString();
        var playerName = Context.Items["PlayerName"]?.ToString();
        
        _logger.LogInformation("Disconnection details - PlayerId: {PlayerId}, JoinCode: {JoinCode}, PlayerName: {PlayerName}", playerId, joinCode, playerName);
        
        if (!string.IsNullOrEmpty(playerId) && !string.IsNullOrEmpty(joinCode) && !string.IsNullOrEmpty(playerName))
        {
            // Don't remove from SignalR group immediately - only remove if they don't reconnect
            // This allows reconnecting players to still receive events
            
            // Remove connection tracking for the old connection
            var disconnectConnectionKey = $"{joinCode}_{playerName}";
            _playerConnectionIds.TryRemove(disconnectConnectionKey, out _);
            _logger.LogInformation("Removed connection tracking for {PlayerName} (connection {ConnectionId})", playerName, Context.ConnectionId);
            
            // Check if the disconnected player is the host
            if (int.TryParse(playerId, out var playerIdInt))
            {
                var player = await _context.Players.FindAsync(playerIdInt);
                if (player != null && player.IsReader)
                {
                    // Host disconnected - add to reconnection list with shorter grace period
                    var hostDisconnectedKey = $"{joinCode}_{playerName}";
                    _disconnectedPlayers.TryAdd(hostDisconnectedKey, (playerId, playerName, joinCode, DateTime.UtcNow));
                    
                    _logger.LogInformation("Host {PlayerName} disconnected from game {JoinCode}, added to reconnection list with 2-minute grace period", playerName, joinCode);
                    
                    // Give host a shorter grace period (2 minutes instead of 5)
                    _ = Task.Run(async () =>
                    {
                        await Task.Delay(TimeSpan.FromMinutes(2));
                        await CleanupExpiredHost(hostDisconnectedKey, playerId, joinCode);
                    });
                    
                    return; // Don't proceed with regular cleanup
                }
            }
            
            // For non-host players, add to reconnection list with normal grace period
            var playerDisconnectedKey = $"{joinCode}_{playerName}";
            _disconnectedPlayers.TryAdd(playerDisconnectedKey, (playerId, playerName, joinCode, DateTime.UtcNow));
            
            _logger.LogInformation("Player {PlayerName} disconnected from game {JoinCode}, added to reconnection list with {GracePeriod}-minute grace period", playerName, joinCode, RECONNECTION_GRACE_PERIOD_MINUTES);
            
            _ = Task.Run(async () =>
            {
                await Task.Delay(TimeSpan.FromMinutes(RECONNECTION_GRACE_PERIOD_MINUTES));
                await CleanupExpiredPlayer(playerDisconnectedKey, playerId, joinCode);
            });
        }
        else
        {
            _logger.LogWarning("Disconnected client {ConnectionId} had incomplete context information", Context.ConnectionId);
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
            
            // Clean up connection tracking
            var cleanupConnectionKey = $"{joinCode}_{disconnectedInfo.playerName}";
            _playerConnectionIds.TryRemove(cleanupConnectionKey, out _);
            
            // Remove from SignalR group if they haven't reconnected
            // Note: We can't remove by connection ID since it's already disconnected
            // But we can send a PlayerKicked event to notify them if they somehow reconnected
            await Clients.Group(joinCode).SendAsync("PlayerKicked", playerId, disconnectedInfo.playerName);
            
            if (gameId > 0)
            {
                var updatedPlayers = await _context.Players.Where(p => p.GameId == gameId).ToListAsync();
                await Clients.Group(joinCode).SendAsync("PlayerListUpdated", updatedPlayers);
                _logger.LogInformation("Sent updated player list to group {JoinCode} after player removal", joinCode);
            }
        }
    }
    
    private async Task CleanupExpiredHost(string disconnectedKey, string playerId, string joinCode)
    {
        if (_disconnectedPlayers.TryRemove(disconnectedKey, out var disconnectedInfo))
        {
            _logger.LogInformation("Host {PlayerName} did not reconnect within grace period, kicking all players from game {JoinCode}", disconnectedInfo.playerName, joinCode);
            
            try
            {
                var player = await _context.Players.FindAsync(int.Parse(playerId));
                if (player != null && player.IsReader)
                {
                    var gameId = player.GameId;
                    var allPlayers = await _context.Players.Where(p => p.GameId == gameId).ToListAsync();
                    
                    // Kick all players
                    foreach (var otherPlayer in allPlayers)
                    {
                        var otherDisconnectedKey = $"{joinCode}_{otherPlayer.Name}";
                        _disconnectedPlayers.TryRemove(otherDisconnectedKey, out _);
                        
                        // Remove connection tracking for kicked players
                        var otherConnectionKey = $"{joinCode}_{otherPlayer.Name}";
                        if (_playerConnectionIds.TryRemove(otherConnectionKey, out var otherConnectionId))
                        {
                            // Remove kicked player from SignalR group
                            await Groups.RemoveFromGroupAsync(otherConnectionId, joinCode);
                            _logger.LogInformation("Removed kicked player {PlayerName} from SignalR group during host cleanup", otherPlayer.Name);
                        }
                        
                        // Notify the kicked player
                        await Clients.Group(joinCode).SendAsync("PlayerKicked", otherPlayer.PlayerId.ToString(), otherPlayer.Name);
                        _logger.LogInformation("Kicked player {PlayerName} because host did not reconnect", otherPlayer.Name);
                    }
                    
                    // Remove all players from the game
                    _context.Players.RemoveRange(allPlayers);
                    
                    // Also remove any active rounds and answers for this game
                    var activeRounds = await _context.Rounds.Where(r => r.GameId == gameId && !r.IsCompleted).ToListAsync();
                    foreach (var round in activeRounds)
                    {
                        var roundAnswers = await _context.Answers.Where(a => a.RoundId == round.RoundId).ToListAsync();
                        _context.Answers.RemoveRange(roundAnswers);
                    }
                    _context.Rounds.RemoveRange(activeRounds);
                    
                    await _context.SaveChangesAsync();
                    
                    // Send empty player list to remaining players
                    await Clients.Group(joinCode).SendAsync("PlayerListUpdated", new List<Player>());
                    _logger.LogInformation("Sent empty player list to group {JoinCode} after host cleanup", joinCode);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error cleaning up host {PlayerName} from database", disconnectedInfo.playerName);
            }
        }
    }

    private async Task AutoSubmitRemainingAnswers(string joinCode, int roundId)
    {
        _logger.LogInformation("Backend timer expired - auto-submitting remaining answers for round {RoundId} in game {JoinCode}", roundId, joinCode);
        
        try
        {
            var game = await _context.Games
                .Include(g => g.Players)
                .FirstOrDefaultAsync(g => g.JoinCode == joinCode);
            if (game == null) return;

            var activeRound = await _context.Rounds
                .FirstOrDefaultAsync(r => r.RoundId == roundId && r.GameId == game.GameId && !r.IsCompleted);
                
            if (activeRound == null) return;

            // Get all players who haven't submitted answers yet
            var submittedPlayerIds = await _context.Answers
                .Where(a => a.RoundId == roundId)
                .Select(a => a.PlayerId)
                .ToListAsync();

            var playersWhoHaventSubmitted = game.Players
                .Where(p => !p.IsReader && !submittedPlayerIds.Contains(p.PlayerId))
                .ToList();

            // Auto-submit blank drawings for players who haven't submitted
            foreach (var player in playersWhoHaventSubmitted)
            {
                // Create a blank white canvas as base64
                var blankCanvas = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=";
                
                var newAnswer = new Answer
                {
                    Content = blankCanvas,
                    PlayerName = player.Name,
                    PlayerId = player.PlayerId,
                    RoundId = roundId
                };
                _context.Answers.Add(newAnswer);
                
                _logger.LogInformation("Auto-submitted blank drawing for player {PlayerName} in round {RoundId}", player.Name, roundId);
            }

            await _context.SaveChangesAsync();

            // Notify all clients about the auto-submissions
            foreach (var player in playersWhoHaventSubmitted)
            {
                var blankCanvas = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=";
                await Clients.Group(joinCode).SendAsync("AnswerReceived", player.PlayerId.ToString(), player.Name, blankCanvas);
            }

            // Clean up timer
            _activeTimers.TryRemove(joinCode, out _);

            _logger.LogInformation("Backend auto-submission completed for round {RoundId} in game {JoinCode}", roundId, joinCode);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during backend auto-submission for round {RoundId} in game {JoinCode}", roundId, joinCode);
        }
    }
}