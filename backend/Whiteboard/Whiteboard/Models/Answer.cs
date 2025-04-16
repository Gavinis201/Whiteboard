using System.Text.Json.Serialization;

namespace Whiteboard.Models;

public class Answer
{
    public int AnswerId { get; set; }
    public string Content { get; set; }
    public string PlayerName { get; set; }

    public int PlayerId { get; set; }
    [JsonIgnore]
    public Player Player { get; set; }

    public int RoundId { get; set; }
    [JsonIgnore]
    public Round Round { get; set; }
}
