import { HubConnectionBuilder, HubConnection, LogLevel, HttpTransportType, HubConnectionState } from '@microsoft/signalr';
import { Player, Round, Answer } from './api';

// Type for the full state payload
export interface GameStatePayload {
    players: Player[];
    activeRound: Round | null;
    currentAnswers: Answer[];
    judgingModeEnabled: boolean;
    timerInfo?: {
        startTime: string;
        durationMinutes: number;
        remainingSeconds: number;
    } | null;
}

// ✅ REFACTORED: Simplified connection state management
enum ConnectionState {
    DISCONNECTED = 'disconnected',
    CONNECTING = 'connecting',
    CONNECTED = 'connected',
    RECONNECTING = 'reconnecting',
    LEAVING = 'leaving',           // Intentionally leaving the game
    LEFT = 'left'                   // Successfully left the game
}

class SignalRService {
    private connection: HubConnection | null = null;
    private connectionPromise: Promise<void> | null = null;
    
    // Callbacks
    private gameStateSyncedCallback: ((payload: GameStatePayload) => void) | null = null;
    private playerListUpdatedCallback: ((players: Player[]) => void) | null = null;
    private answerReceivedCallback: ((playerId: string, playerName: string, answer: string, answerId: number, roundNumber?: number) => void) | null = null;
    private roundStartedCallback: ((prompt: string, roundId: number, timerDurationMinutes?: number, votingEnabled?: boolean) => void) | null = null;
    private playerKickedCallback: ((playerId: string, playerName: string) => void) | null = null;
    private judgingModeToggledCallback: ((enabled: boolean) => void) | null = null;
    private voteResultsUpdatedCallback: ((results: any[], maxVotes: number) => void) | null = null;
    
    // ✅ REFACTORED: Cleaner state management
    private connectionState: ConnectionState = ConnectionState.DISCONNECTED;
    private currentJoinCode: string | null = null;
    private currentPlayerName: string | null = null;
    private isConnecting = false;
    
    // ✅ REFACTORED: Throttle duplicate join attempts
    private lastJoinAttemptKey: string | null = null;
    private lastJoinAttemptAt: number = 0;
    private ongoingJoinPromise: Promise<void> | null = null;

    constructor() {
        // Don't auto-connect on instantiation - let the app control when to connect
        console.log('SignalR Service initialized');
    }

    // ✅ REFACTORED: Get current connection state
    getConnectionState(): ConnectionState {
        return this.connectionState;
    }

    // ✅ REFACTORED: Check if we should attempt reconnection
    private shouldAttemptReconnection(): boolean {
        // Don't reconnect if we're leaving or have left
        if (this.connectionState === ConnectionState.LEAVING || 
            this.connectionState === ConnectionState.LEFT) {
            return false;
        }
        
        // Only reconnect if we have valid game info
        return this.currentJoinCode !== null && this.currentPlayerName !== null;
    }
    
    // ✅ NEW: Reset to disconnected state (called after leaving game successfully)
    private resetConnectionState(): void {
        this.connectionState = ConnectionState.DISCONNECTED;
        this.currentJoinCode = null;
        this.currentPlayerName = null;
        this.connection = null;
        this.connectionPromise = null;
        this.isConnecting = false;
        this.lastJoinAttemptKey = null;
        this.lastJoinAttemptAt = 0;
        this.ongoingJoinPromise = null;
    }

    private async ensureConnection() {
        if (this.connection?.state === HubConnectionState.Connected) {
            this.connectionState = ConnectionState.CONNECTED;
            return;
        }
        
        if (this.connectionPromise) {
            await this.connectionPromise;
            return;
        }
        
        // ✅ NEW: Don't connect if we're intentionally leaving or don't have game info
        if (!this.shouldAttemptReconnection()) {
            console.log('Skipping connection - not in a state to reconnect');
            return;
        }
        
        this.connectionPromise = this.connect();
        try {
            await this.connectionPromise;
        } finally {
            this.connectionPromise = null;
        }
    }
 
