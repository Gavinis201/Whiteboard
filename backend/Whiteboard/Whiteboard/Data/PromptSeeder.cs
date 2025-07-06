using Whiteboard.Models;

namespace Whiteboard.Data;

public static class PromptSeeder
{
    public static async Task SeedPrompts(GameDbContext context)
    {
        // Only seed if the database is empty
        if (context.Prompts.Any())
        {
            return; // Database already has prompts, skip seeding
        }

        var prompts = new List<Prompt>
        {
            // 🎭 Silly Situations
            new Prompt { Text = "A cat trying to bake a cake", Category = "Silly Situations" },
            new Prompt { Text = "A person lost in a mall", Category = "Silly Situations" },
            new Prompt { Text = "A dog driving a car", Category = "Silly Situations" },
            new Prompt { Text = "Someone jumping into a giant pile of spaghetti", Category = "Silly Situations" },
            new Prompt { Text = "A monster brushing its teeth", Category = "Silly Situations" },
            
            // 🚀 Imaginary Scenes
            new Prompt { Text = "A city floating in the sky", Category = "Imaginary Scenes" },
            new Prompt { Text = "A penguin on vacation", Category = "Imaginary Scenes" },
            new Prompt { Text = "A robot walking a dog", Category = "Imaginary Scenes" },
            new Prompt { Text = "A dragon playing a guitar", Category = "Imaginary Scenes" },
            new Prompt { Text = "An alien shopping for clothes", Category = "Imaginary Scenes" },
            
            // 🏖️ Creative Places
            new Prompt { Text = "A beach made of candy", Category = "Creative Places" },
            new Prompt { Text = "A jungle gym on the moon", Category = "Creative Places" },
            new Prompt { Text = "A farm with dancing animals", Category = "Creative Places" },
            new Prompt { Text = "A snowman at the beach", Category = "Creative Places" },
            new Prompt { Text = "A school made of pizza", Category = "Creative Places" },
            
            // 🎢 Funny Actions
            new Prompt { Text = "Someone stuck in a giant ice cream cone", Category = "Funny Actions" },
            new Prompt { Text = "A turtle winning a race", Category = "Funny Actions" },
            new Prompt { Text = "A kid flying with balloons", Category = "Funny Actions" },
            new Prompt { Text = "A clown mowing the lawn", Category = "Funny Actions" },
            new Prompt { Text = "A squirrel playing basketball", Category = "Funny Actions" },
            
            // 🎩 Mixed-Up Items
            new Prompt { Text = "A chair made of jelly", Category = "Mixed-Up Items" },
            new Prompt { Text = "A phone shaped like a banana", Category = "Mixed-Up Items" },
            new Prompt { Text = "A sandwich wearing a hat", Category = "Mixed-Up Items" },
            new Prompt { Text = "A car with wings", Category = "Mixed-Up Items" },
            new Prompt { Text = "A backpack with legs", Category = "Mixed-Up Items" },
            
            // 🎪 Circus Chaos
            new Prompt { Text = "A tightrope walker juggling cats", Category = "Circus Chaos" },
            new Prompt { Text = "A lion doing ballet", Category = "Circus Chaos" },
            new Prompt { Text = "A clown riding a unicycle on water", Category = "Circus Chaos" },
            new Prompt { Text = "An elephant in a tutu", Category = "Circus Chaos" },
            new Prompt { Text = "A trapeze artist with butterfly wings", Category = "Circus Chaos" },
            
            // 🏰 Fairy Tale Mix-Ups
            new Prompt { Text = "Cinderella driving a pumpkin car", Category = "Fairy Tale Mix-Ups" },
            new Prompt { Text = "Little Red Riding Hood surfing", Category = "Fairy Tale Mix-Ups" },
            new Prompt { Text = "The Three Little Pigs as astronauts", Category = "Fairy Tale Mix-Ups" },
            new Prompt { Text = "Goldilocks riding a bear", Category = "Fairy Tale Mix-Ups" },
            new Prompt { Text = "Snow White playing video games", Category = "Fairy Tale Mix-Ups" },
            
            // 🌟 Superhero Shenanigans
            new Prompt { Text = "A superhero with a cape made of pizza", Category = "Superhero Shenanigans" },
            new Prompt { Text = "A villain who only steals socks", Category = "Superhero Shenanigans" },
            new Prompt { Text = "A hero whose power is making people laugh", Category = "Superhero Shenanigans" },
            new Prompt { Text = "A sidekick who's actually a potato", Category = "Superhero Shenanigans" },
            new Prompt { Text = "A superhero headquarters in a treehouse", Category = "Superhero Shenanigans" },
            
            // 🍕 Food Adventures
            new Prompt { Text = "A pizza delivery person riding a pizza", Category = "Food Adventures" },
            new Prompt { Text = "A chef cooking with a lightsaber", Category = "Food Adventures" },
            new Prompt { Text = "A hamburger doing yoga", Category = "Food Adventures" },
            new Prompt { Text = "A banana playing the piano", Category = "Food Adventures" },
            new Prompt { Text = "A cookie monster eating vegetables", Category = "Food Adventures" },
            
            // 🎮 Gaming Gone Wild
            new Prompt { Text = "A character from a video game in real life", Category = "Gaming Gone Wild" },
            new Prompt { Text = "A gamer whose controller is alive", Category = "Gaming Gone Wild" },
            new Prompt { Text = "A boss battle in a library", Category = "Gaming Gone Wild" },
            new Prompt { Text = "A power-up that makes you invisible to teachers", Category = "Gaming Gone Wild" },
            new Prompt { Text = "A game console that cooks dinner", Category = "Gaming Gone Wild" },
            
            // 🎨 Art Gone Crazy
            new Prompt { Text = "A painting that comes to life", Category = "Art Gone Crazy" },
            new Prompt { Text = "An artist painting with spaghetti", Category = "Art Gone Crazy" },
            new Prompt { Text = "A sculpture made of marshmallows", Category = "Art Gone Crazy" },
            new Prompt { Text = "A museum where the art talks back", Category = "Art Gone Crazy" },
            new Prompt { Text = "A crayon that draws by itself", Category = "Art Gone Crazy" },
            
            // 🏫 School Shenanigans
            new Prompt { Text = "A teacher who's actually a robot", Category = "School Shenanigans" },
            new Prompt { Text = "A homework assignment that does itself", Category = "School Shenanigans" },
            new Prompt { Text = "A cafeteria serving rainbow food", Category = "School Shenanigans" },
            new Prompt { Text = "A school bus that can fly", Category = "School Shenanigans" },
            new Prompt { Text = "A principal who's secretly a superhero", Category = "School Shenanigans" },
            
            // 🌍 Nature Nonsense
            new Prompt { Text = "A tree that grows candy instead of fruit", Category = "Nature Nonsense" },
            new Prompt { Text = "A flower that sings opera", Category = "Nature Nonsense" },
            new Prompt { Text = "A cloud shaped like a dinosaur", Category = "Nature Nonsense" },
            new Prompt { Text = "A rainbow that leads to a treasure chest", Category = "Nature Nonsense" },
            new Prompt { Text = "A mountain that's actually a giant sleeping", Category = "Nature Nonsense" },
            
            // 🚗 Transportation Troubles
            new Prompt { Text = "A bicycle with rocket boosters", Category = "Transportation Troubles" },
            new Prompt { Text = "A submarine that can fly", Category = "Transportation Troubles" },
            new Prompt { Text = "A train that runs on chocolate", Category = "Transportation Troubles" },
            new Prompt { Text = "A skateboard with wings", Category = "Transportation Troubles" },
            new Prompt { Text = "A hot air balloon made of bubble gum", Category = "Transportation Troubles" },
            
            // 🎭 Movie Madness
            new Prompt { Text = "A movie where the audience controls the plot", Category = "Movie Madness" },
            new Prompt { Text = "A popcorn machine that makes any food", Category = "Movie Madness" },
            new Prompt { Text = "A cinema screen that's actually a window", Category = "Movie Madness" },
            new Prompt { Text = "A movie character who breaks the fourth wall", Category = "Movie Madness" },
            new Prompt { Text = "A film director who's a wizard", Category = "Movie Madness" }
        };

        context.Prompts.AddRange(prompts);
        await context.SaveChangesAsync();
    }
} 