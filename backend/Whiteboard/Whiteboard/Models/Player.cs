using System.Text.Json.Serialization;

namespace Whiteboard.Models;

public class Player
{
    public int PlayerId { get; set; }
    public string Name { get; set; }
    public bool IsReader { get; set; }

    public int GameId { get; set; }
    [JsonIgnore]
    public Game Game { get; set; }
}
