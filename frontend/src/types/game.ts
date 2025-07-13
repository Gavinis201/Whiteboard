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
    timerDurationMinutes?: number | null;
}

export interface Answer {
    answerId: number;
    content: string;
    playerId: number;
    playerName: string;
    roundId: number;
}

export interface Vote {
    voteId: number;
    voterPlayerId: number;
    votedAnswerId: number;
    roundId: number;
}

export interface VoteResult {
    answerId: number;
    playerName: string;
    voteCount: number;
    totalVotes: number;
}

export interface ExtendedGame {
    gameId: number;
    joinCode: string;
    isActive: boolean;
    judgingModeEnabled: boolean;
    players: Player[];
}