    async connect() {
        if (this.isConnecting || this.connection?.state === HubConnectionState.Connected) {
            return;
        }
        
        // ✅ REFACTORED: Don't connect if we're leaving or have left
        if (this.connectionState === ConnectionState.LEAVING || 
            this.connectionState === ConnectionState.LEFT) {
            console.log('Skipping connection - leave operation in progress or already left');
            return;
        }
        
        this.isConnecting = true;
        this.connectionState = ConnectionState.CONNECTING;

        try {
            if (this.connection) {
                await this.connection.stop();
            }

            // Safari-specific configuration
            const isSafari = this.isSafari();
            const isMobile = this.isMobileSafari();
            const transportOptions = isSafari || isMobile
                ? HttpTransportType.LongPolling | HttpTransportType.ServerSentEvents // Mobile/Safari prefers these over WebSockets
                : HttpTransportType.WebSockets | HttpTransportType.LongPolling | HttpTransportType.ServerSentEvents;
            
            // ✅ FIXED: Resolve SignalR URL from env; if not provided, derive from API base to ensure both hit same backend
            const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/api\/?$/, '') || null;
            const SIGNALR_URL = import.meta.env.VITE_SIGNALR_URL || (API_BASE ? `${API_BASE}/gameHub` : 'https://whiteboardv2-backend-ckf7efgxbxbjg0ft.eastus-01.azurewebsites.net/gameHub');

            console.log('🔧 SignalR Configuration - SIGNALR_URL:', SIGNALR_URL);
            console.log(`🔧 SignalR Configuration - Safari: ${isSafari}, Mobile: ${isMobile}, Transport: ${transportOptions}`);
            
            this.connection = new HubConnectionBuilder()
                .withUrl(SIGNALR_URL, {
                    transport: transportOptions,
                    skipNegotiation: false,
                    timeout: isSafari || isMobile ? 60000 : 30000 // Longer timeout for mobile/Safari
                })
                .configureLogging(LogLevel.Information)
                .withAutomaticReconnect(isSafari || isMobile ? [0, 3000, 8000, 15000, 30000] : [0, 100, 200, 500, 1000]) // Slower reconnection for mobile
                .build();

            // ✅ REFACTORED: Better connection lifecycle handling
            this.connection.onclose(e => {
                console.log('SignalR connection closed:', e);
                this.connectionState = ConnectionState.DISCONNECTED;
                
                // Only attempt reconnection if we should
                if (this.shouldAttemptReconnection()) {
                    console.log('Connection closed, will attempt reconnection');
                    this.connectionState = ConnectionState.RECONNECTING;
                } else {
                    console.log('Connection closed, not attempting reconnection');
                }
            });
            
            this.connection.onreconnecting(e => {
                console.log('SignalR is reconnecting...', e);
                this.connectionState = ConnectionState.RECONNECTING;
            });
            
            this.connection.onreconnected(id => {
                console.log('SignalR reconnected successfully:', id);
                this.connectionState = ConnectionState.CONNECTED;
                
                // Only try to rejoin if we have valid game info and should reconnect
                if (this.shouldAttemptReconnection()) {
                    console.log('Re-joining game after reconnection...');
                    this.joinGame(this.currentJoinCode!, this.currentPlayerName!).catch(err => {
                        console.error('Failed to auto-rejoin game after reconnection:', err);
                    });
                } else {
                    console.log('Skipping rejoin - not in a state to reconnect');
                }
            });

            this.setupEventHandlers();
            
            // ✅ ENHANCED: Better connection handling with retries for Safari/mobile
            let connectionAttempts = 0;
            const maxAttempts = isSafari || isMobile ? 3 : 1;
            
            while (connectionAttempts < maxAttempts) {
                try {
                    console.log(`🔧 SignalR connection attempt ${connectionAttempts + 1}/${maxAttempts}`);
                    await this.connection.start();
                    this.connectionState = ConnectionState.CONNECTED;
                    console.log(`✅ SignalR Connected - Safari: ${this.isSafari()}, State: ${this.connection.state}`);
                    break;
                } catch (err) {
                    connectionAttempts++;
                    console.error(`❌ SignalR connection attempt ${connectionAttempts} failed:`, err);
                    
                    if (connectionAttempts >= maxAttempts) {
                        console.error('❌ All SignalR connection attempts failed');
                        this.connectionState = ConnectionState.DISCONNECTED;
                        this.isConnecting = false;
                        throw err;
                    }
                    
                    // Wait before retry (progressive delay for mobile/Safari)
                    const delay = isSafari || isMobile ? 2000 * connectionAttempts : 1000;
                    console.log(`⏳ Waiting ${delay}ms before retry...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        } catch (err) {
            console.error('❌ SignalR connection error:', err);
            this.connectionState = ConnectionState.DISCONNECTED;
            this.isConnecting = false;
            throw err;
        } finally {
            this.isConnecting = false;
        }
    }

    // ✅ REFACTORED: Force reconnection with cleaner state management
    async forceReconnect() {
        console.log('⚡ Force reconnecting SignalR...');
        
        // Don't force reconnect if we're leaving or have left
        if (this.connectionState === ConnectionState.LEAVING || 
            this.connectionState === ConnectionState.LEFT) {
            console.log('Skipping force reconnect - leave operation in progress or already left');
            return;
        }
        
        // Close existing connection if any
        if (this.connection) {
            try {
                await this.connection.stop();
            } catch (error) {
                console.log('⚡ Error stopping existing connection:', error);
            }
        }
        
        // Reset connection state (but keep game info for rejoin)
        this.connection = null;
        this.connectionPromise = null;
        this.isConnecting = false;
        this.connectionState = ConnectionState.DISCONNECTED;
        
        // Attempt to reconnect
        try {
            await this.connect();
            console.log('⚡ Force reconnection successful');
        } catch (error) {
            console.error('⚡ Force reconnection failed:', error);
            throw error;
        }
    }

    private setupEventHandlers() {
        if (!this.connection) return;

        this.connection.on('GameStateSynced', (payload: GameStatePayload) => {
            console.log('GameStateSynced event received:', payload);
            this.gameStateSyncedCallback?.(payload);
        });

        this.connection.on('PlayerListUpdated', (players: Player[]) => {
            console.log('🎯 SignalR PlayerListUpdated event received:', players);
            this.playerListUpdatedCallback?.(players);
        });

        this.connection.on('AnswerReceived', (playerId: string, playerName: string, answer: string, answerId: number, roundNumber?: number) => {
            this.answerReceivedCallback?.(playerId, playerName, answer, answerId, roundNumber);
        });

        this.connection.on('RoundStarted', (prompt: string, roundId: number, timerDurationMinutes?: number, votingEnabled?: boolean) => {
            console.log('🎯 SignalR RoundStarted event received:', { prompt, roundId, timerDurationMinutes, votingEnabled });
            this.roundStartedCallback?.(prompt, roundId, timerDurationMinutes, votingEnabled);
        });

        this.connection.on('PlayerKicked', (playerId: string, playerName: string) => {
            console.log('🎯 SignalR PlayerKicked event received:', { playerId, playerName });
            this.playerKickedCallback?.(playerId, playerName);
        });

        this.connection.on('JudgingModeToggled', (enabled: boolean) => {
            console.log('🎯 SignalR JudgingModeToggled event received:', enabled);
            this.judgingModeToggledCallback?.(enabled);
        });

        this.connection.on('VoteResultsUpdated', (results: any[], maxVotes: number) => {
            this.voteResultsUpdatedCallback?.(results, maxVotes);
        });
    }
    
    async ensureConnectionSafe(): Promise<boolean> {
        try {
            await this.ensureConnection();
            return this.connection?.state === HubConnectionState.Connected;
        } catch (err) {
            console.error('Failed to ensure SignalR connection:', err);
            return false;
        }
    }

    async joinGame(joinCode: string, playerName: string) {
        console.log(`🎯 Joining game: ${joinCode} as ${playerName}`);
        
        // ✅ REFACTORED: Update state for new game join
        this.currentJoinCode = joinCode;
        this.currentPlayerName = playerName;
        
        // If we were in LEFT state, reset to allow reconnection
        if (this.connectionState === ConnectionState.LEFT) {
            this.connectionState = ConnectionState.DISCONNECTED;
        }
        
        // ✅ NEW: Coalesce duplicate join attempts for the same player/game
        const joinKey = `${joinCode}:${playerName}`;
        if (this.ongoingJoinPromise && this.lastJoinAttemptKey === joinKey) {
            console.log('🔄 Returning existing ongoing join attempt for same player/game');
            return this.ongoingJoinPromise;
        }
        const now = Date.now();
        if (this.lastJoinAttemptKey === joinKey && (now - this.lastJoinAttemptAt) < 1500 && this.connection?.state === HubConnectionState.Connected) {
            console.log('⏳ Throttling duplicate join attempt within 1500ms window');
            return;
        }
        this.lastJoinAttemptKey = joinKey;
        this.lastJoinAttemptAt = now;
        
        const connected = await this.ensureConnectionSafe();
        if (!connected || !this.connection) throw new Error('No SignalR connection');
        
        this.ongoingJoinPromise = (async () => {
            try {
                const timeoutPromise = new Promise((_, reject) => {
                    const timeout = this.isSafari() ? 20000 : 10000; // Longer timeout for mobile/Safari
                    setTimeout(() => reject(new Error('Join game timeout')), timeout);
                });
                const joinPromise = this.connection!.invoke('JoinGame', joinCode, playerName);
                await Promise.race([joinPromise, timeoutPromise]);
                console.log('Successfully invoked JoinGame');
                
                // ✅ NEW: Wait for GameStateSynced to ensure complete state sync
                // This is especially important for players who were away during round start
                await new Promise(resolve => setTimeout(resolve, 500));
                console.log('Game state sync completed');
            } catch (error) {
                console.error('Error invoking JoinGame:', error);
                // For Safari/mobile, try a force reconnect and retry multiple times
                if ((this.isSafari() || this.isMobileSafari()) && error instanceof Error && (error as any).message?.includes('timeout')) {
                    console.log('Mobile/Safari timeout detected, attempting multiple reconnection attempts');
                    for (let attempt = 1; attempt <= 3; attempt++) {
                        try {
                            console.log(`Mobile reconnection attempt ${attempt}/3`);
                            await this.forceReconnect();
                            await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Progressive delay
                            // Important: do not recurse into coalescing again, invoke directly
                            const innerTimeout = new Promise((_, reject) => {
                                const t = this.isSafari() ? 20000 : 10000;
                                setTimeout(() => reject(new Error('Join game timeout')), t);
                            });
                            const innerJoin = this.connection!.invoke('JoinGame', joinCode, playerName);
                            await Promise.race([innerJoin, innerTimeout]);
                            console.log(`Mobile reconnection attempt ${attempt} successful`);
                            // Wait a bit for state sync
                            await new Promise(resolve => setTimeout(resolve, 500));
                            return;
                        } catch (retryError) {
                            console.error(`Mobile reconnection attempt ${attempt} failed:`, retryError);
                            if (attempt === 3) {
                                throw retryError;
                            }
                        }
                    }
                }
                throw error;
            } finally {
                this.ongoingJoinPromise = null;
            }
        })();
        
        return this.ongoingJoinPromise;
    }

    // ✅ REFACTORED: Simplified reconnection helper
    async reconnectIfNeeded(joinCode: string, playerName: string) {
        // Don't reconnect if we're leaving or have left
        if (this.connectionState === ConnectionState.LEAVING || 
            this.connectionState === ConnectionState.LEFT) {
            console.log('Skipping reconnectIfNeeded - leaving or left game');
            return;
        }
        
        // Check if we need to reconnect
        const needsReconnect = !this.isConnected() || !this.isPlayerIdentified();
        if (!needsReconnect) {
            console.log('reconnectIfNeeded: already connected and identified');
            return;
        }
        
        console.log('reconnectIfNeeded: attempting to restore connection and join game');
        await this.forceReconnect();
        await this.joinGame(joinCode, playerName);
    }

    async startRound(joinCode: string, prompt: string, timerDuration?: number, votingMode?: boolean) {
        const connected = await this.ensureConnectionSafe();
        if (!connected || !this.connection) throw new Error('No SignalR connection');
        await this.connection.invoke('StartRound', joinCode, prompt, timerDuration, votingMode);
    }

    async sendAnswer(joinCode: string, answer: string) {
        const connected = await this.ensureConnectionSafe();
        if (!connected || !this.connection) throw new Error('No SignalR connection');
        try {
            await this.connection.invoke('SubmitAnswer', joinCode, answer);
        } catch (error: any) {
            console.error('⚡ Error submitting answer via SignalR:', error);
            if (error.message?.includes('Player not identified') || 
                error.message?.includes('Player not found') ||
                error.message?.includes('No SignalR connection')) {
                console.log('⚡ Player identification issue, attempting force reconnection before retry');
                if (this.currentJoinCode && this.currentPlayerName) {
                    try {
                        await this.forceReconnect();
                        await this.joinGame(this.currentJoinCode, this.currentPlayerName);
                        console.log('⚡ Successfully force reconnected, retrying answer submission');
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        await this.connection.invoke('SubmitAnswer', joinCode, answer);
                        console.log('⚡ Answer submitted successfully after force reconnection');
                    } catch (rejoinError) {
                        console.error('⚡ Failed to force rejoin game and retry submission:', rejoinError);
                        throw rejoinError;
                    }
                } else {
                    console.error('⚡ No current game info available for rejoin');
                    throw error;
                }
            } else {
                throw error;
            }
        }
    }

    async kickPlayer(joinCode: string, playerId: number) {
        const connected = await this.ensureConnectionSafe();
        if (!connected || !this.connection) throw new Error('No SignalR connection');
        await this.connection.invoke('KickPlayer', joinCode, playerId);
    }

    async toggleJudgingMode(joinCode: string, enabled: boolean) {
        const connected = await this.ensureConnectionSafe();
        if (!connected || !this.connection) throw new Error('No SignalR connection');
        await this.connection.invoke('ToggleJudgingMode', joinCode, enabled);
    }

    async submitVote(joinCode: string, votedAnswerId: number) {
        const connected = await this.ensureConnectionSafe();
        if (!connected || !this.connection) throw new Error('No SignalR connection');
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Vote submission timeout')), 15000);
        });
        const votePromise = this.connection.invoke('SubmitVote', joinCode, votedAnswerId);
        await Promise.race([votePromise, timeoutPromise]);
    }

    async getMaxVotesForGame(joinCode: string): Promise<number> {
        const connected = await this.ensureConnectionSafe();
        if (!connected || !this.connection) throw new Error('No SignalR connection');
        return await this.connection.invoke('GetMaxVotesForGame', joinCode);
    }
    
    // ✅ REFACTORED: Cleaner leave game logic with proper state management
    async leaveGame(joinCode: string) {
        console.log('🎯 SignalR: Leaving game:', joinCode);
        
        // ✅ Set leaving state to prevent reconnection attempts
        this.connectionState = ConnectionState.LEAVING;
        
        // Try to notify backend if we're connected
        if (this.connection?.state === HubConnectionState.Connected) {
            try {
                console.log('🎯 SignalR: Invoking LeaveGame on backend...');
                await this.connection.invoke('LeaveGame', joinCode);
                console.log('🎯 SignalR: Successfully invoked LeaveGame on backend');
            } catch (error) {
                console.error('🎯 SignalR: Error invoking LeaveGame on backend:', error);
                // Continue with cleanup even if backend call fails
            }
        } else {
            console.warn('🎯 SignalR: Not connected when leaving game, skipping backend call');
        }
        
        // Always clean up local state
        console.log('🎯 SignalR: Cleaning up local connection state...');
        this.resetConnectionState();
        
        // Mark as successfully left
        this.connectionState = ConnectionState.LEFT;
        console.log('🎯 SignalR: Leave game completed');
    }

    // Callback Registration
    onGameStateSynced(callback: (payload: GameStatePayload) => void) {
        this.gameStateSyncedCallback = callback;
    }

    onPlayerListUpdated(callback: (players: Player[]) => void) {
        console.log('🎯 Setting up onPlayerListUpdated callback');
        this.playerListUpdatedCallback = callback;
    }

    onAnswerReceived(callback: (playerId: string, playerName: string, answer: string, answerId: number, roundNumber?: number) => void) {
        this.answerReceivedCallback = callback;
    }

    onRoundStarted(callback: (prompt: string, roundId: number, timerDurationMinutes?: number, votingEnabled?: boolean) => void) {
        console.log('🎯 Setting up onRoundStarted callback');
        this.roundStartedCallback = callback;
    }

    onPlayerKicked(callback: (playerId: string, playerName: string) => void) {
        this.playerKickedCallback = callback;
    }

    onJudgingModeToggled(callback: (enabled: boolean) => void) {
        this.judgingModeToggledCallback = callback;
    }

    onVoteResultsUpdated(callback: (results: any[], maxVotes: number) => void) {
        this.voteResultsUpdatedCallback = callback;
    }

    // ✅ REFACTORED: Simplified status checking methods
    isInGame(): boolean {
        return this.currentJoinCode !== null && 
               this.currentPlayerName !== null && 
               this.connectionState !== ConnectionState.LEAVING &&
               this.connectionState !== ConnectionState.LEFT;
    }

    isConnected(): boolean {
        return this.connection?.state === HubConnectionState.Connected && 
               this.connectionState === ConnectionState.CONNECTED;
    }

    isReconnecting(): boolean {
        return this.connectionState === ConnectionState.RECONNECTING;
    }

    isPlayerIdentified(): boolean {
        return this.isConnected() && 
               this.currentJoinCode !== null && 
               this.currentPlayerName !== null &&
               this.connectionState !== ConnectionState.LEAVING &&
               this.connectionState !== ConnectionState.LEFT;
    }

    isIntentionallyLeaving(): boolean {
        return this.connectionState === ConnectionState.LEAVING || 
               this.connectionState === ConnectionState.LEFT;
    }

    getCurrentGameInfo(): { joinCode: string | null; playerName: string | null } {
        return {
            joinCode: this.currentJoinCode,
            playerName: this.currentPlayerName
        };
    }

    // ✅ NEW: Safari detection for better connection handling
    private isSafari(): boolean {
        const userAgent = navigator.userAgent;
        return /Safari/.test(userAgent) && !/Chrome/.test(userAgent);
    }

    // ✅ NEW: Mobile Safari detection for better connection handling
    private isMobileSafari(): boolean {
        const userAgent = navigator.userAgent;
        return /iPhone|iPad|iPod/.test(userAgent) && /Safari/.test(userAgent) && !/Chrome/.test(userAgent);
    }
}

export const signalRService = new SignalRService();