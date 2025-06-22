// src/types/game.ts

export interface Player {
    playerId: number;
    name: string;
    isReader: boolean;
    gameId: number;
}

export interface Round {
    roundId: number;
    prompt: string;
    isCompleted: boolean;
    gameId: number;
}

export interface Answer {
    answerId: number;
    content: string;
    playerId: number;
    playerName: string;
    roundId: number;
}