import React from 'react';
import { useGame } from '../contexts/GameContext';

const PlayerList: React.FC = () => {
    const { players, isReader } = useGame();

    if (!isReader) {
        return null;
    }

    return (
        <div className="fixed right-4 top-4 bg-white p-4 rounded-lg shadow-lg w-64">
            <h2 className="text-lg font-semibold mb-4">Players in Game</h2>
            <div className="space-y-2">
                {players.length === 0 ? (
                    <p className="text-gray-500">No players have joined yet</p>
                ) : (
                    players.map((player) => (
                        <div 
                            key={player.playerId} 
                            className="flex items-center justify-between p-2 bg-gray-50 rounded"
                        >
                            <span className="font-medium">{player.name}</span>
                            <span className="text-sm text-gray-500">
                                {player.isReader ? 'Reader' : 'Player'}
                            </span>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default PlayerList; 