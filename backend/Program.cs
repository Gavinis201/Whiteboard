using Microsoft.AspNetCore.SignalR;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddControllers();
builder.Services.AddSignalR(options => {
    options.MaximumReceiveMessageSize = 104857600; // 100MB
    options.EnableDetailedErrors = true;
    options.StreamBufferCapacity = 4096;
    options.ApplicationMaxBufferSize = 104857600; // 100MB
    options.TransportMaxBufferSize = 104857600; // 100MB
});

var app = builder.Build();

// Configure the HTTP request pipeline.
if (!app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();

app.UseAuthorization();

app.MapControllers();

app.MapHub<GameHub>("/gameHub", options => {
    options.MaximumReceiveMessageSize = 104857600; // 100MB
    options.StreamBufferCapacity = 4096;
    options.ApplicationMaxBufferSize = 104857600; // 100MB
    options.TransportMaxBufferSize = 104857600; // 100MB
});

app.Run(); 