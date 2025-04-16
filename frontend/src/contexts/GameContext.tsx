import React, { createContext, useContext, useState, useEffect } from 'react';
import { Game, Player, Round, Answer, getGame, joinGame as joinGameApi, createGame as createGameApi, getRounds, getAnswersForRound } from '../services/api';
import { signalRService } from '../services/signalR';

interface GameContextType {
    game: Game | null;
    player: Player | null;
    currentRound: Round | null;
    answers: Answer[];
    players: Player[];
    isReader: boolean;
    playersWhoSubmitted: Set<number>;
    setGame: (game: Game) => void;
    setPlayer: (player: Player) => void;
    setCurrentRound: (round: Round) => void;
    setAnswers: (answers: Answer[]) => void;
    setPlayers: (players: Player[]) => void;
    createGame: (playerName: string) => Promise<void>;
    joinGame: (joinCode: string, playerName: string) => Promise<void>;
    startNewRound: (prompt: string) => Promise<void>;
    submitAnswer: (answer: string) => Promise<void>;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

export const GameProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [game, setGame] = useState<Game | null>(null);
    const [player, setPlayer] = useState<Player | null>(null);
    const [currentRound, setCurrentRound] = useState<Round | null>(null);
    const [answers, setAnswers] = useState<Answer[]>([]);
    const [players, setPlayers] = useState<Player[]>([]);
    const [isReader, setIsReader] = useState(false);
    const [showAnswers, setShowAnswers] = useState(false);
    const [playersWhoSubmitted, setPlayersWhoSubmitted] = useState<Set<number>>(new Set());

    // Connect to SignalR when the game is set
    useEffect(() => {
        let isMounted = true;
        const connectSignalR = async () => {
            if (game?.joinCode) {
                console.log('Connecting to SignalR for game:', game.joinCode);
                try {
                    await signalRService.connect();
                    if (isMounted) {
                        console.log('SignalR connected successfully');
                        await signalRService.joinGame(game.joinCode, player?.name || 'Unknown Player');
                    }
                } catch (error) {
                    console.error('Error connecting to SignalR:', error);
                    // Retry connection after a delay
                    setTimeout(() => {
                        if (isMounted) {
                            connectSignalR();
                        }
                    }, 5000);
                }
            }
        };

        connectSignalR();

        return () => {
            isMounted = false;
        };
    }, [game?.joinCode]);

    useEffect(() => {
        if (game?.joinCode) {
            console.log('Setting up SignalR handlers for game:', game.joinCode);
            
            const setupHandlers = () => {
                signalRService.onPlayerJoined((playerId, playerName) => {
                    console.log('Player joined:', playerId, playerName);
                    if (!playerName) {
                        console.warn('Received player joined event without player name');
                        return;
                    }
                    // Only add the player if they're not already in the list
                    setPlayers(prev => {
                        const existingPlayer = prev.find(p => p.playerId.toString() === playerId);
                        if (existingPlayer) {
                            return prev;
                        }
                        return [...prev, { 
                            playerId: parseInt(playerId), 
                            name: playerName,
                            isReader: false,
                            gameId: game.gameId
                        }];
                    });
                });

                signalRService.onPlayerLeft((playerId) => {
                    console.log('Player left:', playerId);
                    setPlayers(prev => prev.filter(p => p.playerId.toString() !== playerId));
                });

                signalRService.onRoundStarted((prompt) => {
                    console.log('Round started with prompt:', prompt);
                    setCurrentRound({ 
                        prompt, 
                        isCompleted: false, 
                        roundId: Date.now(), // Temporary ID for round
                        gameId: game?.gameId || 0 // Use the current game's ID
                    });
                    setAnswers([]); // Clear previous answers
                });

                signalRService.onRoundEnded(() => {
                    console.log('Round ended');
                    setCurrentRound(null);
                });

                signalRService.onAnswerReceived((playerId, playerName, answer) => {
                    console.log('Answer received from player:', playerId, playerName, answer);
                    if (!playerName) {
                        console.warn('Received answer without player name');
                        return;
                    }
                    setAnswers(prev => [...prev, { 
                        answerId: Date.now(), // Temporary ID
                        playerId: parseInt(playerId),
                        playerName: playerName,
                        content: answer,
                        roundId: currentRound?.roundId || 0
                    }]);
                });
            };

            setupHandlers();
        }
    }, [game?.joinCode]);

    // Add localStorage persistence
    useEffect(() => {
        if (game && player) {
            localStorage.setItem('currentGame', JSON.stringify({
                game,
                player,
                isReader
            }));
        }
    }, [game, player, isReader]);

    // Load game state from localStorage on mount
    useEffect(() => {
        const savedGame = localStorage.getItem('currentGame');
        if (savedGame) {
            try {
                const { game: savedGameData, player: savedPlayer, isReader: savedIsReader } = JSON.parse(savedGame);
                setGame(savedGameData);
                setPlayer(savedPlayer);
                setIsReader(savedIsReader);
            } catch (error) {
                console.error('Error loading saved game:', error);
                localStorage.removeItem('currentGame');
            }
        }
    }, []);

