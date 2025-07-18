using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using Whiteboard.Hubs;
using Whiteboard.Models;
using Whiteboard.Data;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddControllers();
// Learn more about configuring Swagger/OpenAPI at https://aka.ms/aspnetcore/swashbuckle
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Add CORS
builder.Services.AddCors(options =>
{
    options.AddPolicy("CorsPolicy", builder =>
        builder
            .WithOrigins(
                "https://blue-mud-0eac3971e.6.azurestaticapps.net",
                "https://localhost:5173",
                "https://localhost:3000",
                "https://localhost:3001",
                "http://localhost:5173",
                "http://localhost:3000",
                "http://localhost:3001",
                "https://thewhiteboardgame.com"
                
            )
            .AllowAnyMethod()
            .AllowAnyHeader()
            .AllowCredentials());
});

// Add SignalR with configuration
builder.Services.AddSignalR(hubOptions => {
    hubOptions.MaximumReceiveMessageSize = 1000000; // 1MB
    hubOptions.EnableDetailedErrors = true;
    hubOptions.StreamBufferCapacity = 1024;
    hubOptions.KeepAliveInterval = TimeSpan.FromSeconds(15);
    hubOptions.HandshakeTimeout = TimeSpan.FromSeconds(15);
    hubOptions.ClientTimeoutInterval = TimeSpan.FromSeconds(30);
    hubOptions.MaximumParallelInvocationsPerClient = 1;
});

// Add Entity Framework
builder.Services.AddDbContext<GameDbContext>(options =>
    options.UseSqlite(builder.Configuration.GetConnectionString("DefaultConnection")));

// Add Authentication
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"],
            ValidAudience = builder.Configuration["Jwt:Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(builder.Configuration["Jwt:Key"] ?? throw new InvalidOperationException("JWT Key not found in configuration")))
        };

        // Configure the JWT Bearer Auth to work with SignalR
        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                var accessToken = context.Request.Query["access_token"];
                var path = context.HttpContext.Request.Path;
                if (!string.IsNullOrEmpty(accessToken) && path.StartsWithSegments("/gameHub"))
                {
                    context.Token = accessToken;
                }
                return Task.CompletedTask;
            }
        };
    });

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// app.UseHttpsRedirection(); // Comment out HTTPS redirection for development

// Important: UseCors must come before UseAuthentication and UseAuthorization
app.UseCors("CorsPolicy");

app.UseRouting();
app.UseAuthentication();
app.UseAuthorization();

// Map controllers and SignalR hub
app.UseEndpoints(endpoints =>
{
    endpoints.MapControllers();
    endpoints.MapHub<GameHub>("/gameHub", options => {
        options.TransportMaxBufferSize = 52428800; // 50MB
        options.ApplicationMaxBufferSize = 52428800; // 50MB
        options.TransportSendTimeout = TimeSpan.FromSeconds(30);
        options.LongPolling.PollTimeout = TimeSpan.FromSeconds(30);
    });
});

// Apply database migrations
using (var scope = app.Services.CreateScope())
{
    var services = scope.ServiceProvider;
    try
    {
        var context = services.GetRequiredService<GameDbContext>();
        var logger = services.GetRequiredService<ILogger<Program>>();
        
        logger.LogInformation("Starting database initialization...");
        
        // Apply migrations (this also creates the database if it doesn't exist)
        context.Database.Migrate();
        logger.LogInformation("Migrations applied successfully.");
        
        // Seed prompts (only if database is empty)
        await PromptSeeder.SeedPrompts(context);
        logger.LogInformation("Database seeding completed successfully.");
    }
    catch (Exception ex)
    {
        var logger = services.GetRequiredService<ILogger<Program>>();
        logger.LogError(ex, "An error occurred while initializing the database: {Message}", ex.Message);
        logger.LogError("Stack trace: {StackTrace}", ex.StackTrace);
    }
}

app.Run();