import React, { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';
import { Game, Player, Round, Answer, getGame, joinGame as joinGameApi, createGame as createGameApi } from '../services/api';
import { signalRService, GameStatePayload } from '../services/signalR';
import { setCookie, getCookie, removeCookie } from '../utils/cookieUtils';

interface ExtendedGame extends Game {
    currentRound: Round | null;
}

const convertToExtendedGame = (baseGame: Game): ExtendedGame => ({
    ...baseGame,
    currentRound: null
});

interface GameContextType {
    game: ExtendedGame | null;
    player: Player | null;
    currentRound: Round | null;
    answers: Answer[];
    players: Player[];
    isReader: boolean;
    playersWhoSubmitted: Set<number>;
    isInitialized: boolean;
    isLoading: boolean;
    loadingMessage: string;
    createGame: (playerName: string) => Promise<void>;
    joinGame: (joinCode: string, playerName: string) => Promise<void>;
    startNewRound: (prompt: string) => Promise<void>;
    submitAnswer: (answer: string) => Promise<void>;
    kickPlayer: (playerId: number) => Promise<void>;
    leaveGame: () => Promise<void>;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

export const GameProvider = ({ children }: { children: ReactNode }) => {
    const [game, setGame] = useState<ExtendedGame | null>(null);
    const [player, setPlayer] = useState<Player | null>(null);
    const [currentRound, setCurrentRound] = useState<Round | null>(null);
    const [answers, setAnswers] = useState<Answer[]>([]);
    const [isReader, setIsReader] = useState(false);
    const [playersWhoSubmitted, setPlayersWhoSubmitted] = useState<Set<number>>(new Set());
    const [isInitialized, setIsInitialized] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [loadingMessage, setLoadingMessage] = useState('Initializing...');
    const handlersSetupRef = useRef<boolean>(false);

    const players = game?.players || [];

    useEffect(() => {
        const initializeApp = async () => {
            setLoadingMessage('Loading saved game state...');
            const savedGame = getCookie('currentGame');
            const savedPlayer = getCookie('currentPlayer');
            if (savedGame && savedPlayer) {
                try {
                    const parsedGame = JSON.parse(savedGame);
                    const parsedPlayer = JSON.parse(savedPlayer);
                    console.log('Restoring game state from cookies:', parsedGame.joinCode, parsedPlayer.name);
                    setGame(convertToExtendedGame(parsedGame));
                    setPlayer(parsedPlayer);
                    setIsReader(parsedPlayer.isReader);
                } catch (error) {
                    console.error('Error parsing saved game state:', error);
                    removeCookie('currentGame');
                    removeCookie('currentPlayer');
                }
            }
            setIsInitialized(true);
            setIsLoading(false);
            setLoadingMessage('');
        };

        initializeApp();
    }, []);

    useEffect(() => {
        const savedGame = getCookie('currentGame');
        const savedPlayer = getCookie('currentPlayer');
        
        if (savedGame && savedPlayer && game?.joinCode && player?.name) {
            const parsedSavedGame = JSON.parse(savedGame);
            const parsedSavedPlayer = JSON.parse(savedPlayer);
            
            if (parsedSavedGame.joinCode === game.joinCode && parsedSavedPlayer.name === player.name) {
                const connectAndJoin = async () => {
                    try {
                        setIsLoading(true);
                        setLoadingMessage('Reconnecting to game...');
                        console.log('Auto-reconnecting to restored game:', game.joinCode, 'as player:', player.name);
                        await signalRService.joinGame(game.joinCode, player.name);
                        setIsLoading(false);
                        setLoadingMessage('');
                    } catch (error) {
                        console.error('Error auto-reconnecting to SignalR:', error);
                        setGame(null);
                        setPlayer(null);
                        removeCookie('currentGame');
                        removeCookie('currentPlayer');
                        setIsLoading(false);
                        setLoadingMessage('');
                    }
                };
                connectAndJoin();
            }
        }
    }, [game?.joinCode, player?.name]);

    useEffect(() => {
        if (!isInitialized || !game?.joinCode || handlersSetupRef.current) return;
        
        handlersSetupRef.current = true;
        console.log('Setting up SignalR handlers for game:', game.joinCode);
        
        signalRService.onGameStateSynced((payload: GameStatePayload) => {
            console.log("Syncing full game state:", payload);
            setGame(prevGame => ({ ...(prevGame as ExtendedGame), players: payload.players }));
            setCurrentRound(payload.activeRound);
            setAnswers(payload.currentAnswers || []);
            setPlayersWhoSubmitted(new Set(payload.currentAnswers?.map(a => a.playerId) || []));
        });

        signalRService.onPlayerListUpdated((updatedPlayers: Player[]) => {
            console.log("Received a player list update for the group.");
            setGame(prevGame => ({ ...(prevGame as ExtendedGame), players: updatedPlayers }));
            
            // Only show alert if user is in this specific game and host left
            const currentGameInfo = signalRService.getCurrentGameInfo();
            if (updatedPlayers.length === 0 && player && !isReader && 
                currentGameInfo.joinCode && game?.joinCode === currentGameInfo.joinCode) {
                console.log('Host left the game, all players have been kicked');
                alert('The host has left the game. You have been returned to the home page.');
                setGame(null);
                setPlayer(null);
                setCurrentRound(null);
                setAnswers([]);
                setPlayersWhoSubmitted(new Set());
                handlersSetupRef.current = false;
                removeCookie('currentGame');
                removeCookie('currentPlayer');
            }
        });

        signalRService.onRoundStarted((prompt) => {
            setCurrentRound({ 
                prompt, 
                isCompleted: false, 
                roundId: Date.now(),
                gameId: game?.gameId || 0
            });
            setAnswers([]);
            setPlayersWhoSubmitted(new Set());
        });

        signalRService.onAnswerReceived((playerId, playerName, answer) => {
            const numericPlayerId = parseInt(playerId, 10);
            setAnswers(prev => [...prev, { 
                answerId: Date.now(),
                playerId: numericPlayerId,
                playerName,
                content: answer,
                roundId: currentRound?.roundId || 0
            }]);
            setPlayersWhoSubmitted(prev => new Set(prev).add(numericPlayerId));
        });

        signalRService.onPlayerKicked((kickedPlayerId, kickedPlayerName) => {
            const numericKickedPlayerId = parseInt(kickedPlayerId, 10);
            if (player && player.playerId === numericKickedPlayerId) {
                console.log('You have been kicked from the game');
                setGame(null);
                setPlayer(null);
                setCurrentRound(null);
                setAnswers([]);
                setPlayersWhoSubmitted(new Set());
                handlersSetupRef.current = false;
                removeCookie('currentGame');
                removeCookie('currentPlayer');
            }
        });

        return () => {
            handlersSetupRef.current = false;
        };
    }, [isInitialized, game?.joinCode, player?.playerId, currentRound?.roundId]);

    useEffect(() => {
        if (!isInitialized) return;
        if (game && player) {
            setCookie('currentGame', JSON.stringify(game));
            setCookie('currentPlayer', JSON.stringify(player));
        } else {
            removeCookie('currentGame');
            removeCookie('currentPlayer');
        }
    }, [game, player, isInitialized]);

    const createGame = async (playerName: string) => {
        console.log('Starting createGame, setting loading to true');
        setIsLoading(true);
        setLoadingMessage('Creating game...');
        try {
            console.log('Calling leaveGame...');
            await leaveGame();
            console.log('Setting loading message: Setting up game...');
            setLoadingMessage('Setting up game...');
            const gameData = await createGameApi();
            console.log('Setting loading message: Joining as host...');
            setLoadingMessage('Joining as host...');
            const playerData = await joinGameApi(gameData.joinCode, playerName);
            console.log('Setting loading message: Loading game data...');
            setLoadingMessage('Loading game data...');
            const fullGameData = await getGame(gameData.joinCode);
            
            setGame(convertToExtendedGame(fullGameData));
            setPlayer(playerData);
            setIsReader(true);
            
            console.log('Setting loading message: Connecting to game...');
            setLoadingMessage('Connecting to game...');
            await signalRService.joinGame(gameData.joinCode, playerName);
            
            console.log('Game created successfully, clearing loading state');
            setIsLoading(false);
            setLoadingMessage('');
        } catch (error) {
            console.error('Error creating game:', error);
            setIsLoading(false);
            setLoadingMessage('');
            throw error;
        }
    };

    const joinGame = async (joinCode: string, playerName: string) => {
        console.log('Starting joinGame, setting loading to true');
        setIsLoading(true);
        setLoadingMessage('Joining game...');
        try {
            console.log('Calling leaveGame...');
            await leaveGame();
            console.log('Setting loading message: Loading game data...');
            setLoadingMessage('Loading game data...');
            const playerData = await joinGameApi(joinCode, playerName);
            const gameData = await getGame(joinCode);
            
            setGame(convertToExtendedGame(gameData));
            setPlayer(playerData);
            setIsReader(playerData.isReader);
            
            console.log('Setting loading message: Connecting to game...');
            setLoadingMessage('Connecting to game...');
            await signalRService.joinGame(joinCode, playerName);
            
            console.log('Game joined successfully, clearing loading state');
            setIsLoading(false);
            setLoadingMessage('');
        } catch (error) {
            console.error('Error joining game:', error);
            setIsLoading(false);
            setLoadingMessage('');
            throw error;
        }
    };

    const startNewRound = async (prompt: string) => {
        if (!game?.joinCode || !isReader) return;
        await signalRService.startRound(game.joinCode, prompt);
    };

    const submitAnswer = async (answer: string) => {
        if (!game?.joinCode || !player?.playerId) return;
        await signalRService.sendAnswer(game.joinCode, answer);
    };

    const kickPlayer = async (playerId: number) => {
        if (!game?.joinCode || !isReader) return;
        await signalRService.kickPlayer(game.joinCode, playerId);
    };

    const leaveGame = async () => {
        if (game?.joinCode) {
            try {
                await signalRService.leaveGame(game.joinCode);
            } catch (error) {
                console.error('Error leaving game via SignalR:', error);
            }
        }
         
        setGame(null);
        setPlayer(null);
        setCurrentRound(null);
        setAnswers([]);
        setPlayersWhoSubmitted(new Set());
        handlersSetupRef.current = false;
        removeCookie('currentGame');
        removeCookie('currentPlayer');
    };

    return (
        <GameContext.Provider value={{
            game,
            player,
            currentRound,
            answers,
            players,
            isReader,
            playersWhoSubmitted,
            isInitialized,
            isLoading,
            loadingMessage,
            createGame,
            joinGame,
            startNewRound,
            submitAnswer,
            kickPlayer,
            leaveGame
        }}>
            {children}
        </GameContext.Provider>
    );
};

export const useGame = (): GameContextType => {
    const context = useContext(GameContext);
    if (context === undefined) {
        throw new Error('useGame must be used within a GameProvider');
    }
    return context;
};