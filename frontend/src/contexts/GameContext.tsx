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

    // ✅ NEW: Safari detection for debugging
    const isSafari = () => {
        const userAgent = navigator.userAgent;
        return /Safari/.test(userAgent) && !/Chrome/.test(userAgent);
    };

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
                console.log('⚡ Page became visible, checking reconnection...');
                
                // ✅ ENHANCED: Only attempt reconnection if we should
                const performReconnection = async () => {
                    try {
                        // Check if we have valid game state and not intentionally leaving
                        if (!game?.joinCode || !player?.name) {
                            console.log('⚡ No valid game state for reconnection');
                            return;
                        }
                        
                        // ✅ NEW: Check if player is intentionally leaving
                        if (signalRService.isIntentionallyLeaving()) {
                            console.log('⚡ Player is intentionally leaving, skipping reconnection');
                            return;
                        }

                        console.log(`⚡ Attempting reconnection for game: ${game.joinCode}, player: ${player.name}, Safari: ${isSafari()}`);
                        
                        // Check if we need to reconnect
                        if (!signalRService.isConnected()) {
                            console.log('⚡ Connection lost, attempting reconnection...');
                            try {
                                await signalRService.forceReconnect();
                                await signalRService.joinGame(game.joinCode, player.name);
                                console.log(`⚡ Reconnection successful - Safari: ${isSafari()}`);
                                
                                                        // ✅ OPTIMIZED: Balanced wait for game state sync
                        console.log('⚡ Waiting for game state sync to complete...');
                        await new Promise(resolve => setTimeout(resolve, 800)); // Balanced wait time
                                
                            } catch (reconnectError) {
                                console.error('⚡ Reconnection failed:', reconnectError);
                                // ✅ OPTIMIZED: Balanced retry for mobile scenarios
                                try {
                                    console.log('⚡ Retrying reconnection for mobile...');
                                    await new Promise(resolve => setTimeout(resolve, 1000)); // Balanced wait before retry
                                    await signalRService.forceReconnect();
                                    await signalRService.joinGame(game.joinCode, player.name);
                                    console.log('⚡ Retry reconnection successful');
                                } catch (retryError) {
                                    console.error('⚡ Retry reconnection failed:', retryError);
                                    // Don't show user error - silent fail for background reconnection
                                }
                            }
                        } else {
                            console.log('⚡ Connection is already active, no reconnection needed');
                        }
                        
                        // ✅ ENHANCED: Handle timer state for reconnecting players
                        if (isTimerActive && timeRemaining !== null && timeRemaining <= 0 && !autoSubmissionAttemptedRef.current) {
                            console.log('⚡ Timer expired while away, instant auto-submission');
                            if (onTimerExpire) {
                                autoSubmissionAttemptedRef.current = true;
                                onTimerExpire();
                            }
                        }
                        
                    } catch (error) {
                        console.error('⚡ Reconnection failed:', error);
                        // ✅ ENHANCED: No user interruption, silent fail
                    }
                };
                
                // ✅ ENHANCED: Immediate reconnection with no delay
                performReconnection();
                
            } else {
                console.log('🔄 Page went to background, saving comprehensive state');
                
                // ✅ ENHANCED: Save comprehensive state when going to background
                if (game && player) {
                    try {
                        setCookie('currentGame', JSON.stringify(game));
                        setCookie('currentPlayer', JSON.stringify(player));
                        
                        // Don't save round state - let backend sync handle it
                        
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

        // ✅ ENHANCED: Handle network connectivity changes
        const handleOnline = () => {
            console.log(`⚡ Network came online, checking reconnection...`);
            if (game?.joinCode && player?.name && !signalRService.isIntentionallyLeaving()) {
                // Only reconnect if we're not connected
                if (!signalRService.isConnected()) {
                    console.log(`⚡ Network recovered, attempting reconnection`);
                    signalRService.forceReconnect().then(() => {
                        return signalRService.joinGame(game.joinCode, player.name);
                    }).catch(err => {
                        console.error(`⚡ Failed to reconnect after network recovery`, err);
                        // ✅ OPTIMIZED: Balanced retry network reconnection
                        setTimeout(() => {
                            if (game?.joinCode && player?.name && !signalRService.isConnected()) {
                                console.log('⚡ Retrying network reconnection...');
                                signalRService.forceReconnect().then(() => {
                                    return signalRService.joinGame(game.joinCode, player.name);
                                }).catch(retryErr => {
                                    console.error('⚡ Network reconnection retry failed:', retryErr);
                                });
                            }
                        }, 1500);
                    });
                } else {
                    console.log('⚡ Already connected, no reconnection needed');
                }
            } else if (signalRService.isIntentionallyLeaving()) {
                console.log('⚡ Player is intentionally leaving, skipping network reconnection');
            }
        };

        const handleOffline = () => {
            console.log('⚡ Network went offline');
        };

        // ✅ ENHANCED: Handle beforeunload event for clean disconnection
        const handleBeforeUnload = () => {
            console.log('⚡ Page unloading, attempting clean disconnection');
            if (game?.joinCode && signalRService.isConnected() && !signalRService.isIntentionallyLeaving()) {
                // Note: We can't await this in beforeunload, but we can try to send it
                signalRService.leaveGame(game.joinCode).catch(() => {
                    // Ignore errors during page unload
                });
            }
        };

        // ✅ ENHANCED: Add focus event for reconnection
        const handleFocus = () => {
            console.log('⚡ Window focused, checking reconnection...');
            if (game?.joinCode && player?.name && !signalRService.isIntentionallyLeaving()) {
                if (!signalRService.isConnected()) {
                    console.log('⚡ Connection lost, attempting reconnection on focus');
                    signalRService.forceReconnect().then(() => {
                        return signalRService.joinGame(game.joinCode, player.name);
                    }).catch(err => {
                        console.error('⚡ Failed to reconnect on focus:', err);
                    });
                } else {
                    console.log('⚡ Already connected, no reconnection needed on focus');
                }
            }
        };

        // ✅ ENHANCED: Add mobile-specific events for better reconnection
        const handleResume = () => {
            console.log('⚡ App resumed (mobile), checking reconnection...');
            if (game?.joinCode && player?.name && !signalRService.isIntentionallyLeaving()) {
                // Force reconnection on mobile app resume
                setTimeout(() => {
                    if (!signalRService.isConnected()) {
                        console.log('⚡ Mobile app resumed, forcing reconnection...');
                        signalRService.forceReconnect().then(() => {
                            return signalRService.joinGame(game.joinCode, player.name);
                        }).catch(err => {
                            console.error('⚡ Mobile reconnection failed:', err);
                        });
                    }
                }, 500); // Balanced delay to ensure app is fully resumed
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        window.addEventListener('beforeunload', handleBeforeUnload);
        window.addEventListener('focus', handleFocus);
        
        // ✅ ENHANCED: Add mobile-specific event listeners
        if ('onpageshow' in window) {
            window.addEventListener('pageshow', handleResume);
        }
        if ('onresume' in window) {
            (window as any).addEventListener('resume', handleResume);
        }
        
        // ✅ ENHANCED: Periodic connection check with better logic
        const connectionCheckInterval = setInterval(() => {
            if (game?.joinCode && player?.name && !signalRService.isIntentionallyLeaving()) {
                if (!signalRService.isConnected()) {
                    console.log('⚡ Periodic check: Connection lost, attempting reconnection...');
                    signalRService.forceReconnect().then(() => {
                        return signalRService.joinGame(game.joinCode, player.name);
                    }).catch(err => {
                        console.error('⚡ Periodic reconnection failed:', err);
                    });
                }
            }
        }, 8000); // Check every 8 seconds for faster reconnection

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            window.removeEventListener('beforeunload', handleBeforeUnload);
            window.removeEventListener('focus', handleFocus);
            
            // Remove mobile-specific event listeners
            if ('onpageshow' in window) {
                window.removeEventListener('pageshow', handleResume);
            }
            if ('onresume' in window) {
                (window as any).removeEventListener('resume', handleResume);
            }
            
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
                    // ✅ FIX: Don't restore round state from cookies - let backend sync handle it
                    // This prevents stale round state when reconnecting to a new round
                    console.log('🔄 Skipping restoration of round state from cookies - will be synced from backend');
                    
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
        
        // Don't auto-reconnect if we're in the process of joining (this might happen during page refresh)
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
            
            // ✅ ENHANCED: Only attempt reconnection if we have valid game state and should reconnect
            if (parsedSavedGame.joinCode === game.joinCode && 
                parsedSavedPlayer.name === player.name &&
                !signalRService.isIntentionallyLeaving()) {
                
                const connectAndJoin = async () => {
                    try {
                        console.log('⚡ Auto-reconnecting to restored game:', game.joinCode, 'as player:', player.name);
                        
                        // Check if we need to reconnect
                        if (!signalRService.isConnected()) {
                            await signalRService.forceReconnect();
                            await signalRService.joinGame(game.joinCode, player.name);
                            console.log('⚡ Auto-reconnection successful');
                            
                                                    // ✅ OPTIMIZED: Balanced wait for state sync
                        await new Promise(resolve => setTimeout(resolve, 800));
                        } else {
                            console.log('⚡ Already connected, no auto-reconnection needed');
                        }
                    } catch (error) {
                        console.error('⚡ Auto-reconnection failed:', error);
                        // ✅ OPTIMIZED: Balanced retry auto-reconnection
                        try {
                            console.log('⚡ Retrying auto-reconnection...');
                            await new Promise(resolve => setTimeout(resolve, 1000));
                            await signalRService.forceReconnect();
                            await signalRService.joinGame(game.joinCode, player.name);
                            console.log('⚡ Auto-reconnection retry successful');
                        } catch (retryError) {
                            console.error('⚡ Auto-reconnection retry failed:', retryError);
                            // Don't clear state on failure, just log it
                        }
                    }
                };
                connectAndJoin();
            } else {
                console.log('⚡ Auto-reconnection skipped - player details do not match or intentionally leaving');
                // Clear stale cookies if they don't match
                if (parsedSavedGame.joinCode !== game.joinCode || parsedSavedPlayer.name !== player.name) {
                    removeCookie('currentGame');
                    removeCookie('currentPlayer');
                }
            }
        }
    }, [game?.joinCode, player?.name, player?.isReader]);

    useEffect(() => {
        if (!isInitialized || !game?.joinCode || handlersSetupRef.current) return;
        
        handlersSetupRef.current = true;
        console.log('Setting up SignalR handlers for game:', game.joinCode);
        
        signalRService.onGameStateSynced((payload: GameStatePayload) => {
            console.log("📥 GameStateSynced payload received:", payload);
            console.log("Current answers:", payload.currentAnswers);
            console.log("Current round ID:", payload.activeRound?.roundId);
            console.log("Previous round ID:", currentRound?.roundId);
            console.log("Judging mode enabled:", payload.judgingModeEnabled);
            
            // ✅ ENHANCED: Check if this is a reconnection scenario
            const isReconnecting = currentRound?.roundId && payload.activeRound?.roundId && 
                                 currentRound.roundId !== payload.activeRound.roundId;
            
            // ✅ NEW: Check if player was away during round start (no current round but backend has active round)
            const wasAwayDuringRoundStart = !currentRound && payload.activeRound;
            
            if (isReconnecting || wasAwayDuringRoundStart) {
                console.log("🔄 RECONNECTION DETECTED: Player returning to browser during active round");
                console.log("🔄 Reconnection type:", isReconnecting ? "round change" : "away during round start");
                
                // ✅ FIX: Reset navigation flag for reconnecting players to allow auto-navigation
                hasNavigatedToJudgingRef.current = false;
            }
            
            // ✅ SIMPLIFIED: Direct state rehydration from GameStateSynced payload
            setGame(prevGame => {
                if (!prevGame) return null;
                const newGame = {
                    ...prevGame,
                    players: [...payload.players], // clone to guarantee new reference
                    judgingModeEnabled: payload.judgingModeEnabled || false
                };
                console.log('🎯 GameStateSynced - Updated game with players:', newGame.players);
                return newGame;
            });
            
            // ✅ DIRECT: Update current round state
            if (payload.activeRound) {
                const isNewRound = currentRound?.roundId !== payload.activeRound.roundId;
                console.log("Is new round:", isNewRound);
                
                // ✅ DIRECT: Rehydrate round state from payload
                setCurrentRound({
                    prompt: payload.activeRound.prompt,
                    isCompleted: payload.activeRound.isCompleted,
                    roundId: payload.activeRound.roundId,
                    gameId: payload.activeRound.gameId,
                    timerDurationMinutes: payload.activeRound.timerDurationMinutes,
                    votingEnabled: (payload.activeRound as any).votingEnabled
                });
                
                // Reset auto-submission flag for new rounds
                if (isNewRound) {
                    autoSubmissionAttemptedRef.current = false;
                    submissionInProgressRef.current = false;
                }
                
                // ✅ DIRECT: Rehydrate timer state from payload
                if (payload.timerInfo && payload.timerInfo.remainingSeconds > 0) {
                    console.log("Syncing timer from backend:", payload.timerInfo);
                    
                    setSelectedTimerDuration(payload.timerInfo.durationMinutes);
                    setTimeRemaining(payload.timerInfo.remainingSeconds);
                    setIsTimerActive(true);
                    
                    // Calculate the actual start time based on remaining time from backend
                    const startTime = new Date(Date.now() - (payload.timerInfo.durationMinutes * 60 - payload.timerInfo.remainingSeconds) * 1000);
                    setRoundStartTime(startTime);
                    
                    lastSyncedTimerRef.current = {
                        roundId: payload.activeRound.roundId,
                        remainingSeconds: payload.timerInfo.remainingSeconds
                    };
                } else if (payload.timerInfo && payload.timerInfo.remainingSeconds <= 0) {
                    console.log("Timer has already expired, not starting frontend timer");
                    setSelectedTimerDuration(payload.timerInfo.durationMinutes);
                    setTimeRemaining(0);
                    setIsTimerActive(false);
                    setRoundStartTime(null);
                    lastSyncedTimerRef.current = null;
                } else {
                    setSelectedTimerDuration(null);
                    setTimeRemaining(null);
                    setIsTimerActive(false);
                    setRoundStartTime(null);
                    lastSyncedTimerRef.current = null;
                }
                
                // ✅ DIRECT: Rehydrate answers and submission state from payload
                const currentRoundAnswers = payload.currentAnswers?.filter(a => a.roundId === payload.activeRound?.roundId) || [];
                console.log("Setting answers from GameStateSynced:", currentRoundAnswers);
                setAnswers(currentRoundAnswers);
                setPlayersWhoSubmitted(new Set(currentRoundAnswers.map(a => a.playerId)));
                
                // ✅ NEW: Update voting mode tracking
                if ((payload.activeRound as any)?.votingEnabled) {
                    setRoundsWithVotingEnabled(prev => new Set([...prev, payload.activeRound!.roundId]));
                }
                
                // ✅ NEW: Check if player has already submitted
                if (player) {
                    const hasSubmitted = currentRoundAnswers.some(a => a.playerId === player.playerId);
                    if (hasSubmitted) {
                        console.log("🔄 Player has already submitted for this round");
                    } else {
                        console.log("🔄 Player has not submitted yet for this round");
                    }
                }
                
                // ✅ NEW: Handle navigation for reconnecting players
                if (isReconnecting || wasAwayDuringRoundStart) {
                    // Check if this is a voting round and all players have submitted
                    if ((payload.activeRound as any)?.votingEnabled && currentRoundAnswers.length > 0) {
                        setTimeout(() => {
                            const nonReaderPlayers = payload.players.filter((p: Player) => !p.isReader);
                            const submittedPlayerIds = new Set(currentRoundAnswers.map((a: any) => a.playerId));
                            const allNonReadersSubmitted = nonReaderPlayers.length > 0 && 
                                nonReaderPlayers.every((p: Player) => submittedPlayerIds.has(p.playerId));
                            
                            if (allNonReadersSubmitted && !hasNavigatedToJudgingRef.current) {
                                console.log("🔄 Reconnecting player - all players submitted in voting round, navigating to judging");
                                hasNavigatedToJudgingRef.current = true;
                                navigate('/judging');
                            }
                        }, 300); // Give state time to update
                    }
                }
                
                // ✅ FIX: Set previousRoundId when detecting a new round from GameStateSynced
                if (currentRound?.roundId && currentRound.roundId !== payload.activeRound.roundId) {
                    console.log("🎯 Setting previousRoundId from GameStateSynced:", currentRound.roundId);
                    console.log("🎯 New round ID from GameStateSynced:", payload.activeRound.roundId);
                    setPreviousRoundId(currentRound.roundId);
                }
                
            } else {
                setCurrentRound(null);
                setSelectedTimerDuration(null);
                setTimeRemaining(null);
                setIsTimerActive(false);
                setRoundStartTime(null);
                lastSyncedTimerRef.current = null;
                setAnswers([]);
                setPlayersWhoSubmitted(new Set());
            }
        });

        signalRService.onPlayerListUpdated((updatedPlayers: Player[]) => {
            console.log('🎯 PlayerListUpdated event received:', updatedPlayers);
            console.log('🎯 Current game players before update:', game?.players);
            setGame(prevGame => {
                if (!prevGame) return null;
                const newGame = {
                    ...prevGame,
                    players: [...updatedPlayers] // clone to guarantee new reference
                };
                console.log('🎯 New game object created with players:', newGame.players);
                return newGame;
            });
            
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

        signalRService.onAnswerReceived((playerId, playerName, answer, answerId, roundId) => {
            const numericPlayerId = parseInt(playerId, 10);
            // ✅ FIX: Always process answers - the backend now sends the actual RoundId
            console.log("Answer received from player:", playerName, "ID:", numericPlayerId, "AnswerID:", answerId, "RoundId:", roundId);
            console.log("Current round ID:", currentRound?.roundId);
            console.log("Current playersWhoSubmitted before update:", Array.from(playersWhoSubmitted));
            
            setAnswers(prev => [...prev, { 
                answerId: answerId,
                playerId: numericPlayerId,
                playerName,
                content: answer,
                roundId: roundId || currentRound?.roundId || 0
            }]);
            setPlayersWhoSubmitted(prev => {
                const newSet = new Set(prev).add(numericPlayerId);
                console.log("Updated playersWhoSubmitted:", Array.from(newSet));
                return newSet;
            });
        });

        signalRService.onPlayerKicked((kickedPlayerId, kickedPlayerName) => {
            console.log('🎯 PlayerKicked event received in GameContext:', { kickedPlayerId, kickedPlayerName });
            console.log('🎯 Current player:', player);
            
            const numericKickedPlayerId = parseInt(kickedPlayerId, 10);
            if (player && player.playerId === numericKickedPlayerId) {
                console.log('🎯 You have been kicked from the game');
                
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
                console.log('🎯 Redirecting kicked player to join page');
                navigate('/join');
            } else {
                console.log('🎯 PlayerKicked event was for a different player');
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
            // Don't save round state - let backend sync handle it
        } else {
            removeCookie('currentGame');
            removeCookie('currentPlayer');
            removeCookie('currentRound');
        }
    }, [game, player, isInitialized, currentRound]);

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

        // ✅ FIX: Don't navigate to judging if we're in a new round (no answers yet)
        // This prevents the rapid back-and-forth when a new round starts
        if (answers.length === 0) {
            return;
        }

        // Only check for non-reader players
        const nonReaderPlayers = players.filter(p => !p.isReader);
        const allNonReadersSubmitted = nonReaderPlayers.length > 0 && 
            nonReaderPlayers.every(p => playersWhoSubmitted.has(p.playerId));

        if (allNonReadersSubmitted && !hasNavigatedToJudgingRef.current) {
            // ✅ FIX: Check if this specific round should have voting enabled
            const shouldVoteForThisRound = currentRound && roundsWithVotingEnabled.has(currentRound.roundId);
            
            if (shouldVoteForThisRound) {
                console.log('✅ All players submitted and voting enabled, navigating to judging');
                hasNavigatedToJudgingRef.current = true;
                navigate('/judging');
            }
        }
        
        // ✅ NEW: Additional check for reconnecting players who might have missed the initial navigation
        // This handles the case where a player reconnects after being away for >10 seconds
        if (answers.length > 0 && !hasNavigatedToJudgingRef.current) {
            const shouldVoteForThisRound = currentRound && roundsWithVotingEnabled.has(currentRound.roundId);
            const nonReaderPlayers = players.filter(p => !p.isReader);
            const allNonReadersSubmitted = nonReaderPlayers.length > 0 && 
                nonReaderPlayers.every(p => playersWhoSubmitted.has(p.playerId));
            
            if (shouldVoteForThisRound && allNonReadersSubmitted) {
                console.log('✅ Reconnecting player - all players submitted in voting round, navigating to judging');
                hasNavigatedToJudgingRef.current = true;
                navigate('/judging');
            }
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
        if (!isInitialized || !game || !player || !currentRound) {
            return;
        }

        // Only redirect non-reader players (joined players, not the host)
        if (player.isReader) {
            return; // Host stays on the game page
        }

        // Check if we're currently on the judging page and a new round has started
        const isOnJudgingPage = window.location.pathname === '/judging';
        
        // ✅ FIX: Use the state variable to properly detect round changes
        // Only redirect if we're on judging page and there's a new round (not just navigating to judging)
        // Also check that we're in the same game to avoid cross-game conflicts
        if (isOnJudgingPage && previousRoundId !== null && currentRound.roundId !== previousRoundId && 
            previousRoundIdRef.current && previousRoundIdRef.current === previousRoundId) {
            console.log('✅ New round started, redirecting player back to game page');
            navigate('/game');
        } else if (isOnJudgingPage && answers.length === 0 && !hasNavigatedToJudgingRef.current) {
            // Only redirect if there are no answers AND we haven't just navigated to judging
            // This prevents the conflict between auto-navigate and auto-redirect
            console.log('✅ No answers for current round, redirecting player back to game page');
            navigate('/game');
        } else if (isOnJudgingPage && currentRound && !roundsWithVotingEnabled.has(currentRound.roundId)) {
            // Redirect players back to game page if this round doesn't have voting enabled
            console.log('✅ This round does not have voting enabled, redirecting player back to game page');
            navigate('/game');
        }
    }, [isInitialized, game, player, currentRound?.roundId, previousRoundId, answers.length, roundsWithVotingEnabled, navigate, hasNavigatedToJudgingRef.current]);

    // ✅ NEW: Trigger navigation immediately after answer submission
    useEffect(() => {
        if (!isInitialized || !game || !player || !currentRound || player.isReader) {
            return;
        }

        // Check if this player just submitted their answer
        const playerJustSubmitted = playersWhoSubmitted.has(player.playerId);
        
        if (playerJustSubmitted) {
            // Check if all non-reader players have submitted
            const nonReaderPlayers = players.filter(p => !p.isReader);
            const allNonReadersSubmitted = nonReaderPlayers.length > 0 && 
                nonReaderPlayers.every(p => playersWhoSubmitted.has(p.playerId));
            
            // Check if this round has voting enabled
            const shouldVoteForThisRound = roundsWithVotingEnabled.has(currentRound.roundId);
            
            // If all players have submitted and voting is enabled, navigate immediately
            if (allNonReadersSubmitted && shouldVoteForThisRound && !hasNavigatedToJudgingRef.current) {
                console.log('🎯 All players submitted and voting enabled, navigating to judging immediately');
                hasNavigatedToJudgingRef.current = true;
                navigate('/judging');
            }
        }
    }, [playersWhoSubmitted, isInitialized, game, player, currentRound, roundsWithVotingEnabled, players, navigate]);

    // ✅ NEW: Periodic check for reconnecting players who should be on judging page
    useEffect(() => {
        if (!isInitialized || !game || !player || !currentRound || player.isReader) {
            return;
        }

        // Check if we're already on the judging page
        const isOnJudgingPage = window.location.pathname === '/judging';
        if (isOnJudgingPage) {
            return;
        }

        // Check if this is a voting round with answers and all players have submitted
        const shouldVoteForThisRound = roundsWithVotingEnabled.has(currentRound.roundId);
        const hasAnswers = answers.length > 0;
        const nonReaderPlayers = players.filter(p => !p.isReader);
        const allNonReadersSubmitted = nonReaderPlayers.length > 0 && 
            nonReaderPlayers.every(p => playersWhoSubmitted.has(p.playerId));

        // If this is a voting round with answers and all players submitted, navigate to judging
        if (shouldVoteForThisRound && hasAnswers && allNonReadersSubmitted && !hasNavigatedToJudgingRef.current) {
            console.log('🔄 Periodic check - reconnecting player should be on judging page, navigating');
            hasNavigatedToJudgingRef.current = true;
            navigate('/judging');
        }
    }, [isInitialized, game, player, currentRound, answers, playersWhoSubmitted, roundsWithVotingEnabled, players, navigate]);

    const createGame = async (playerName: string) => {
        console.log('🎯 GameContext: Starting createGame...');
        setIsLoading(true);
        setLoadingMessage('Creating game...');
        isJoiningRef.current = true;
        try {
            console.log('🎯 GameContext: Calling leaveGame to clear any existing state...');
            await leaveGame();
            
            // Clear any existing cookies before creating to prevent session conflicts
            console.log('🎯 GameContext: Clearing existing cookies before creating new game');
            removeCookie('currentGame');
            removeCookie('currentPlayer');
            removeCookie('timerState');
            
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
            
            console.log('🎯 GameContext: Create game response - Player data:', playerData);
            console.log('🎯 GameContext: Create game response - Game data:', fullGameData);
            console.log('🎯 GameContext: Player isReader:', playerData.isReader);
            
            setGame(convertToExtendedGame(fullGameData));
            setPlayer(playerData);
            setIsReader(true);
            // Removed setJudgingModeEnabled - only using backend state
            
            console.log('🎯 GameContext: Joining SignalR game...');
            await signalRService.joinGame(gameData.joinCode, playerName);
            
            console.log('🎯 GameContext: Game created successfully, clearing loading state');
            setIsLoading(false);
            setLoadingMessage('');
        } catch (error) {
            console.error('🎯 GameContext: Error creating game:', error);
            setIsLoading(false);
            setLoadingMessage('');
            throw error;
        } finally {
            isJoiningRef.current = false;
        }
    };

    const joinGame = async (joinCode: string, playerName: string) => {
        console.log('🎯 GameContext: Starting joinGame...');
        setIsLoading(true);
        setLoadingMessage('Joining game...');
        isJoiningRef.current = true;
        try {
            console.log('🎯 GameContext: Calling leaveGame to clear any existing state...');
            await leaveGame();
            
            // Clear any existing cookies before joining to prevent session conflicts
            console.log('🎯 GameContext: Clearing existing cookies before joining new game');
            removeCookie('currentGame');
            removeCookie('currentPlayer');
            removeCookie('timerState');
            
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
            
            // ✅ OPTIMIZED: Parallel API calls for faster game joining
            const [playerData, gameData] = await Promise.all([
                joinGameApi(joinCode, playerName),
                getGame(joinCode)
            ]);
            
            console.log('🎯 GameContext: Join game response - Player data:', playerData);
            console.log('🎯 GameContext: Join game response - Game data:', gameData);
            console.log('🎯 GameContext: Player isReader:', playerData.isReader);
            
            // Verify we're not getting host data when we shouldn't be
            if (playerData.isReader) {
                console.warn('🎯 GameContext: WARNING: Joining player received isReader=true. This might indicate a backend issue.');
            }
            
            setGame(convertToExtendedGame(gameData));
            setPlayer(playerData);
            setIsReader(playerData.isReader);
            // Removed setJudgingModeEnabled - only using backend state
            
            console.log('🎯 GameContext: Joining SignalR game...');
            await signalRService.joinGame(joinCode, playerName);
            
            console.log('🎯 GameContext: Game joined successfully, clearing loading state');
            setIsLoading(false);
            setLoadingMessage('');
        } catch (error: any) {
            console.error('🎯 GameContext: Error joining game:', error);
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
            console.error('🎯 GameContext: Cannot submit answer: missing game or player info');
            throw new Error('No longer in game. Please refresh and try again.');
        }
        
        // Prevent double submissions
        if (submissionInProgressRef.current) {
            console.log('🎯 GameContext: Submission already in progress, skipping');
            return;
        }
        
        // Check if already submitted
        if (playersWhoSubmitted.has(player.playerId)) {
            console.log('🎯 GameContext: Player already submitted, skipping');
            return;
        }
        
        submissionInProgressRef.current = true;
        
        try {
            // ✅ OPTIMIZED: Ensure connection and player identification before submitting
            if (!signalRService.isConnected()) {
                console.log('⚡ SignalR not connected, attempting to reconnect before submission');
                await signalRService.forceReconnect();
                await signalRService.joinGame(game.joinCode, player.name);
                
                // Wait for GameStateSynced to ensure player is properly identified
                await new Promise(resolve => setTimeout(resolve, 800)); // Balanced wait time
            }
            
            // ✅ OPTIMIZED: Double-check player identification before submitting
            if (!signalRService.isPlayerIdentified()) {
                console.log('⚡ Player not identified, forcing reconnection before submission');
                await signalRService.forceReconnect();
                await signalRService.joinGame(game.joinCode, player.name);
                await new Promise(resolve => setTimeout(resolve, 800)); // Balanced wait time
            }
            
            // ✅ NEW: Additional check for mobile reconnection scenarios
            // This handles the case where phone was locked during non-voting round
            const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
            if (isMobile && !signalRService.isPlayerIdentified()) {
                console.log('⚡ Mobile device detected, ensuring proper reconnection for submission');
                await signalRService.forceReconnect();
                await signalRService.joinGame(game.joinCode, player.name);
                await new Promise(resolve => setTimeout(resolve, 2500)); // Longer wait for mobile
            }
            
            await signalRService.sendAnswer(game.joinCode, answer);
            console.log('⚡ Answer submitted successfully');
        } catch (error: any) {
            console.error('⚡ Error submitting answer:', error);
            
            // ✅ ENHANCED: Better retry logic for reconnection scenarios
            if (error.message?.includes('Player not identified') || 
                error.message?.includes('Player not found') || 
                error.message?.includes('No SignalR connection') ||
                error.message?.includes('Failed to submit') ||
                error.message?.includes('timeout')) {
                try {
                    console.log('⚡ Connection/identification issue detected, attempting force reconnection and retry');
                    
                    // Force rejoin the game with fresh connection
                    await signalRService.forceReconnect();
                    await signalRService.joinGame(game.joinCode, player.name);
                    
                    // Wait for proper identification
                    await new Promise(resolve => setTimeout(resolve, 2500)); // Increased wait time
                    
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
        console.log('🎯 GameContext: Leaving game...');
        
        if (game?.joinCode) {
            try {
                await signalRService.leaveGame(game.joinCode);
                console.log('🎯 GameContext: Successfully left game via SignalR');
            } catch (error) {
                console.error('🎯 GameContext: Error leaving game via SignalR:', error);
                // Even if SignalR fails, we should still clear local state
            }
        }
         
        // ✅ ENHANCED: Clear all local state regardless of SignalR success
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
        
        // Clear all cookies
        removeCookie('currentGame');
        removeCookie('currentPlayer');
        removeCookie('currentRound');
        removeCookie('playersWhoSubmitted');
        removeCookie('timerState');
        
        console.log('🎯 GameContext: Local state cleared');
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