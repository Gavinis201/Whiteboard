import React, { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Game, Player, Answer, getGame, joinGame as joinGameApi, createGame as createGameApi } from '../services/api';
import { Round } from '../types/game';
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
    judgingModeEnabled: boolean; // This now returns game?.judgingModeEnabled
    roundsWithVotingEnabled: Set<number>;
    setSelectedTimerDuration: (duration: number | null) => void;
    setTimeRemaining: (time: number | null) => void;
    setRoundStartTime: (time: Date | null) => void;
    setIsTimerActive: (active: boolean) => void;
    setOnTimerExpire: (callback: (() => void) | null) => void;
    createGame: (playerName: string) => Promise<void>;
    joinGame: (joinCode: string, playerName: string) => Promise<void>;
    startNewRound: (prompt: string, timerDuration?: number, votingMode?: boolean) => Promise<void>;
    submitAnswer: (answer: string) => Promise<void>;
    kickPlayer: (playerId: number) => Promise<void>;
    toggleJudgingMode: (enabled: boolean) => Promise<void>;
    leaveGame: () => Promise<void>;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

export const GameProvider = ({ children }: { children: ReactNode }) => {
    const navigate = useNavigate();
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
    // Removed local judgingModeEnabled state - only using game?.judgingModeEnabled from backend
    const [onTimerExpire, setOnTimerExpire] = useState<(() => void) | null>(null);
    const [previousRoundId, setPreviousRoundId] = useState<number | null>(null);
    const [roundsWithVotingEnabled, setRoundsWithVotingEnabled] = useState<Set<number>>(new Set());
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
    
    // ✅ NEW: Filter answers to only show current round drawings
    // Always show only the current round drawings, regardless of voting mode
    const filteredAnswers = answers.filter(answer => answer.roundId === currentRound?.roundId);

    // ✅ ENHANCED: Comprehensive reconnection system for all scenarios
    useEffect(() => {
        const handleVisibilityChange = () => {
            const isVisible = !document.hidden;
            pageVisibilityRef.current = isVisible;
            console.log('🔄 Page visibility changed:', isVisible);
            
            if (isVisible) {
                console.log('⚡ Page became visible, INSTANT reconnection...');
                
                // ✅ INSTANT: Always attempt reconnection when page becomes visible
                const performReconnection = async () => {
                    try {
                        // Check if we have valid game state
                        if (!game?.joinCode || !player?.name) {
                            console.log('⚡ No valid game state for reconnection');
                            return;
                        }

                        console.log('⚡ INSTANT: Attempting reconnection for game:', game.joinCode, 'player:', player.name);
                        
                        // Always try to reconnect regardless of current state
                        try {
                            await signalRService.forceReconnect();
                            await signalRService.joinGame(game.joinCode, player.name);
                            console.log('⚡ INSTANT reconnection successful');
                            
                            // ✅ CRITICAL: Wait for GameStateSynced to ensure player is properly identified
                            console.log('⚡ Waiting for game state sync to complete...');
                            await new Promise(resolve => setTimeout(resolve, 1000)); // Give time for GameStateSynced event
                            
                        } catch (reconnectError) {
                            console.error('⚡ INSTANT reconnection failed, trying normal:', reconnectError);
                            // Fallback to normal reconnection
                            await signalRService.joinGame(game.joinCode, player.name);
                            
                            // ✅ CRITICAL: Wait for GameStateSynced after fallback too
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        }
                        
                        // ✅ INSTANT: Handle timer state for reconnecting players
                        if (isTimerActive && timeRemaining !== null && timeRemaining <= 0 && !autoSubmissionAttemptedRef.current) {
                            console.log('⚡ Timer expired while away, instant auto-submission');
                            if (onTimerExpire) {
                                autoSubmissionAttemptedRef.current = true;
                                onTimerExpire();
                            }
                        }
                        
                    } catch (error) {
                        console.error('⚡ INSTANT reconnection failed:', error);
                        // ✅ INSTANT: No user interruption, silent fail
                    }
                };
                
                // ✅ INSTANT: Immediate reconnection with no delay
                performReconnection();
                
            } else {
                console.log('🔄 Page went to background, saving comprehensive state');
                
                // ✅ ENHANCED: Save comprehensive state when going to background
                if (game && player) {
                    try {
                        setCookie('currentGame', JSON.stringify(game));
                        setCookie('currentPlayer', JSON.stringify(player));
                        
                        if (currentRound) {
                            setCookie('currentRound', JSON.stringify(currentRound));
                        }
                        
                        // Save timer state
                        if (isTimerActive && timeRemaining !== null) {
                            setCookie('timerState', JSON.stringify({
                                isActive: isTimerActive,
                                timeRemaining,
                                startTime: roundStartTime?.toISOString(),
                                duration: selectedTimerDuration
                            }));
                        }
                        
                        console.log('🔄 State saved successfully for background');
                    } catch (error) {
                        console.error('🔄 Error saving state:', error);
                    }
                }
            }
        };

        // ✅ ULTRA-FAST: Handle network connectivity changes
        const handleOnline = () => {
            console.log('⚡ Network came online, instant reconnection...');
            if (game?.joinCode && player?.name) {
                // Instant reconnection with no delay
                if (!signalRService.isConnected()) {
                    console.log('⚡ Instant reconnection after network recovery');
                    signalRService.joinGame(game.joinCode, player.name).catch(err => {
                        console.error('⚡ Failed to reconnect after network recovery:', err);
                    });
                }
            }
        };

        const handleOffline = () => {
            console.log('⚡ Network went offline');
        };

        // ✅ ULTRA-FAST: Handle beforeunload event for clean disconnection
        const handleBeforeUnload = () => {
            console.log('⚡ Page unloading, instant clean disconnection');
            if (game?.joinCode && signalRService.isConnected()) {
                // Note: We can't await this in beforeunload, but we can try to send it
                signalRService.leaveGame(game.joinCode).catch(() => {
                    // Ignore errors during page unload
                });
            }
        };

        // ✅ INSTANT: Add focus event for instant reconnection
        const handleFocus = () => {
            console.log('⚡ Window focused, INSTANT reconnection...');
            if (game?.joinCode && player?.name) {
                console.log('⚡ INSTANT reconnection on focus');
                signalRService.forceReconnect().then(() => {
                    return signalRService.joinGame(game.joinCode, player.name);
                }).catch(err => {
                    console.error('⚡ Failed to reconnect on focus:', err);
                });
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        window.addEventListener('beforeunload', handleBeforeUnload);
        // ✅ INSTANT: Add periodic connection check
        const connectionCheckInterval = setInterval(() => {
            if (game?.joinCode && player?.name && !signalRService.isConnected()) {
                console.log('⚡ Periodic check: Connection lost, INSTANT reconnection...');
                signalRService.forceReconnect().then(() => {
                    return signalRService.joinGame(game.joinCode, player.name);
                }).catch(err => {
                    console.error('⚡ Periodic reconnection failed:', err);
                });
            }
        }, 5000); // Check every 5 seconds

        window.addEventListener('focus', handleFocus);
        
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            window.removeEventListener('beforeunload', handleBeforeUnload);
            window.removeEventListener('focus', handleFocus);
            clearInterval(connectionCheckInterval);
        };
    }, [isTimerActive, timeRemaining, onTimerExpire, game?.joinCode, player?.name, currentRound, playersWhoSubmitted, roundStartTime, selectedTimerDuration]);

    useEffect(() => {
        const initializeApp = async () => {
            setLoadingMessage('Loading saved game state...');
            const savedGame = getCookie('currentGame');
            const savedPlayer = getCookie('currentPlayer');
            const savedRound = getCookie('currentRound');
            const savedPlayersWhoSubmitted = getCookie('playersWhoSubmitted');
            const savedTimerState = getCookie('timerState');
            
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
                    console.log('🔄 Restoring game state from cookies:', parsedGame.joinCode, parsedPlayer.name);
                    setGame(convertToExtendedGame(parsedGame));
                    setPlayer(parsedPlayer);
                    setIsReader(parsedPlayer.isReader);
                    
                    // ✅ ENHANCED: Restore comprehensive state
                    if (savedRound) {
                        try {
                            const parsedRound = JSON.parse(savedRound);
                            console.log('🔄 Restoring round state from cookies');
                            setCurrentRound(parsedRound);
                            
                            // ✅ FIX: Initialize previousRoundId from saved round
                            setPreviousRoundId(parsedRound.roundId);
                            previousRoundIdRef.current = parsedRound.roundId;
                            console.log('🔄 Initialized previousRoundId from saved round:', parsedRound.roundId);
                        } catch (error) {
                            console.error('🔄 Error parsing saved round state:', error);
                        }
                    }
                    
                    // ✅ FIX: Don't restore playersWhoSubmitted from cookies - let backend sync handle it
                    // This prevents stale submission state when reconnecting to a new round
                    console.log('🔄 Skipping restoration of playersWhoSubmitted from cookies - will be synced from backend');
                    
                    // ✅ NEW: Restore timer state if available
                    if (savedTimerState) {
                        try {
                            const parsedTimerState = JSON.parse(savedTimerState);
                            console.log('🔄 Restoring timer state from cookies:', parsedTimerState);
                            
                            if (parsedTimerState.isActive && parsedTimerState.timeRemaining > 0) {
                                setSelectedTimerDuration(parsedTimerState.duration);
                                setTimeRemaining(parsedTimerState.timeRemaining);
                                setIsTimerActive(true);
                                
                                if (parsedTimerState.startTime) {
                                    setRoundStartTime(new Date(parsedTimerState.startTime));
                                }
                                
                                console.log('🔄 Timer state restored successfully');
                            }
                        } catch (error) {
                            console.error('🔄 Error parsing saved timer state:', error);
                        }
                    }
                    
                    console.log('🔄 Game state restored successfully');
                } catch (error) {
                    console.error('🔄 Error parsing saved game state:', error);
                    removeCookie('currentGame');
                    removeCookie('currentPlayer');
                    removeCookie('currentRound');
                    removeCookie('playersWhoSubmitted');
                    removeCookie('timerState');
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
            console.log('⚡ Auto-reconnection skipped - currently joining a game');
            return;
        }
        
        if (savedGame && savedPlayer && game?.joinCode && player?.name) {
            const parsedSavedGame = JSON.parse(savedGame);
            const parsedSavedPlayer = JSON.parse(savedPlayer);
            
            console.log('⚡ Checking auto-reconnection:');
            console.log('⚡ Saved game join code:', parsedSavedGame.joinCode);
            console.log('⚡ Current game join code:', game.joinCode);
            console.log('⚡ Saved player name:', parsedSavedPlayer.name);
            console.log('⚡ Current player name:', player.name);
            
            // ✅ INSTANT: Always attempt reconnection if we have valid game state
            if (parsedSavedGame.joinCode === game.joinCode && 
                parsedSavedPlayer.name === player.name) {
                const connectAndJoin = async () => {
                    try {
                        console.log('⚡ INSTANT auto-reconnecting to restored game:', game.joinCode, 'as player:', player.name);
                        await signalRService.forceReconnect();
                        await signalRService.joinGame(game.joinCode, player.name);
                        console.log('⚡ INSTANT auto-reconnection successful');
                    } catch (error) {
                        console.error('⚡ INSTANT auto-reconnection failed:', error);
                        // Don't clear state on failure, just log it
                    }
                };
                connectAndJoin();
            } else {
                console.log('⚡ Auto-reconnection skipped - player details do not match');
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
            
            // ✅ ENHANCED: Check if this is a reconnection scenario
            const isReconnecting = currentRound?.roundId && payload.activeRound?.roundId && 
                                 currentRound.roundId !== payload.activeRound.roundId;
            
            if (isReconnecting) {
                console.log("🔄 RECONNECTION DETECTED: Player returning to browser during active round");
                console.log("🔄 Previous round ID:", currentRound.roundId);
                console.log("🔄 Current active round ID:", payload.activeRound?.roundId);
                console.log("🔄 Player will be synced to current game state");
            }
            
            setGame(prevGame => ({ 
                ...(prevGame as ExtendedGame), 
                players: payload.players,
                judgingModeEnabled: payload.judgingModeEnabled
            }));
            
            if (payload.activeRound) {
                const isNewRound = currentRound?.roundId !== payload.activeRound.roundId;
                console.log("Is new round:", isNewRound);
                
                // ✅ ENHANCED: Update round state with voting mode information
                setCurrentRound({
                    prompt: payload.activeRound!.prompt,
                    isCompleted: payload.activeRound!.isCompleted,
                    roundId: payload.activeRound!.roundId,
                    gameId: payload.activeRound!.gameId,
                    timerDurationMinutes: payload.activeRound!.timerDurationMinutes,
                    votingEnabled: (payload.activeRound! as any).votingEnabled
                });
                
                // Reset auto-submission flag for new rounds
                if (isNewRound) {
                    autoSubmissionAttemptedRef.current = false;
                    // Reset submission flag for new rounds
                    submissionInProgressRef.current = false;
                }
                
                // ✅ ENHANCED: Improved timer sync logic for reconnecting players
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
                    
                    // ✅ NEW: Show notification for reconnecting players with active timer
                    if (isReconnecting) {
                        console.log("🔄 Player reconnected with active timer - remaining time:", payload.timerInfo.remainingSeconds, "seconds");
                        // You could add a toast notification here if desired
                    }
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
                
                // ✅ ENHANCED: Handle answers and submission state for reconnecting players
                if (isNewRound) {
                    // For new rounds, always start with empty state regardless of backend data
                    console.log("New round detected, clearing answers and submission state");
                    
                    // ✅ FIX: Set previousRoundId when detecting a new round from GameStateSynced
                    if (currentRound?.roundId && currentRound.roundId !== payload.activeRound.roundId) {
                        console.log("🎯 Setting previousRoundId from GameStateSynced:", currentRound.roundId);
                        console.log("🎯 New round ID from GameStateSynced:", payload.activeRound.roundId);
                        setPreviousRoundId(currentRound.roundId);
                    }
                    
                    setAnswers([]);
                    setPlayersWhoSubmitted(new Set());
                } else {
                    // For existing rounds, use backend data but filter by current round
                    const currentRoundAnswers = payload.currentAnswers?.filter(a => a.roundId === payload.activeRound?.roundId) || [];
                    console.log("Existing round, using filtered answers:", currentRoundAnswers);
                    setAnswers(currentRoundAnswers);
                    setPlayersWhoSubmitted(new Set(currentRoundAnswers.map(a => a.playerId)));
                    
                    // ✅ NEW: Check if player has already submitted for reconnecting players
                    if (isReconnecting && player) {
                        const hasSubmitted = currentRoundAnswers.some(a => a.playerId === player.playerId);
                        if (hasSubmitted) {
                            console.log("🔄 Player has already submitted for this round");
                        } else {
                            console.log("🔄 Player has not submitted yet for this round");
                        }
                    }
                }
                
                // ✅ ENHANCED: Ensure prompt is visible for reconnecting players
                if (payload.activeRound?.prompt && !isNewRound) {
                    console.log("Reconnecting to active round, ensuring prompt visibility:", payload.activeRound.prompt);
                    console.log("Current round prompt after sync:", payload.activeRound.prompt);
                    console.log("Current round state after sync:", {
                        roundId: payload.activeRound.roundId,
                        prompt: payload.activeRound.prompt,
                        timerDurationMinutes: payload.activeRound.timerDurationMinutes,
                        isCompleted: payload.activeRound.isCompleted,
                        votingEnabled: (payload.activeRound as any).votingEnabled
                    });
                }
                
                // ✅ NEW: Update voting mode tracking for reconnecting players
                if ((payload.activeRound as any)?.votingEnabled) {
                    setRoundsWithVotingEnabled(prev => new Set([...prev, payload.activeRound!.roundId]));
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
            
            // ✅ FIX: Add delay before showing "host left" message to allow for reconnection
            // Only show alert if user is in this specific game and host left
            const currentGameInfo = signalRService.getCurrentGameInfo();
            if (updatedPlayers.length === 0 && player && !isReader && 
                currentGameInfo.joinCode && game?.joinCode === currentGameInfo.joinCode) {
                
                console.log('⚠️ Empty player list received - host may have disconnected');
                console.log('⏳ Waiting 5 seconds before showing "host left" message to allow for reconnection...');
                
                // ✅ FIX: Add delay to allow host to reconnect during page refresh
                setTimeout(() => {
                    // Check if we still have an empty player list after the delay
                    if (game?.players.length === 0) {
                        console.log('⏰ 5 seconds elapsed, host did not reconnect - redirecting to join page');
                        
                        // Clear all game state
                        setGame(null);
                        setPlayer(null);
                        setCurrentRound(null);
                        setAnswers([]);
                        setPlayersWhoSubmitted(new Set());
                        handlersSetupRef.current = false;
                        removeCookie('currentGame');
                        removeCookie('currentPlayer');
                        removeCookie('currentRound');
                        removeCookie('playersWhoSubmitted');
                        
                        // Redirect to join page
                        console.log('Redirecting to join page because host left');
                        navigate('/join');
                    } else {
                        console.log('✅ Host reconnected within 5 seconds, not redirecting');
                    }
                }, 5000); // Wait 5 seconds before showing the message
            }
        });

        signalRService.onRoundStarted((prompt, roundId, timerDurationMinutes, votingEnabled) => {
            console.log("🎯 ROUND STARTED EVENT RECEIVED!");
            console.log("Round started with prompt:", prompt, "roundId:", roundId, "timer:", timerDurationMinutes, "votingEnabled:", votingEnabled);
            console.log("Previous round ID:", currentRound?.roundId, "New round ID:", roundId);
            
            // ✅ FIX: Set previousRoundId FIRST before overwriting currentRound
            if (currentRound?.roundId) {
                setPreviousRoundId(currentRound.roundId);
            }
            
            // Reset auto-submission flag for new rounds
            autoSubmissionAttemptedRef.current = false;
            
            // ✅ FIX: Reset navigation state for new rounds
            console.log("🎯 Resetting hasNavigatedToJudgingRef for new round");
            console.log("🎯 Previous hasNavigatedToJudgingRef value:", hasNavigatedToJudgingRef.current);
            hasNavigatedToJudgingRef.current = false;
            console.log("🎯 New hasNavigatedToJudgingRef value:", hasNavigatedToJudgingRef.current);
            
            // Store the previous round ID before updating to the new one
            const oldRoundId = previousRoundIdRef.current;
            previousRoundIdRef.current = roundId;
            
            // ✅ OPTIMIZED: Immediate state updates for faster round transitions
            setCurrentRound({ 
                prompt, 
                isCompleted: false, 
                roundId: roundId,
                gameId: game?.gameId || 0,
                timerDurationMinutes: timerDurationMinutes,
                votingEnabled: votingEnabled
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
            
            // ✅ FIX: Use the voting mode from the round itself
            console.log("🎯 Checking voting mode for round", roundId, ":", votingEnabled);
            
            if (votingEnabled) {
                console.log("🎯 Voting mode is enabled for this round, adding round", roundId, "to voting-enabled rounds");
                setRoundsWithVotingEnabled(prev => new Set([...prev, roundId]));
            } else {
                console.log("🎯 Voting mode is disabled for this round, round", roundId, "will not have voting enabled");
            }
            
            console.log("🎯 Round started - voting mode for this round:", votingEnabled);
        });

        signalRService.onAnswerReceived((playerId, playerName, answer, answerId, roundNumber) => {
            const numericPlayerId = parseInt(playerId, 10);
            // Only process answers for the current round
            if (roundNumber === currentRound?.roundId) {
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
            } else {
                console.log(`Ignoring answer for round ${roundNumber} (current round is ${currentRound?.roundId})`);
            }
        });

        signalRService.onPlayerKicked((kickedPlayerId, kickedPlayerName) => {
            const numericKickedPlayerId = parseInt(kickedPlayerId, 10);
            if (player && player.playerId === numericKickedPlayerId) {
                console.log('You have been kicked from the game');
                
                // Clear all game state
                setGame(null);
                setPlayer(null);
                setCurrentRound(null);
                setAnswers([]);
                setPlayersWhoSubmitted(new Set());
                handlersSetupRef.current = false;
                removeCookie('currentGame');
                removeCookie('currentPlayer');
                removeCookie('currentRound');
                removeCookie('playersWhoSubmitted');
                
                // Redirect to join page
                console.log('Redirecting kicked player to join page');
                navigate('/join');
            }
        });

        signalRService.onJudgingModeToggled((enabled: boolean) => {
            console.log('🎯 Backend judging mode toggled event received:', enabled);
            console.log('🎯 Current game.judgingModeEnabled before update:', game?.judgingModeEnabled);
            console.log('🎯 Player receiving event:', player?.name, 'isReader:', player?.isReader);
            
            // ✅ FIX: Update the game state to keep it in sync with backend
            setGame(prevGame => {
                const updatedGame = { 
                    ...(prevGame as ExtendedGame), 
                    judgingModeEnabled: enabled || false
                };
                console.log('🎯 Updated game state from backend - new judgingModeEnabled:', updatedGame.judgingModeEnabled);
                return updatedGame;
            });
            
            console.log('✅ Updated game state from backend - game.judgingModeEnabled:', enabled || false);
            console.log('✅ All players will now see the updated voting mode state');
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
            // Also save the round state (but not submission state)
            if (currentRound) {
                setCookie('currentRound', JSON.stringify(currentRound));
            }
        } else {
            removeCookie('currentGame');
            removeCookie('currentPlayer');
            removeCookie('currentRound');
        }
    }, [game, player, isInitialized, currentRound]);

    // Auto-navigate to judging when everyone has submitted (only if judging mode is enabled)
    useEffect(() => {
        console.log('🔄 Auto-navigate to judging effect triggered');
        console.log('  - isInitialized:', isInitialized, 'game:', !!game, 'player:', !!player, 'currentRound:', !!currentRound);
                    console.log('  - answers.length:', answers.length, 'judgingModeEnabled:', game?.judgingModeEnabled);
            console.log('  - game?.judgingModeEnabled:', game?.judgingModeEnabled);
        console.log('  - playersWhoSubmitted:', Array.from(playersWhoSubmitted));
        console.log('  - hasNavigatedToJudgingRef.current:', hasNavigatedToJudgingRef.current);
        
        if (!isInitialized || !game || !player || !currentRound) {
            console.log('❌ Auto-navigate to judging early return - missing required data');
            return;
        }

        // Only auto-navigate for non-reader players (joined players, not the host)
        if (player.isReader) {
            console.log('❌ Auto-navigate to judging early return - player is reader');
            return; // Host stays on the game page
        }

        console.log('🔍 Auto-navigate debugging:');
        console.log('  - player.isReader:', player.isReader);
        console.log('  - currentRound:', currentRound);
        console.log('  - answers.length:', answers.length);
        console.log('  - playersWhoSubmitted:', Array.from(playersWhoSubmitted));
        console.log('  - players:', players.map(p => ({ name: p.name, isReader: p.isReader, playerId: p.playerId })));
                    console.log('  - judgingModeEnabled:', game?.judgingModeEnabled);
            console.log('  - game?.judgingModeEnabled:', game?.judgingModeEnabled);
        console.log('  - hasNavigatedToJudgingRef.current:', hasNavigatedToJudgingRef.current);

        // Check if we're already on the judging page
        const isOnJudgingPage = window.location.pathname === '/judging';
        if (isOnJudgingPage) {
            console.log('❌ Auto-navigate to judging early return - already on judging page');
            return; // Already on judging page, don't navigate
        }

        // ✅ FIX: Don't navigate to judging if we're in a new round (no answers yet)
        // This prevents the rapid back-and-forth when a new round starts
        if (answers.length === 0) {
            console.log('❌ Auto-navigate to judging early return - no answers yet (likely new round)');
            return;
        }

        // Only check for non-reader players
        const nonReaderPlayers = players.filter(p => !p.isReader);
        const allNonReadersSubmitted = nonReaderPlayers.length > 0 && 
            nonReaderPlayers.every(p => playersWhoSubmitted.has(p.playerId));

        console.log('  - nonReaderPlayers:', nonReaderPlayers.map(p => p.name));
        console.log('  - allNonReadersSubmitted:', allNonReadersSubmitted);

        if (allNonReadersSubmitted && !hasNavigatedToJudgingRef.current) {
            // ✅ FIX: Check if this specific round should have voting enabled
            const shouldVoteForThisRound = currentRound && roundsWithVotingEnabled.has(currentRound.roundId);
            console.log('🔍 Voting check for round:', currentRound?.roundId);
            console.log('  - roundsWithVotingEnabled:', Array.from(roundsWithVotingEnabled));
            console.log('  - shouldVoteForThisRound:', shouldVoteForThisRound);
            
            if (shouldVoteForThisRound) {
                console.log('✅ All players have submitted and this round has voting enabled, navigating to judging page');
                console.log('  - roundId:', currentRound.roundId);
                hasNavigatedToJudgingRef.current = true;
                
                // ✅ OPTIMIZED: Use React Router navigation instead of window.location.href
                console.log('🎯 Navigating to /judging using React Router');
                navigate('/judging');
            } else {
                console.log('❌ All players have submitted but this round does not have voting enabled, staying on game page');
                console.log('  - roundId:', currentRound?.roundId);
                console.log('  - voting enabled for this round:', shouldVoteForThisRound);
            }
        } else {
            console.log('❌ Auto-navigate to judging conditions not met:');
            console.log('  - allNonReadersSubmitted:', allNonReadersSubmitted);
            console.log('  - !hasNavigatedToJudgingRef.current:', !hasNavigatedToJudgingRef.current);
        }
    }, [isInitialized, game, player, currentRound, playersWhoSubmitted, roundsWithVotingEnabled, answers.length, navigate]);

    // Reset navigation flag when a new round starts
    useEffect(() => {
        if (currentRound) {
            console.log("🔄 Resetting hasNavigatedToJudgingRef due to currentRound change:", currentRound.roundId);
            console.log("🔄 Previous hasNavigatedToJudgingRef value:", hasNavigatedToJudgingRef.current);
            hasNavigatedToJudgingRef.current = false;
            console.log("🔄 New hasNavigatedToJudgingRef value:", hasNavigatedToJudgingRef.current);
            // Initialize previous round ID if not set
            if (previousRoundIdRef.current === null) {
                previousRoundIdRef.current = currentRound.roundId;
            }
        }
    }, [currentRound?.roundId]);

    // Auto-redirect players back to game page when a new round starts
    useEffect(() => {
        console.log('🔄 Auto-redirect effect triggered');
        console.log('isInitialized:', isInitialized, 'game:', !!game, 'player:', !!player, 'currentRound:', !!currentRound);
        console.log('currentRound?.roundId:', currentRound?.roundId, 'previousRoundId:', previousRoundId);
        console.log('📍 Current page:', window.location.pathname);
        
        if (!isInitialized || !game || !player || !currentRound) {
            console.log('❌ Auto-redirect effect early return - missing required data');
            return;
        }

        // Only redirect non-reader players (joined players, not the host)
        if (player.isReader) {
            console.log('❌ Auto-redirect effect early return - player is reader');
            return; // Host stays on the game page
        }

        // Check if we're currently on the judging page and a new round has started
        const isOnJudgingPage = window.location.pathname === '/judging';
        console.log('📍 isOnJudgingPage:', isOnJudgingPage);
        
        // ✅ FIX: Use the state variable to properly detect round changes
        // Only redirect if we're on judging page and there's a new round (not just navigating to judging)
        // Also check that we're in the same game to avoid cross-game conflicts
        if (isOnJudgingPage && previousRoundId !== null && currentRound.roundId !== previousRoundId && 
            previousRoundIdRef.current && previousRoundIdRef.current === previousRoundId) {
            console.log('✅ New round started, redirecting player back to game page');
            console.log('Current round ID:', currentRound.roundId, 'Previous round ID:', previousRoundId);
            console.log('Previous round ID ref:', previousRoundIdRef.current);
            
            // ✅ OPTIMIZED: Use React Router navigation instead of window.location.href
            console.log('🎯 Navigating to /game using React Router');
            navigate('/game');
        } else if (isOnJudgingPage && answers.length === 0 && !hasNavigatedToJudgingRef.current) {
            // Only redirect if there are no answers AND we haven't just navigated to judging
            // This prevents the conflict between auto-navigate and auto-redirect
            console.log('✅ No answers for current round and not just navigated to judging, redirecting player back to game page');
            console.log('Answers length:', answers.length, 'hasNavigatedToJudgingRef:', hasNavigatedToJudgingRef.current);
            
            // ✅ OPTIMIZED: Use React Router navigation instead of window.location.href
            console.log('🎯 Navigating to /game using React Router');
            navigate('/game');
        } else if (isOnJudgingPage && currentRound && !roundsWithVotingEnabled.has(currentRound.roundId)) {
            // Redirect players back to game page if this round doesn't have voting enabled
            console.log('✅ This round does not have voting enabled, redirecting player back to game page');
            console.log('Round ID:', currentRound.roundId, 'Voting enabled for this round:', roundsWithVotingEnabled.has(currentRound.roundId));
            
            // ✅ OPTIMIZED: Use React Router navigation instead of window.location.href
            console.log('🎯 Navigating to /game using React Router');
            navigate('/game');
        } else {
            console.log('❌ Auto-redirect conditions not met:');
            console.log('  - isOnJudgingPage:', isOnJudgingPage);
            console.log('  - previousRoundId !== null:', previousRoundId !== null);
            console.log('  - currentRound.roundId !== previousRoundId:', currentRound.roundId !== previousRoundId);
            console.log('  - previousRoundIdRef.current === previousRoundId:', previousRoundIdRef.current === previousRoundId);
            console.log('  - answers.length === 0:', answers.length === 0);
            console.log('  - judgingModeEnabled:', game?.judgingModeEnabled);
            console.log('  - !hasNavigatedToJudgingRef.current:', !hasNavigatedToJudgingRef.current);
        }
    }, [isInitialized, game, player, currentRound?.roundId, previousRoundId, answers.length, roundsWithVotingEnabled, navigate, hasNavigatedToJudgingRef.current]);

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
            setRoundsWithVotingEnabled(new Set());
            setIsReader(false);
            setPreviousRoundId(null);
            previousRoundIdRef.current = null;
            
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
            // Removed setJudgingModeEnabled - only using backend state
            
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
            setRoundsWithVotingEnabled(new Set());
            setIsReader(false);
            setPreviousRoundId(null);
            previousRoundIdRef.current = null;
            
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
            // Removed setJudgingModeEnabled - only using backend state
            
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

    const startNewRound = async (prompt: string, timerDuration?: number, votingMode?: boolean) => {
        if (!game?.joinCode || !isReader) return;
        
        // Reset timer state for host
        setSelectedTimerDuration(timerDuration || null);
        setRoundStartTime(new Date());
        setIsTimerActive(!!timerDuration);
        lastSyncedTimerRef.current = null;
        
        await signalRService.startRound(game.joinCode, prompt, timerDuration, votingMode);
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
            // ✅ ENHANCED: Ensure connection and player identification before submitting
            if (!signalRService.isConnected()) {
                console.log('⚡ SignalR not connected, attempting to reconnect before submission');
                await signalRService.forceReconnect();
                await signalRService.joinGame(game.joinCode, player.name);
                
                // Wait for GameStateSynced to ensure player is properly identified
                await new Promise(resolve => setTimeout(resolve, 1500));
            }
            
            // ✅ NEW: Double-check player identification before submitting
            if (!signalRService.isPlayerIdentified()) {
                console.log('⚡ Player not identified, forcing reconnection before submission');
                await signalRService.forceReconnect();
                await signalRService.joinGame(game.joinCode, player.name);
                await new Promise(resolve => setTimeout(resolve, 1500));
            }
            
            await signalRService.sendAnswer(game.joinCode, answer);
            console.log('⚡ Answer submitted successfully');
        } catch (error: any) {
            console.error('⚡ Error submitting answer:', error);
            
            // ✅ ENHANCED: Better retry logic for reconnection scenarios
            if (error.message?.includes('Player not identified') || 
                error.message?.includes('Player not found') || 
                error.message?.includes('No SignalR connection') ||
                error.message?.includes('Failed to submit')) {
                try {
                    console.log('⚡ Connection/identification issue detected, attempting force reconnection and retry');
                    
                    // Force rejoin the game with fresh connection
                    await signalRService.forceReconnect();
                    await signalRService.joinGame(game.joinCode, player.name);
                    
                    // Wait for proper identification
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    
                    // Retry the submission
                    await signalRService.sendAnswer(game.joinCode, answer);
                    console.log('⚡ Answer submitted successfully after force reconnection');
                } catch (retryError) {
                    console.error('⚡ Error retrying answer submission:', retryError);
                    submissionInProgressRef.current = false;
                    throw new Error('Failed to submit drawing. Please try refreshing the page.');
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
        console.log('🔍 toggleJudgingMode called with enabled:', enabled);
        console.log('🔍 game?.joinCode:', game?.joinCode);
        console.log('🔍 isReader:', isReader);
        console.log('🔍 Current game.judgingModeEnabled before toggle:', game?.judgingModeEnabled);
        
        if (!game?.joinCode || !isReader) {
            console.log('❌ Early return - missing game join code or not reader');
            return;
        }
        
        console.log('✅ Proceeding with toggle - game join code:', game.joinCode);
        
        try {
            // Send to backend immediately - don't update frontend state yet
            console.log('🔍 Calling signalRService.toggleJudgingMode...');
            await signalRService.toggleJudgingMode(game.joinCode, enabled);
            console.log('✅ Successfully sent to backend - judgingModeEnabled:', enabled);
            console.log('✅ Frontend will update when backend confirms the change');
        } catch (error) {
            console.error('❌ Error sending to backend:', error);
        }
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
        setRoundsWithVotingEnabled(new Set());
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
            answers: filteredAnswers,
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
            judgingModeEnabled: game?.judgingModeEnabled || false,
            roundsWithVotingEnabled,
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