import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '../contexts/GameContext';

export const CreateGame: React.FC = () => {
    const [playerName, setPlayerName] = useState('');
    const [error, setError] = useState<string | null>(null);
    const navigate = useNavigate();
    const { createGame } = useGame();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        try {
            await createGame(playerName);
            navigate('/game');
        } catch (err) {
            setError('Failed to create game. Please try again.');
            console.error('Error creating game:', err);
        }
    };

    return (
        <div className="flex-1 flex items-start pt-8 sm:items-center justify-center bg-gray-50 px-4 sm:px-6 lg:px-8">
            <div className="max-w-md w-full space-y-8 p-6 sm:p-8 bg-white rounded-xl shadow-lg">
                <div className="text-center">
                    <h2 className="text-2xl sm:text-3xl font-bold text-purple-600">
                        Create a New Game
                    </h2>
                    <p className="mt-2 text-sm sm:text-base text-gray-600">
                        Enter your name to create a new game as the reader
                    </p>
                </div>
                <form className="mt-6 sm:mt-8 space-y-4 sm:space-y-6" onSubmit={handleSubmit}>
                    <div>
                        <label htmlFor="player-name" className="block text-sm font-medium text-gray-700 mb-1">
                            Your Name
                        </label>
                        <input
                            id="player-name"
                            name="playerName"
                            type="text"
                            required
                            className="input text-sm sm:text-base"
                            placeholder="Enter your name"
                            value={playerName}
                            onChange={(e) => setPlayerName(e.target.value)}
                        />
                    </div>

                    {error && (
                        <div className="text-red-500 text-sm text-center bg-red-50 p-2 rounded-md">
                            {error}
                        </div>
                    )}

                    <div>
                        <button
                            type="submit"
                            className="w-full bg-purple-600 text-white px-6 py-3 rounded-md hover:bg-purple-700 transition-colors text-sm sm:text-base"
                        >
                            Create Game
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}; 