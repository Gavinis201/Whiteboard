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
    const handlersSetupRef = useRef<boolean>(false);

    const players = game?.players || [];

    useEffect(() => {
        const connectAndJoin = async () => {
            if (game?.joinCode && player?.name) {
                try {
                    console.log('Attempting to reconnect to game:', game.joinCode, 'as player:', player.name);
                    await signalRService.joinGame(game.joinCode, player.name);
                } catch (error) {
                    console.error('Error connecting to SignalR and joining game:', error);
                    // If we can't reconnect, clear the invalid state
                    setGame(null);
                    setPlayer(null);
                    removeCookie('currentGame');
                    removeCookie('currentPlayer');
                }
            }
        };
        connectAndJoin();
    }, [game?.joinCode, player?.name]);

    useEffect(() => {
        if (game?.joinCode && !handlersSetupRef.current) {
            handlersSetupRef.current = true;
            
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
                // If the current player is the one being kicked, redirect to home
                if (player && player.playerId === numericKickedPlayerId) {
                    console.log('You have been kicked from the game');
                    alert('You have been kicked from the game by the host.');
                    leaveGame();
                }
                // The player list will be updated via PlayerListUpdated event
            });

            return () => {
                handlersSetupRef.current = false;
            };
        }
    }, [game?.joinCode, currentRound?.roundId]);


    useEffect(() => {
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
                // Clear invalid cookies but don't call leaveGame to avoid redirect
                removeCookie('currentGame');
                removeCookie('currentPlayer');
            }
        }
        setIsInitialized(true);
    }, []);

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
        await leaveGame();
        const gameData = await createGameApi();
        const playerData = await joinGameApi(gameData.joinCode, playerName);
        const fullGameData = await getGame(gameData.joinCode);
        
        setGame(convertToExtendedGame(fullGameData));
        setPlayer(playerData);
        setIsReader(true);
    };

    const joinGame = async (joinCode: string, playerName: string) => {
        await leaveGame();
        const playerData = await joinGameApi(joinCode, playerName);
        const gameData = await getGame(joinCode);
        
        setGame(convertToExtendedGame(gameData));
        setPlayer(playerData);
        setIsReader(playerData.isReader);
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