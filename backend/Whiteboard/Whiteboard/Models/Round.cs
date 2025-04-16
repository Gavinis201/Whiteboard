using System.Text.Json.Serialization;

namespace Whiteboard.Models;

public class Round
{
    public int RoundId { get; set; }
    public string Prompt { get; set; }
    public bool IsCompleted { get; set; }

    public int GameId { get; set; }
    [JsonIgnore]
    public Game Game { get; set; }

    [JsonIgnore]
    public ICollection<Answer> Answers { get; set; }
}
