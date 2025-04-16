using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;

namespace Whiteboard.Hubs;

public class GameHub : Hub
{
    private readonly ILogger<GameHub> _logger;

    public GameHub(ILogger<GameHub> logger)
    {
        _logger = logger;
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

        // Add to new group and store player info
        await Groups.AddToGroupAsync(Context.ConnectionId, joinCode);
        Context.Items["PlayerName"] = playerName;
        Context.Items["JoinCode"] = joinCode;
        Context.Items[$"game_{joinCode}"] = true; // Mark this connection as part of the game

        await Clients.Group(joinCode).SendAsync("PlayerJoined", Context.ConnectionId, playerName);
        _logger.LogInformation("Client {ConnectionId} successfully joined game: {JoinCode} as {PlayerName}", Context.ConnectionId, joinCode, playerName);
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
        if (string.IsNullOrEmpty(playerName))
        {
            _logger.LogError("Player name not found in connection context for {ConnectionId}", Context.ConnectionId);
            throw new Exception("Player name not found in connection context");
        }

        await Clients.Group(joinCode).SendAsync("AnswerReceived", Context.ConnectionId, playerName, answer);
        _logger.LogInformation("Answer submitted successfully by {PlayerName} ({ConnectionId}) in game {JoinCode}", playerName, Context.ConnectionId, joinCode);
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
        
        // Remove from all groups
        var groups = Context.Items.Keys.Where(k => k.ToString().StartsWith("game_")).ToList();
        foreach (var group in groups)
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, group.ToString());
        }
        
        await base.OnDisconnectedAsync(exception);
        await Clients.All.SendAsync("PlayerLeft", Context.ConnectionId);
    }
} 