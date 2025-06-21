using System.Text.Json.Serialization;
using System.ComponentModel.DataAnnotations;

namespace Whiteboard.Models;

public class Game
{
    public int GameId { get; set; }

    [Required]
    [StringLength(6)]
    public string JoinCode { get; set; }

    public bool IsActive { get; set; }

    public ICollection<Player> Players { get; set; }
    [JsonIgnore]
    public ICollection<Round> Rounds { get; set; }
}