    const createGame = async (playerName: string) => {
        try {
            // Reset game state
            setAnswers([]);
            setCurrentRound(null);
            setPlayers([]);
            setShowAnswers(false);

            console.log('Creating new game for player:', playerName);
            const gameData = await createGameApi();
            console.log('Game created:', gameData);
            setGame(gameData);
            
            const playerData = await joinGameApi(gameData.joinCode, playerName);
            console.log('Player joined:', playerData);
            setPlayer(playerData);
            setIsReader(true);
            
            await signalRService.joinGame(gameData.joinCode, playerName || 'Unknown Player');
            console.log('Created new game as reader:', gameData.joinCode);
        } catch (error) {
            console.error('Error creating game:', error);
            throw error;
        }
    };

    const joinGame = async (joinCode: string, playerName: string) => {
        try {
            // Reset game state
            setAnswers([]);
            setCurrentRound(null);
            setPlayers([]);
            setShowAnswers(false);

            console.log('Joining game:', joinCode, 'as player:', playerName);
            
            // First ensure SignalR is connected
            await signalRService.connect();
            
            // Then join the game via API
            const playerData = await joinGameApi(joinCode, playerName);
            console.log('Player joined:', playerData);
            setPlayer(playerData);
            setIsReader(false);
            
            // Get the game data
            const gameData = await getGame(joinCode);
            console.log('Game data retrieved:', gameData);
            setGame(gameData);
            
            // Join the game via SignalR with the player name
            await signalRService.joinGame(joinCode, playerName || 'Unknown Player');
            console.log('Successfully joined game via SignalR:', joinCode);
            
            // Add the player to the players list
            setPlayers(prev => [...prev, { 
                playerId: playerData.playerId,
                name: playerName,
                isReader: false,
                gameId: gameData.gameId
            }]);
            
        } catch (error) {
            console.error('Error joining game:', error);
            throw error;
        }
    };

    const startNewRound = async (prompt: string) => {
        if (!game?.joinCode) {
            console.error('Cannot start round: No active game');
            throw new Error('No active game');
        }

        if (!isReader) {
            console.error('Cannot start round: Not the reader');
            throw new Error('Not the reader');
        }

        try {
            console.log('Starting new round with prompt:', prompt, 'for game:', game.joinCode);
            await signalRService.startRound(game.joinCode, prompt);
            console.log('Round started successfully');
        } catch (error) {
            console.error('Error starting round:', error);
            throw error;
        }
    };

    const submitAnswer = async (answer: string) => {
        if (!game?.joinCode || !player?.playerId) {
            console.error('Cannot submit answer: No active game or player');
            throw new Error('No active game or player');
        }

        // Check if player has already submitted an answer for this round
        if (playersWhoSubmitted.has(player.playerId)) {
            throw new Error('You have already submitted an answer for this round');
        }

        try {
            console.log('Submitting answer:', answer);
            await signalRService.sendAnswer(game.joinCode, answer);
            console.log('Answer submitted successfully');
            
            // Add player to the set of players who have submitted
            setPlayersWhoSubmitted(prev => new Set(prev).add(player.playerId));
        } catch (error) {
            console.error('Error submitting answer:', error);
            throw error;
        }
    };

    // Reset submitted players when a new round starts
    useEffect(() => {
        if (currentRound) {
            setPlayersWhoSubmitted(new Set());
        }
    }, [currentRound]);

    // Add cleanup for submitted players when game ends
    useEffect(() => {
        if (!game) {
            setPlayersWhoSubmitted(new Set());
        }
    }, [game]);

    const handlePlayerJoined = (playerData: Player) => {
        if (!playerData) {
            console.error('Received undefined player data in handlePlayerJoined');
            return;
        }
        
        setGame(prevGame => {
            if (!prevGame) {
                console.error('Cannot update game state: game is undefined');
                return null;
            }
            
            const updatedPlayers = [...prevGame.players];
            const existingPlayerIndex = updatedPlayers.findIndex(p => p.playerId === playerData.playerId);
            
            if (existingPlayerIndex === -1) {
                updatedPlayers.push(playerData);
            } else {
                updatedPlayers[existingPlayerIndex] = playerData;
            }
            
            return {
                ...prevGame,
                players: updatedPlayers
            };
        });
    };

    // Add cleanup on unmount
    useEffect(() => {
        return () => {
            // Clean up game state when component unmounts
            setGame(null);
            setPlayer(null);
            setCurrentRound(null);
            setAnswers([]);
            setPlayers([]);
            setShowAnswers(false);
        };
    }, []);

    return (
        <GameContext.Provider value={{
            game,
            player,
            currentRound,
            answers,
            players,
            isReader,
            playersWhoSubmitted,
            setGame,
            setPlayer,
            setCurrentRound,
            setAnswers,
            setPlayers,
            createGame,
            joinGame,
            startNewRound,
            submitAnswer
        }}>
            {children}
        </GameContext.Provider>
    );
};

export const useGame = () => {
    const context = useContext(GameContext);
    if (context === undefined) {
        throw new Error('useGame must be used within a GameProvider');
    }
    return context;
}; 