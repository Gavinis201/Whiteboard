using System.Text.Json.Serialization;

namespace Whiteboard.Models;

public class Round
{
    public int RoundId { get; set; }
    public string Prompt { get; set; }
    public bool IsCompleted { get; set; }
    public int? TimerDurationMinutes { get; set; } // 1, 2, 3, or null for no timer
    public DateTime? TimerStartTime { get; set; } // When the timer started
    public bool VotingEnabled { get; set; } = false; // Whether voting is enabled for this round

    public int GameId { get; set; }
    [JsonIgnore]
    public Game Game { get; set; }

    [JsonIgnore]
    public ICollection<Answer> Answers { get; set; }
}
