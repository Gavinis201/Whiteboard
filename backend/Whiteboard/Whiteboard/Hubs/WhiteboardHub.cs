using Microsoft.AspNetCore.SignalR;

namespace Whiteboard.Hubs
{
    public class WhiteboardHub : Hub
    {
        public async Task JoinGame(string gameCode)
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, gameCode);
            await Clients.Group(gameCode).SendAsync("PlayerJoined", Context.ConnectionId);
        }

        public async Task LeaveGame(string gameCode)
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, gameCode);
            await Clients.Group(gameCode).SendAsync("PlayerLeft", Context.ConnectionId);
        }

        public async Task SendAnswer(string gameCode, string answer)
        {
            await Clients.Group(gameCode).SendAsync("AnswerReceived", Context.ConnectionId, answer);
        }

        public async Task StartRound(string gameCode, string prompt)
        {
            await Clients.Group(gameCode).SendAsync("RoundStarted", prompt);
        }

        public async Task EndRound(string gameCode)
        {
            await Clients.Group(gameCode).SendAsync("RoundEnded");
        }

        public async Task RevealAnswers(string gameCode)
        {
            await Clients.Group(gameCode).SendAsync("AnswersRevealed");
        }
    }
} 