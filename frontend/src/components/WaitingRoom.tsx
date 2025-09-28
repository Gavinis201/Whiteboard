import React from 'react';
import { useGame } from '../contexts/GameContext';

export const WaitingRoom: React.FC = () => {
  const { game, player, currentRound } = useGame();

  return (
    <div className="max-w-3xl mx-auto text-center py-10">
      <h1 className="text-3xl font-bold mb-4">Round In Progress</h1>
      <p className="text-gray-700 mb-6">
        {player?.name}, you joined while a round was already underway in game {game?.joinCode}.
      </p>
      <p className="text-gray-700 mb-6">
        You'll automatically join the next round. Sit tight!
      </p>
      {currentRound && (
        <div className="mt-6 p-4 bg-purple-50 rounded-lg">
          <p className="text-sm text-purple-800">
            Active round ID: {currentRound.roundId}
          </p>
        </div>
      )}
    </div>
  );
}
