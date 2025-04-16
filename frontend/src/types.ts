export interface Answer {
    answerId: string;
    playerId: string;
    playerName: string;
    content: string;
    timestamp: number;
}

export interface Player {
    playerId: string;
    name: string;
    isReader: boolean;
    gameId: string;
}

export interface Game {
    gameId: string;
    joinCode: string;
    isActive: boolean;
    players: Player[];
}

export interface Round {
    roundId: string;
    prompt: string;
    isCompleted: boolean;
    gameId: string;
} 