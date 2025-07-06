using System.Text.Json.Serialization;

namespace Whiteboard.Models;

public class Vote
{
    public int VoteId { get; set; }
    public int VoterPlayerId { get; set; } // Player who is voting
    public int VotedAnswerId { get; set; } // Answer being voted for
    public int Rank { get; set; } // 1st, 2nd, or 3rd place vote
    public int RoundId { get; set; }
    
    [JsonIgnore]
    public Player VoterPlayer { get; set; }
    
    [JsonIgnore]
    public Answer VotedAnswer { get; set; }
    
    [JsonIgnore]
    public Round Round { get; set; }
} 