import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Game, Player, Round, Answer, getGame, joinGame as joinGameApi, createGame as createGameApi, getRounds, getAnswersForRound } from '../services/api';
import { signalRService } from '../services/signalR';
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
    setGame: (game: ExtendedGame) => void;
    setPlayer: (player: Player) => void;
    setCurrentRound: (round: Round) => void;
    setAnswers: (answers: Answer[]) => void;
    setPlayers: (players: Player[]) => void;
    createGame: (playerName: string) => Promise<void>;
    joinGame: (joinCode: string, playerName: string) => Promise<void>;
    startNewRound: (prompt: string) => Promise<void>;
    submitAnswer: (answer: string) => Promise<void>;
    leaveGame: () => Promise<void>;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

export const GameProvider = ({ children }: { children: ReactNode }) => {
    const [game, setGame] = useState<ExtendedGame | null>(null);
    const [player, setPlayer] = useState<Player | null>(null);
    const [currentRound, setCurrentRound] = useState<Round | null>(null);
    const [answers, setAnswers] = useState<Answer[]>([]);
    const [players, setPlayers] = useState<Player[]>([]);
    const [isReader, setIsReader] = useState(false);
    const [showAnswers, setShowAnswers] = useState(false);
    const [playersWhoSubmitted, setPlayersWhoSubmitted] = useState<Set<number>>(new Set());
    const [isReconnecting, setIsReconnecting] = useState(false);
    const [isCreator, setIsCreator] = useState(false);
    const [isInitialized, setIsInitialized] = useState(false);
    const [isReconnectingInProgress, setIsReconnectingInProgress] = useState(false);

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

    // Set up SignalR event handlers
    useEffect(() => {
        if (game?.joinCode) {
            // Handle player joined event
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

            // Handle player left event
            signalRService.onPlayerLeft((playerId) => {
                console.log('Player left:', playerId);
                setPlayers(prev => prev.filter(p => p.playerId.toString() !== playerId));
            });

            // Clean up event handlers when component unmounts or game changes
            return () => {
                // Clear the callbacks instead of trying to remove them
                signalRService.onPlayerJoined(() => {});
                signalRService.onPlayerLeft(() => {});
            };
        }
    }, [game?.joinCode]);

    useEffect(() => {
        if (game?.joinCode) {
            console.log('Setting up SignalR handlers for game:', game.joinCode);
            
            const setupHandlers = () => {
                // Clear previous handlers by setting empty callbacks
                signalRService.onRoundStarted(() => {});
                signalRService.onRoundEnded(() => {});
                signalRService.onAnswerReceived(() => {});

                // Set up new handlers
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

            // Cleanup function
            return () => {
                console.log('Cleaning up SignalR handlers');
                signalRService.onRoundStarted(() => {});
                signalRService.onRoundEnded(() => {});
                signalRService.onAnswerReceived(() => {});
            };
        }
    }, [game?.joinCode]);

    // Load game and player state from cookies on mount
    useEffect(() => {
        console.log('Loading cookies on mount...');
        console.log('All cookies:', document.cookie);
        
        // Test if cookies are working at all
        console.log('Testing cookie functionality...');
        setCookie('testCookie', 'testValue');
        const testResult = getCookie('testCookie');
        console.log('Test cookie result:', testResult);
        removeCookie('testCookie');
        
        const savedGame = getCookie('currentGame');
        const savedPlayer = getCookie('currentPlayer');
        const savedIsCreator = getCookie('isCreator');
        const savedIsReader = getCookie('isReader');

        console.log('Found saved cookies:', { 
            hasGame: !!savedGame, 
            hasPlayer: !!savedPlayer, 
            isCreator: savedIsCreator, 
            isReader: savedIsReader 
        });
        
        console.log('Raw cookie values:', {
            currentGame: savedGame,
            currentPlayer: savedPlayer,
            isCreator: savedIsCreator,
            isReader: savedIsReader
        });

        if (savedGame && savedPlayer) {
            try {
                const parsedGame = JSON.parse(savedGame);
                const parsedPlayer = JSON.parse(savedPlayer);
                console.log('Successfully parsed saved data:', { 
                    joinCode: parsedGame.joinCode, 
                    playerName: parsedPlayer.name 
                });
                setGame(convertToExtendedGame(parsedGame));
                setPlayer(parsedPlayer);
                setIsCreator(savedIsCreator === 'true');
                setIsReader(savedIsReader === 'true');
                setIsReconnecting(true);
            } catch (error) {
                console.error('Error loading saved game state:', error);
                // Clear invalid cookies
                removeCookie('currentGame');
                removeCookie('currentPlayer');
                removeCookie('isCreator');
                removeCookie('isReader');
            }
        } else {
            console.log('No valid saved game data found');
        }
        
        // Mark as initialized after loading cookies
        setIsInitialized(true);
    }, []);

    // Save game and player state to cookies when they change
    useEffect(() => {
        // Only save cookies after the component is initialized
        if (!isInitialized) {
            console.log('Skipping cookie save - not yet initialized');
            return;
        }
        
        console.log('useEffect triggered for cookie saving:', { game: !!game, player: !!player, isCreator, isReader });
        
        // Only save cookies if we have both game and player data
        if (game && player) {
            console.log('Saving cookies with game data:', { joinCode: game.joinCode, playerName: player.name });
            setCookie('currentGame', JSON.stringify(game));
            setCookie('currentPlayer', JSON.stringify(player));
            setCookie('isCreator', isCreator.toString());
            setCookie('isReader', isReader.toString());
        } else if (game === null && player === null) {
            // Only remove cookies if both game and player are explicitly null (not just falsy)
            console.log('Removing cookies - game and player are null');
            removeCookie('currentGame');
            removeCookie('currentPlayer');
            removeCookie('isCreator');
            removeCookie('isReader');
        } else {
            console.log('Skipping cookie save/remove - partial data available');
        }
    }, [game, player, isCreator, isReader, isInitialized]);

    // Handle reconnection when a saved game is found
    useEffect(() => {
        console.log('Reconnection useEffect triggered, isReconnecting:', isReconnecting);
        const reconnectToGame = async () => {
            if (isReconnecting && !isReconnectingInProgress) {
                setIsReconnectingInProgress(true);
                
                // Add a small delay to prevent rapid reconnection attempts
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                // Get the saved data from cookies directly
                const savedGame = getCookie('currentGame');
                const savedPlayer = getCookie('currentPlayer');
                
                console.log('Reconnection attempt - saved data:', { 
                    hasGame: !!savedGame, 
                    hasPlayer: !!savedPlayer 
                });
                
                if (savedGame && savedPlayer) {
                    try {
                        const parsedGame = JSON.parse(savedGame);
                        const parsedPlayer = JSON.parse(savedPlayer);
                        
                        console.log('Attempting to reconnect to game:', parsedGame.joinCode);
                        
                        await signalRService.connect();
                        await signalRService.joinGame(parsedGame.joinCode, parsedPlayer.name);
                        console.log('Successfully reconnected to game:', parsedGame.joinCode);
                        
                        // Restore player state from saved data
                        setPlayer(parsedPlayer);
                        setIsCreator(getCookie('isCreator') === 'true');
                        setIsReader(getCookie('isReader') === 'true');
                        
                        // Get the latest game state
                        const gameData = await getGame(parsedGame.joinCode);
                        setGame(convertToExtendedGame(gameData));
                        
                        // Get the latest rounds and answers if there's an active round
                        const rounds = await getRounds(parsedGame.gameId);
                        const currentRound = rounds.find(r => !r.isCompleted);
                        if (currentRound) {
                            setCurrentRound(currentRound);
                            const answers = await getAnswersForRound(currentRound.roundId);
                            setAnswers(answers);
                            // Update game with current round
                            setGame(prev => prev ? { ...prev, currentRound } : null);
                        }
                    } catch (error: any) {
                        console.error('Error reconnecting to game:', error);
                        
                        // Only clear cookies if it's a specific error that indicates the game doesn't exist
                        // or if the player is no longer valid
                        if (error.response?.status === 404 || error.response?.status === 400) {
                            console.log('Game or player no longer exists, clearing cookies');
                            removeCookie('currentGame');
                            removeCookie('currentPlayer');
                            removeCookie('isCreator');
                            removeCookie('isReader');
                            setGame(null);
                            setPlayer(null);
                        } else {
                            // For other errors (network issues, etc.), keep the cookies and try again later
                            console.log('Temporary error during reconnection, keeping cookies for retry');
                            // Don't clear cookies, just set reconnecting to false
                        }
                    } finally {
                        setIsReconnecting(false);
                        setIsReconnectingInProgress(false);
                    }
                } else {
                    console.log('No saved game data found for reconnection');
                    setIsReconnecting(false);
                    setIsReconnectingInProgress(false);
                }
            }
        };

        reconnectToGame();
    }, [isReconnecting, isReconnectingInProgress]);

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
            setGame(convertToExtendedGame(gameData));
            
            const playerData = await joinGameApi(gameData.joinCode, playerName);
            console.log('Player joined:', playerData);
            setPlayer(playerData);
            setIsReader(true);
            setIsCreator(true);
            
            await signalRService.joinGame(gameData.joinCode, playerName || 'Unknown Player');
            console.log('Created new game as reader:', gameData.joinCode);

            // Note: Cookies are automatically saved by the useEffect when state changes
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
            setIsCreator(false);
            
            // Get the game data
            const gameData = await getGame(joinCode);
            console.log('Game data retrieved:', gameData);
            setGame(convertToExtendedGame(gameData));
            
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
            
            // Note: Cookies are automatically saved by the useEffect when state changes
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
            
            const updatedPlayers = [...(prevGame.players || [])];
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

    const leaveGame = async () => {
        try {
            if (game?.joinCode) {
                // Leave the SignalR group
                try {
                    await signalRService.leaveGame(game.joinCode);
                } catch (error) {
                    console.warn('Error leaving SignalR group, but continuing with cleanup:', error);
                }
            }
            
            // Clear all state
            setGame(null);
            setPlayer(null);
            setCurrentRound(null);
            setAnswers([]);
            setPlayers([]);
            setShowAnswers(false);
            setPlayersWhoSubmitted(new Set());
            
            // Remove all cookies
            removeCookie('currentGame');
            removeCookie('currentPlayer');
            removeCookie('isCreator');
            removeCookie('isReader');
            
            console.log('Successfully left the game');
        } catch (error) {
            console.error('Error leaving game:', error);
            // Even if there's an error, we should still clear the state
            setGame(null);
            setPlayer(null);
            setCurrentRound(null);
            setAnswers([]);
            setPlayers([]);
            setShowAnswers(false);
            setPlayersWhoSubmitted(new Set());
            removeCookie('currentGame');
            removeCookie('currentPlayer');
            removeCookie('isCreator');
            removeCookie('isReader');
            throw error;
        }
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
            submitAnswer,
            leaveGame
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