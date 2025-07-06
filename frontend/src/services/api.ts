import axios from 'axios';

// true backend URL Updated
const API_URL = 'https://whiteboardv2-backend-ckf7efgxbxbjg0ft.eastus-01.azurewebsites.net/api';
// const API_URL = 'http://localhost:5164/api';

export interface Game {
    gameId: number;
    joinCode: string;
    isActive: boolean;
    players: Player[];
}

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
    timerDurationMinutes?: number;
}

export interface Answer {
    answerId: number;
    content: string;
    playerId: number;
    playerName: string;
    roundId: number;
}

export interface Prompt {
    promptId: number;
    text: string;
    category: string;
    isActive: boolean;
    createdAt: string;
}

export const createGame = async (): Promise<Game> => {
    const response = await axios.post(`${API_URL}/games/create`);
    return response.data;
};

export const getGame = async (joinCode: string): Promise<Game> => {
    const response = await axios.get(`${API_URL}/games/${joinCode}`);
    return response.data;
};

export const joinGame = async (joinCode: string, playerName: string): Promise<Player> => {
    try {
        const response = await axios.post(`${API_URL}/players/join`, {
            joinCode,
            playerName
        });
        return response.data;
    } catch (error: any) {
        // If it's an axios error with a response, throw it with the error message
        if (error.response?.data) {
            throw new Error(error.response.data);
        }
        // Otherwise, re-throw the original error
        throw error;
    }
};

export const startRound = async (round: Omit<Round, 'roundId'>): Promise<Round> => {
    const response = await axios.post(`${API_URL}/rounds/start`, round);
    return response.data;
};

export const getRounds = async (gameId: number): Promise<Round[]> => {
    const response = await axios.get(`${API_URL}/rounds/${gameId}`);
    return response.data;
};

export const submitAnswer = async (answer: Omit<Answer, 'answerId'>): Promise<Answer> => {
    const response = await axios.post(`${API_URL}/answers/submit`, answer);
    return response.data;
};

export const getAnswersForRound = async (roundId: number): Promise<Answer[]> => {
    const response = await axios.get(`${API_URL}/answers/round/${roundId}`);
    return response.data;
};

export const getPrompts = async (): Promise<Prompt[]> => {
    const response = await axios.get(`${API_URL}/prompts/active`);
    return response.data;
};

// Vote-related API calls
export const submitVote = async (vote: Omit<Vote, 'voteId'>): Promise<Vote> => {
    const response = await axios.post(`${API_URL}/votes/submit`, vote);
    return response.data;
};

export const getVotesForRound = async (roundId: number): Promise<Vote[]> => {
    const response = await axios.get(`${API_URL}/votes/round/${roundId}`);
    return response.data;
};

export const getVoteResults = async (roundId: number): Promise<VoteResult[]> => {
    const response = await axios.get(`${API_URL}/votes/results/${roundId}`);
    return response.data;
};

export const getPlayerVotes = async (playerId: number, roundId: number): Promise<Vote[]> => {
    const response = await axios.get(`${API_URL}/votes/player/${playerId}/round/${roundId}`);
    return response.data;
}; 