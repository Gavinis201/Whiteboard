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
    selectedTimerDuration: number | null;
    timeRemaining: number | null;
    roundStartTime: Date | null;
    isTimerActive: boolean;
    judgingModeEnabled: boolean;
    setSelectedTimerDuration: (duration: number | null) => void;
    setTimeRemaining: (time: number | null) => void;
    setRoundStartTime: (time: Date | null) => void;
    setIsTimerActive: (active: boolean) => void;
    setOnTimerExpire: (callback: (() => void) | null) => void;
    createGame: (playerName: string) => Promise<void>;
    joinGame: (joinCode: string, playerName: string) => Promise<void>;
    startNewRound: (prompt: string, timerDuration?: number) => Promise<void>;
    submitAnswer: (answer: string) => Promise<void>;
    kickPlayer: (playerId: number) => Promise<void>;
    toggleJudgingMode: (enabled: boolean) => Promise<void>;
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
    const [selectedTimerDuration, setSelectedTimerDuration] = useState<number | null>(null);
    const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
    const [roundStartTime, setRoundStartTime] = useState<Date | null>(null);
    const [isTimerActive, setIsTimerActive] = useState(false);
    const [judgingModeEnabled, setJudgingModeEnabled] = useState(false);
    const [onTimerExpire, setOnTimerExpire] = useState<(() => void) | null>(null);
    const handlersSetupRef = useRef<boolean>(false);
    const timerIntervalRef = useRef<number | null>(null);
    const lastSyncedTimerRef = useRef<{ roundId: number; remainingSeconds: number } | null>(null);
    const submissionInProgressRef = useRef<boolean>(false);
    const isJoiningRef = useRef<boolean>(false);
    const hasNavigatedToJudgingRef = useRef<boolean>(false);
    const previousRoundIdRef = useRef<number | null>(null);
    const pageVisibilityRef = useRef<boolean>(true); // ✅ NEW: Track page visibility
    const autoSubmissionAttemptedRef = useRef<boolean>(false); // ✅ NEW: Prevent multiple auto-submissions

    const players = game?.players || [];

    // ✅ ENHANCED: Page visibility detection for better mobile Safari support
    useEffect(() => {
        const handleVisibilityChange = () => {
            const isVisible = !document.hidden;
            pageVisibilityRef.current = isVisible;
            console.log('Page visibility changed:', isVisible);
            
            // If page becomes visible, check connection and sync state
            if (isVisible) {
                console.log('Page became visible, checking connection and syncing state');
                
                // Force a connection check and re-sync if needed
                if (game?.joinCode && player?.name && !signalRService.isConnected()) {
                    console.log('Connection lost while in background, attempting to reconnect');
                    signalRService.joinGame(game.joinCode, player.name).catch(err => {
                        console.error('Failed to reconnect after visibility change:', err);
                    });
                }
                
                // If we have an active timer, check if we need to auto-submit
                if (isTimerActive && timeRemaining !== null && timeRemaining <= 0 && !autoSubmissionAttemptedRef.current) {
                    console.log('Page became visible with expired timer, attempting auto-submission');
                    if (onTimerExpire) {
                        autoSubmissionAttemptedRef.current = true;
                        onTimerExpire();
                    }
                }
            } else {
                console.log('Page went to background, saving current state');
                // Save current state when going to background
                if (game && player) {
                    setCookie('currentGame', JSON.stringify(game));
                    setCookie('currentPlayer', JSON.stringify(player));
                    if (currentRound) {
                        setCookie('currentRound', JSON.stringify(currentRound));
                    }
                    if (playersWhoSubmitted.size > 0) {
                        setCookie('playersWhoSubmitted', JSON.stringify(Array.from(playersWhoSubmitted)));
                    }
                }
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [isTimerActive, timeRemaining, onTimerExpire, game?.joinCode, player?.name, currentRound, playersWhoSubmitted]);

    useEffect(() => {
        const initializeApp = async () => {
            setLoadingMessage('Loading saved game state...');
            const savedGame = getCookie('currentGame');
            const savedPlayer = getCookie('currentPlayer');
            const savedRound = getCookie('currentRound');
            const savedPlayersWhoSubmitted = getCookie('playersWhoSubmitted');
            
            // Check if we're in the process of joining (this might happen during page refresh)
            if (isJoiningRef.current) {
                console.log('Skipping initialization - currently joining a game');
                setIsInitialized(true);
                setIsLoading(false);
                setLoadingMessage('');
                return;
            }
            
            if (savedGame && savedPlayer) {
                try {
                    const parsedGame = JSON.parse(savedGame);
                    const parsedPlayer = JSON.parse(savedPlayer);
                    console.log('Restoring game state from cookies:', parsedGame.joinCode, parsedPlayer.name);
                    setGame(convertToExtendedGame(parsedGame));
                    setPlayer(parsedPlayer);
                    setIsReader(parsedPlayer.isReader);
                    
                    // Restore round and submission state if available
                    if (savedRound && savedPlayersWhoSubmitted) {
                        try {
                            const parsedRound = JSON.parse(savedRound);
                            const parsedPlayersWhoSubmitted = JSON.parse(savedPlayersWhoSubmitted);
                            console.log('Restoring round and submission state from cookies');
                            setCurrentRound(parsedRound);
                            setPlayersWhoSubmitted(new Set(parsedPlayersWhoSubmitted));
                        } catch (error) {
                            console.error('Error parsing saved round/submission state:', error);
                        }
                    }
                } catch (error) {
                    console.error('Error parsing saved game state:', error);
                    removeCookie('currentGame');
                    removeCookie('currentPlayer');
                    removeCookie('currentRound');
                    removeCookie('playersWhoSubmitted');
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
        
        // Don't auto-reconnect if we're in the process of joining a game
        if (isJoiningRef.current) {
            console.log('Auto-reconnection skipped - currently joining a game');
            return;
        }
        
        if (savedGame && savedPlayer && game?.joinCode && player?.name) {
            const parsedSavedGame = JSON.parse(savedGame);
            const parsedSavedPlayer = JSON.parse(savedPlayer);
            
            console.log('Checking auto-reconnection:');
            console.log('Saved game join code:', parsedSavedGame.joinCode);
            console.log('Current game join code:', game.joinCode);
            console.log('Saved player name:', parsedSavedPlayer.name);
            console.log('Current player name:', player.name);
            console.log('Saved player isReader:', parsedSavedPlayer.isReader);
            console.log('Current player isReader:', player.isReader);
            
            // Only auto-reconnect if the saved game matches AND the player details match exactly
            if (parsedSavedGame.joinCode === game.joinCode && 
                parsedSavedPlayer.name === player.name &&
                parsedSavedPlayer.isReader === player.isReader) {
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
            } else {
                console.log('Auto-reconnection skipped - player details do not match');
                // Clear stale cookies if they don't match
                removeCookie('currentGame');
                removeCookie('currentPlayer');
            }
        }
    }, [game?.joinCode, player?.name, player?.isReader]);

    useEffect(() => {
        if (!isInitialized || !game?.joinCode || handlersSetupRef.current) return;
        
        handlersSetupRef.current = true;
        console.log('Setting up SignalR handlers for game:', game.joinCode);
        
        signalRService.onGameStateSynced((payload: GameStatePayload) => {
            console.log("Syncing full game state:", payload);
            console.log("Current answers:", payload.currentAnswers);
            console.log("Current round ID:", payload.activeRound?.roundId);
            console.log("Previous round ID:", currentRound?.roundId);
            console.log("Judging mode enabled:", payload.judgingModeEnabled);
            console.log("Full payload keys:", Object.keys(payload));
            
            setGame(prevGame => ({ 
                ...(prevGame as ExtendedGame), 
                players: payload.players,
                judgingModeEnabled: payload.judgingModeEnabled
            }));
            setJudgingModeEnabled(payload.judgingModeEnabled);
            
            if (payload.activeRound) {
                const isNewRound = currentRound?.roundId !== payload.activeRound.roundId;
                console.log("Is new round:", isNewRound);
                
                // ✅ OPTIMIZED: Immediate round state update for faster transitions
                setCurrentRound({
                    prompt: payload.activeRound.prompt,
                    isCompleted: payload.activeRound.isCompleted,
                    roundId: payload.activeRound.roundId,
                    gameId: payload.activeRound.gameId,
                    timerDurationMinutes: payload.activeRound.timerDurationMinutes
                });
                
                // Reset auto-submission flag for new rounds
                if (isNewRound) {
                    autoSubmissionAttemptedRef.current = false;
                    // Reset submission flag for new rounds
                    submissionInProgressRef.current = false;
                }
                
                // Improved timer sync logic - always sync from backend for consistency
                if (payload.timerInfo && payload.timerInfo.remainingSeconds > 0) {
                    console.log("Syncing timer from backend:", payload.timerInfo);
                    
                    // Always update timer state from backend to ensure consistency
                    setSelectedTimerDuration(payload.timerInfo.durationMinutes);
                    setTimeRemaining(payload.timerInfo.remainingSeconds);
                    setIsTimerActive(true);
                    
                    // Calculate the actual start time based on remaining time from backend
                    const startTime = new Date(Date.now() - (payload.timerInfo.durationMinutes * 60 - payload.timerInfo.remainingSeconds) * 1000);
                    setRoundStartTime(startTime);
                    
                    // Update last synced timer info
                    lastSyncedTimerRef.current = {
                        roundId: payload.activeRound.roundId,
                        remainingSeconds: payload.timerInfo.remainingSeconds
                    };
                } else if (payload.timerInfo && payload.timerInfo.remainingSeconds <= 0) {
                    // Timer has already expired, don't start it
                    console.log("Timer has already expired, not starting frontend timer");
                    setSelectedTimerDuration(payload.timerInfo.durationMinutes);
                    setTimeRemaining(0);
                    setIsTimerActive(false);
                    setRoundStartTime(null);
                    lastSyncedTimerRef.current = null;
                } else {
                    // No timer info, reset timer state
                    setSelectedTimerDuration(null);
                    setTimeRemaining(null);
                    setIsTimerActive(false);
                    setRoundStartTime(null);
                    lastSyncedTimerRef.current = null;
                }
                
                // Handle answers and submission state
                if (isNewRound) {
                    // For new rounds, always start with empty state regardless of backend data
                    console.log("New round detected, clearing answers and submission state");
                    setAnswers([]);
                    setPlayersWhoSubmitted(new Set());
                } else {
                    // For existing rounds, use backend data but filter by current round
                    const currentRoundAnswers = payload.currentAnswers?.filter(a => a.roundId === payload.activeRound?.roundId) || [];
                    console.log("Existing round, using filtered answers:", currentRoundAnswers);
                    setAnswers(currentRoundAnswers);
                    setPlayersWhoSubmitted(new Set(currentRoundAnswers.map(a => a.playerId)));
                }
                
                // ✅ NEW: Ensure prompt is visible for reconnecting players
                // If this is a reconnection to an active round, make sure the prompt is properly displayed
                if (payload.activeRound.prompt && !isNewRound) {
                    console.log("Reconnecting to active round, ensuring prompt visibility:", payload.activeRound.prompt);
                    // The prompt should already be set in currentRound, but we can add additional logging
                    console.log("Current round prompt after sync:", payload.activeRound.prompt);
                    console.log("Current round state after sync:", {
                        roundId: payload.activeRound.roundId,
                        prompt: payload.activeRound.prompt,
                        timerDurationMinutes: payload.activeRound.timerDurationMinutes,
                        isCompleted: payload.activeRound.isCompleted
                    });
                }
            } else {
                setCurrentRound(null);
                // Reset timer state when no active round
                setSelectedTimerDuration(null);
                setTimeRemaining(null);
                setIsTimerActive(false);
                setRoundStartTime(null);
                lastSyncedTimerRef.current = null;
                
                // Clear answers when no active round
                setAnswers([]);
                setPlayersWhoSubmitted(new Set());
            }
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

        signalRService.onRoundStarted((prompt, roundId, timerDurationMinutes) => {
            console.log("Round started with prompt:", prompt, "roundId:", roundId, "timer:", timerDurationMinutes);
            console.log("Clearing answers and playersWhoSubmitted for new round");
            console.log("Previous round ID:", currentRound?.roundId, "New round ID:", roundId);
            
            // Reset auto-submission flag for new rounds
            autoSubmissionAttemptedRef.current = false;
            
            // ✅ FIX: Reset navigation state for new rounds
            hasNavigatedToJudgingRef.current = false;
            previousRoundIdRef.current = roundId;
            
            // ✅ OPTIMIZED: Immediate state updates for faster round transitions
            setCurrentRound({ 
                prompt, 
                isCompleted: false, 
                roundId: roundId,
                gameId: game?.gameId || 0,
                timerDurationMinutes: timerDurationMinutes
            });
            
            // Force clear answers and submission state for new round
            console.log("Force clearing answers and playersWhoSubmitted");
            setAnswers([]);
            setPlayersWhoSubmitted(new Set());
            
            // Always reset timer state for new rounds to ensure consistency
            setSelectedTimerDuration(timerDurationMinutes || null);
            setRoundStartTime(new Date());
            setIsTimerActive(!!timerDurationMinutes);
            lastSyncedTimerRef.current = null;
            
            // Also reset submission flag
            submissionInProgressRef.current = false;
        });

        signalRService.onAnswerReceived((playerId, playerName, answer, answerId, roundNumber) => {
            const numericPlayerId = parseInt(playerId, 10);
            console.log("Answer received from player:", playerName, "ID:", numericPlayerId, "AnswerID:", answerId, "RoundNumber:", roundNumber);
            console.log("Current playersWhoSubmitted before update:", Array.from(playersWhoSubmitted));
            setAnswers(prev => [...prev, { 
                answerId: answerId,
                playerId: numericPlayerId,
                playerName,
                content: answer,
                roundId: roundNumber || currentRound?.roundId || 0
            }]);
            setPlayersWhoSubmitted(prev => {
                const newSet = new Set(prev).add(numericPlayerId);
                console.log("Updated playersWhoSubmitted:", Array.from(newSet));
                return newSet;
            });
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

        signalRService.onJudgingModeToggled((enabled: boolean) => {
            console.log('Judging mode toggled:', enabled);
            setJudgingModeEnabled(enabled);
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
            // Also save the submission state
            if (currentRound) {
                setCookie('currentRound', JSON.stringify(currentRound));
                setCookie('playersWhoSubmitted', JSON.stringify(Array.from(playersWhoSubmitted)));
            }
        } else {
            removeCookie('currentGame');
            removeCookie('currentPlayer');
            removeCookie('currentRound');
            removeCookie('playersWhoSubmitted');
        }
    }, [game, player, isInitialized, currentRound, playersWhoSubmitted]);

    // Auto-navigate to judging when everyone has submitted (only if judging mode is enabled)
    useEffect(() => {
        if (!isInitialized || !game || !player || !currentRound) {
            return;
        }

        // Only auto-navigate for non-reader players (joined players, not the host)
        if (player.isReader) {
            return; // Host stays on the game page
        }

        // Check if we're already on the judging page
        const isOnJudgingPage = window.location.pathname === '/judging';
        if (isOnJudgingPage) {
            return; // Already on judging page, don't navigate
        }

        // Only check for non-reader players
        const nonReaderPlayers = players.filter(p => !p.isReader);
        const allNonReadersSubmitted = nonReaderPlayers.length > 0 && 
            nonReaderPlayers.every(p => playersWhoSubmitted.has(p.playerId));

        if (allNonReadersSubmitted && !hasNavigatedToJudgingRef.current) {
            // Only navigate to judging page if judging mode is enabled
            if (judgingModeEnabled) {
                console.log('All players have submitted and judging mode is enabled, navigating to judging page');
                hasNavigatedToJudgingRef.current = true;
                
                // ✅ OPTIMIZED: Immediate navigation for faster transitions
                window.location.href = '/judging';
            } else {
                console.log('All players have submitted but judging mode is disabled, staying on game page');
            }
        }
    }, [isInitialized, game, player, currentRound, players, playersWhoSubmitted, judgingModeEnabled]);

    // Reset navigation flag when a new round starts
    useEffect(() => {
        if (currentRound) {
            hasNavigatedToJudgingRef.current = false;
            // Initialize previous round ID if not set
            if (previousRoundIdRef.current === null) {
                previousRoundIdRef.current = currentRound.roundId;
            }
        }
    }, [currentRound?.roundId]);

    // Auto-redirect players back to game page when a new round starts
    useEffect(() => {
        if (!isInitialized || !game || !player || !currentRound) {
            return;
        }

        // Only redirect non-reader players (joined players, not the host)
        if (player.isReader) {
            return; // Host stays on the game page
        }

        // Check if we're currently on the judging page and a new round has started
        const isOnJudgingPage = window.location.pathname === '/judging';
        
        // ✅ FIX: Only redirect if we're on the judging page AND this is actually a new round
        // AND we haven't already navigated for this round
        if (isOnJudgingPage && 
            currentRound.roundId !== previousRoundIdRef.current && 
            !hasNavigatedToJudgingRef.current) {
            console.log('New round started, redirecting player back to game page');
            previousRoundIdRef.current = currentRound.roundId;
            
            // ✅ OPTIMIZED: Immediate navigation for faster transitions
            window.location.href = '/game';
        }
    }, [isInitialized, game, player, currentRound?.roundId]);

    const createGame = async (playerName: string) => {
        console.log('Starting createGame, setting loading to true');
        setIsLoading(true);
        setLoadingMessage('Creating game...');
        isJoiningRef.current = true;
        try {
            console.log('Calling leaveGame...');
            await leaveGame();
            
            // Clear any existing cookies before creating to prevent session conflicts
            console.log('Clearing existing cookies before creating new game');
            removeCookie('currentGame');
            removeCookie('currentPlayer');
            
            // Clear any existing state to ensure clean start
            setGame(null);
            setPlayer(null);
            setCurrentRound(null);
            setAnswers([]);
            setPlayersWhoSubmitted(new Set());
            setIsReader(false);
            
            // ✅ OPTIMIZED: Sequential API calls for game creation (needed for dependency)
            const gameData = await createGameApi();
            const playerData = await joinGameApi(gameData.joinCode, playerName);
            
            const fullGameData = await getGame(gameData.joinCode);
            
            console.log('Create game response - Player data:', playerData);
            console.log('Create game response - Game data:', fullGameData);
            console.log('Player isReader:', playerData.isReader);
            
            setGame(convertToExtendedGame(fullGameData));
            setPlayer(playerData);
            setIsReader(true);
            
            await signalRService.joinGame(gameData.joinCode, playerName);
            
            console.log('Game created successfully, clearing loading state');
            setIsLoading(false);
            setLoadingMessage('');
        } catch (error) {
            console.error('Error creating game:', error);
            setIsLoading(false);
            setLoadingMessage('');
            throw error;
        } finally {
            isJoiningRef.current = false;
        }
    };

    const joinGame = async (joinCode: string, playerName: string) => {
        console.log('Starting joinGame, setting loading to true');
        setIsLoading(true);
        setLoadingMessage('Joining game...');
        isJoiningRef.current = true;
        try {
            console.log('Calling leaveGame...');
            await leaveGame();
            
            // Clear any existing cookies before joining to prevent session conflicts
            console.log('Clearing existing cookies before joining new game');
            removeCookie('currentGame');
            removeCookie('currentPlayer');
            
            // Clear any existing state to ensure clean start
            setGame(null);
            setPlayer(null);
            setCurrentRound(null);
            setAnswers([]);
            setPlayersWhoSubmitted(new Set());
            setIsReader(false);
            
            // ✅ OPTIMIZED: Removed delay for faster game joining
            
            // ✅ OPTIMIZED: Parallel API calls for faster game joining
            const [playerData, gameData] = await Promise.all([
                joinGameApi(joinCode, playerName),
                getGame(joinCode)
            ]);
            
            console.log('Join game response - Player data:', playerData);
            console.log('Join game response - Game data:', gameData);
            console.log('Player isReader:', playerData.isReader);
            
            // Verify we're not getting host data when we shouldn't be
            if (playerData.isReader) {
                console.warn('WARNING: Joining player received isReader=true. This might indicate a backend issue.');
            }
            
            setGame(convertToExtendedGame(gameData));
            setPlayer(playerData);
            setIsReader(playerData.isReader);
            
            await signalRService.joinGame(joinCode, playerName);
            
            console.log('Game joined successfully, clearing loading state');
            setIsLoading(false);
            setLoadingMessage('');
        } catch (error: any) {
            console.error('Error joining game:', error);
            setIsLoading(false);
            setLoadingMessage('');
            
            // Propagate the error with the specific message
            if (error?.message) {
                throw new Error(error.message);
            } else {
                throw new Error('Failed to join game. Please check the game code and try again.');
            }
        } finally {
            isJoiningRef.current = false;
        }
    };

    const startNewRound = async (prompt: string, timerDuration?: number) => {
        if (!game?.joinCode || !isReader) return;
        
        // Reset timer state for host
        setSelectedTimerDuration(timerDuration || null);
        setRoundStartTime(new Date());
        setIsTimerActive(!!timerDuration);
        lastSyncedTimerRef.current = null;
        
        await signalRService.startRound(game.joinCode, prompt, timerDuration);
    };

    const submitAnswer = async (answer: string) => {
        if (!game?.joinCode || !player?.playerId) {
            console.error('Cannot submit answer: missing game or player info');
            throw new Error('No longer in game. Please refresh and try again.');
        }
        
        // Prevent double submissions
        if (submissionInProgressRef.current) {
            console.log('Submission already in progress, skipping');
            return;
        }
        
        // Check if already submitted
        if (playersWhoSubmitted.has(player.playerId)) {
            console.log('Player already submitted, skipping');
            return;
        }
        
        submissionInProgressRef.current = true;
        
        try {
            // ✅ NEW: Ensure connection is stable before submitting
            if (!signalRService.isConnected()) {
                console.log('SignalR not connected, attempting to reconnect before submission');
                await signalRService.joinGame(game.joinCode, player.name);
                
                // Wait a moment for the connection to stabilize
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            await signalRService.sendAnswer(game.joinCode, answer);
            console.log('Answer submitted successfully');
        } catch (error: any) {
            console.error('Error submitting answer:', error);
            
            // Enhanced retry logic with better error handling
            if (signalRService.isInGame() && (error.message?.includes('Player not identified') || 
                error.message?.includes('Player not found') || 
                error.message?.includes('No SignalR connection'))) {
                try {
                    console.log('Connection issue detected, attempting to reconnect and retry submission');
                    
                    // Force rejoin the game
                    await signalRService.joinGame(game.joinCode, player.name);
                    
                    // Wait for connection to stabilize
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    
                    // Retry the submission
                    await signalRService.sendAnswer(game.joinCode, answer);
                    console.log('Answer submitted successfully after reconnection');
                } catch (retryError) {
                    console.error('Error retrying answer submission:', retryError);
                    submissionInProgressRef.current = false;
                    throw new Error('Failed to submit drawing after reconnection. Please try refreshing the page.');
                }
            } else {
                submissionInProgressRef.current = false;
                throw error;
            }
        } finally {
            // ✅ OPTIMIZED: Immediate reset for faster response
            submissionInProgressRef.current = false;
        }
    };

    // ✅ IMPROVED: Better timer countdown effect with page visibility handling
    useEffect(() => {
        // Clear any existing timer
        if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = null;
        }

        if (!isTimerActive || !selectedTimerDuration || !roundStartTime || !player) {
            setTimeRemaining(null);
            return;
        }

        // Check if all non-host players have submitted
        const nonHostPlayers = players.filter(p => !p.isReader);
        const allNonHostPlayersSubmitted = nonHostPlayers.length > 0 && 
            nonHostPlayers.every(p => playersWhoSubmitted.has(p.playerId));

        // Stop timer if all non-host players have submitted
        if (allNonHostPlayersSubmitted) {
            console.log('All non-host players have submitted, stopping timer');
            setTimeRemaining(0);
            setIsTimerActive(false);
            return;
        }

        // Don't show timer for players who have already submitted
        if (!isReader && playersWhoSubmitted.has(player.playerId)) {
            console.log('Player already submitted, hiding timer');
            setTimeRemaining(null);
            return;
        }

        const interval = setInterval(() => {
            const now = new Date();
            const elapsed = Math.floor((now.getTime() - roundStartTime.getTime()) / 1000);
            const remaining = (selectedTimerDuration * 60) - elapsed;
            
            if (remaining <= 0) {
                console.log('Timer expired, calling auto-submission');
                setTimeRemaining(0);
                setIsTimerActive(false);
                
                // Call the timer expire callback for auto-submission with error handling
                if (onTimerExpire && !submissionInProgressRef.current && !autoSubmissionAttemptedRef.current) {
                    try {
                        console.log('Timer expired, calling auto-submission callback');
                        autoSubmissionAttemptedRef.current = true;
                        onTimerExpire();
                    } catch (error) {
                        console.error('Error in timer expire callback:', error);
                    }
                } else if (submissionInProgressRef.current) {
                    console.log('Submission already in progress, skipping auto-submission');
                } else if (autoSubmissionAttemptedRef.current) {
                    console.log('Auto-submission already attempted, skipping');
                }
            } else {
                setTimeRemaining(remaining);
            }
        }, 500); // ✅ OPTIMIZED: Faster timer updates for more responsive countdown

        timerIntervalRef.current = interval;

        return () => {
            if (timerIntervalRef.current) {
                clearInterval(timerIntervalRef.current);
                timerIntervalRef.current = null;
            }
        };
    }, [isTimerActive, selectedTimerDuration, roundStartTime, playersWhoSubmitted, player?.playerId, onTimerExpire, players, isReader]);

    // Reset timer when round changes
    useEffect(() => {
        if (!currentRound) {
            setIsTimerActive(false);
            setTimeRemaining(null);
            if (timerIntervalRef.current) {
                clearInterval(timerIntervalRef.current);
                timerIntervalRef.current = null;
            }
        }
    }, [currentRound?.roundId]);

    const kickPlayer = async (playerId: number) => {
        if (!game?.joinCode || !isReader) return;
        await signalRService.kickPlayer(game.joinCode, playerId);
    };

    const toggleJudgingMode = async (enabled: boolean) => {
        if (!game?.joinCode || !isReader) return;
        console.log('ToggleJudgingMode called with enabled:', enabled, 'for game:', game.joinCode);
        await signalRService.toggleJudgingMode(game.joinCode, enabled);
        setJudgingModeEnabled(enabled);
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
        lastSyncedTimerRef.current = null;
        submissionInProgressRef.current = false;
        autoSubmissionAttemptedRef.current = false;
        if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = null;
        }
        removeCookie('currentGame');
        removeCookie('currentPlayer');
        removeCookie('currentRound');
        removeCookie('playersWhoSubmitted');
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
            selectedTimerDuration,
            timeRemaining,
            roundStartTime,
            isTimerActive,
            judgingModeEnabled,
            setSelectedTimerDuration,
            setTimeRemaining,
            setRoundStartTime,
            setIsTimerActive,
            setOnTimerExpire,
            createGame,
            joinGame,
            startNewRound,
            submitAnswer,
            kickPlayer,
            toggleJudgingMode,
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