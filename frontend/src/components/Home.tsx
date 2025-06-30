import React from 'react';
import { useGame } from '../contexts/GameContext';

const Home: React.FC = () => {
    const { createGame, joinGame } = useGame();

    const handleCreateGame = async () => {
        try {
            const playerName = prompt('Enter your name:');
            if (playerName) {
                await createGame(playerName);
            }
        } catch (error) {
            console.error('Error creating game:', error);
        }
    };

    const handleJoinGame = async () => {
        try {
            const joinCode = prompt('Enter game code:');
            const playerName = prompt('Enter your name:');
            if (joinCode && playerName) {
                await joinGame(joinCode, playerName);
            }
        } catch (error: any) {
            console.error('Error joining game:', error);
            // Display the error message to the user
            if (error?.message) {
                alert(`Error joining game: ${error.message}`);
            } else {
                alert('Failed to join game. Please check the game code and try again.');
            }
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
            <h1 className="text-4xl font-bold mb-8">Welcome to the Game!</h1>
            <div className="space-y-4">
                <button
                    onClick={handleCreateGame}
                    className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                >
                    Create New Game
                </button>
                <button
                    onClick={handleJoinGame}
                    className="px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                >
                    Join Existing Game
                </button>
            </div>
        </div>
    );
};

export default Home; 