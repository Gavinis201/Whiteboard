using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Whiteboard.Data;
using Whiteboard.Models;

namespace Whiteboard.Controllers;

[ApiController]
[Route("api/[controller]")]
public class PromptsController : ControllerBase
{
    private readonly GameDbContext _context;
    private readonly ILogger<PromptsController> _logger;

    public PromptsController(GameDbContext context, ILogger<PromptsController> logger)
    {
        _context = context;
        _logger = logger;
    }

    // GET: api/prompts
    [HttpGet]
    public async Task<ActionResult<IEnumerable<Prompt>>> GetPrompts()
    {
        return await _context.Prompts
            .Where(p => p.IsActive)
            .OrderBy(p => p.Category)
            .ThenBy(p => p.Text)
            .ToListAsync();
    }

    // GET: api/prompts/active
    [HttpGet("active")]
    public async Task<ActionResult<IEnumerable<Prompt>>> GetActivePrompts()
    {
        return await _context.Prompts
            .Where(p => p.IsActive)
            .OrderBy(p => p.Category)
            .ThenBy(p => p.Text)
            .ToListAsync();
    }

    [HttpGet("seed")]
    public async Task<ActionResult<string>> SeedPrompts()
    {
        try
        {
            await PromptSeeder.SeedPrompts(_context);
            return Ok("Prompts seeded successfully!");
        }
        catch (Exception ex)
        {
            return BadRequest($"Error seeding prompts: {ex.Message}");
        }
    }

    // POST: api/prompts
    [HttpPost]
    public async Task<ActionResult<Prompt>> CreatePrompt(Prompt prompt)
    {
        prompt.CreatedAt = DateTime.UtcNow;
        prompt.IsActive = true;
        
        _context.Prompts.Add(prompt);
        await _context.SaveChangesAsync();

        return CreatedAtAction(nameof(GetActivePrompts), new { id = prompt.PromptId }, prompt);
    }

    // PUT: api/prompts/{id}
    [HttpPut("{id}")]
    public async Task<IActionResult> UpdatePrompt(int id, Prompt prompt)
    {
        if (id != prompt.PromptId)
        {
            return BadRequest();
        }

        _context.Entry(prompt).State = EntityState.Modified;
        await _context.SaveChangesAsync();

        return NoContent();
    }

    // DELETE: api/prompts/{id}
    [HttpDelete("{id}")]
    public async Task<IActionResult> DeletePrompt(int id)
    {
        var prompt = await _context.Prompts.FindAsync(id);
        if (prompt == null)
        {
            return NotFound();
        }

        _context.Prompts.Remove(prompt);
        await _context.SaveChangesAsync();

        return NoContent();
    }
} 