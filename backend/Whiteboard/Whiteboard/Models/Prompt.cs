using System.ComponentModel.DataAnnotations;

namespace Whiteboard.Models;

public class Prompt
{
    public int PromptId { get; set; }
    
    [Required]
    [StringLength(200)]
    public string Text { get; set; }
    
    public string Category { get; set; } = "General";
    
    public bool IsActive { get; set; } = true;
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
} 