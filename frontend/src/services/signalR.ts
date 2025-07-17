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

// ✅ NEW: Connection state enum for better state management
enum ConnectionState {
    DISCONNECTED = 'disconnected',
    CONNECTING = 'connecting',
    CONNECTED = 'connected',
    RECONNECTING = 'reconnecting',
    INTENTIONALLY_LEFT = 'intentionally_left'
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
    
    // ✅ REFACTORED: Better state management
    private connectionState: ConnectionState = ConnectionState.DISCONNECTED;
    private currentJoinCode: string | null = null;
    private currentPlayerName: string | null = null;
    private isConnecting = false;
    private autoReconnectEnabled = true; // ✅ NEW: Control auto-reconnection
    private leaveInProgress = false; // ✅ NEW: Track if leave operation is in progress

    constructor() {
        // Don't auto-connect on instantiation - let the app control when to connect
        console.log('SignalR Service initialized');
    }

    // ✅ NEW: Get current connection state
    getConnectionState(): ConnectionState {
        return this.connectionState;
    }

    // ✅ NEW: Check if we should attempt reconnection
    private shouldAttemptReconnection(): boolean {
        return this.autoReconnectEnabled && 
               !this.leaveInProgress && 
               this.currentJoinCode !== null && 
               this.currentPlayerName !== null &&
               this.connectionState !== ConnectionState.INTENTIONALLY_LEFT;
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
        
        // ✅ NEW: Don't connect if we're intentionally leaving
        if (this.leaveInProgress || this.connectionState === ConnectionState.INTENTIONALLY_LEFT) {
            console.log('Skipping connection - leave operation in progress or intentionally left');
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
            
            console.log(`🔧 SignalR Configuration - Safari: ${isSafari}, Mobile: ${isMobile}, Transport: ${transportOptions}`);
            
            this.connection = new HubConnectionBuilder()
                .withUrl('http://localhost:5164/gameHub', {
                    transport: transportOptions,
                    skipNegotiation: false,
                    timeout: isSafari || isMobile ? 60000 : 30000, // Longer timeout for mobile/Safari
                    keepAliveInterval: isSafari || isMobile ? 20000 : 15000, // More frequent keep-alive for mobile
                    serverTimeoutInMilliseconds: isSafari || isMobile ? 40000 : 30000
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
            await this.connection.start();
            this.connectionState = ConnectionState.CONNECTED;
            console.log(`SignalR Connected - Safari: ${this.isSafari()}, State: ${this.connection.state}`);
        } catch (err) {
            console.error('SignalR connection error:', err);
            this.connectionState = ConnectionState.DISCONNECTED;
            this.isConnecting = false;
            throw err;
        } finally {
            this.isConnecting = false;
        }
    }

    // ✅ REFACTORED: Force reconnection with better state management
    async forceReconnect() {
        console.log('⚡ Force reconnecting SignalR...');
        
        // Don't force reconnect if we're intentionally leaving
        if (this.leaveInProgress || this.connectionState === ConnectionState.INTENTIONALLY_LEFT) {
            console.log('Skipping force reconnect - leave operation in progress or intentionally left');
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
        
        // Reset connection state
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
        
        // ✅ NEW: Reset leave state when joining a game
        this.leaveInProgress = false;
        this.connectionState = ConnectionState.CONNECTED;
        this.autoReconnectEnabled = true;
        
        this.currentJoinCode = joinCode;
        this.currentPlayerName = playerName;
        
        const connected = await this.ensureConnectionSafe();
        if (!connected || !this.connection) throw new Error('No SignalR connection');
        
        try {
            const timeoutPromise = new Promise((_, reject) => {
                const timeout = this.isSafari() ? 20000 : 10000; // Longer timeout for mobile/Safari
                setTimeout(() => reject(new Error('Join game timeout')), timeout);
            });
            const joinPromise = this.connection.invoke('JoinGame', joinCode, playerName);
            await Promise.race([joinPromise, timeoutPromise]);
            console.log('Successfully invoked JoinGame');
        } catch (error) {
            console.error('Error invoking JoinGame:', error);
            // For Safari/mobile, try a force reconnect and retry multiple times
            if ((this.isSafari() || this.isMobileSafari()) && error.message?.includes('timeout')) {
                console.log('Mobile/Safari timeout detected, attempting multiple reconnection attempts');
                for (let attempt = 1; attempt <= 3; attempt++) {
                    try {
                        console.log(`Mobile reconnection attempt ${attempt}/3`);
                        await this.forceReconnect();
                        await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Progressive delay
                        await this.joinGame(joinCode, playerName);
                        console.log(`Mobile reconnection attempt ${attempt} successful`);
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
        }
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
    
    // ✅ REFACTORED: Better leave game logic
    async leaveGame(joinCode: string) {
        console.log('🎯 Leaving game:', joinCode);
        
        // ✅ NEW: Set leave state to prevent reconnection
        this.leaveInProgress = true;
        this.autoReconnectEnabled = false;
        this.connectionState = ConnectionState.INTENTIONALLY_LEFT;
        
        const connected = await this.ensureConnectionSafe();
        if (!connected || !this.connection) {
            console.warn('No SignalR connection when leaving game. Skipping backend call.');
            this.clearGameState();
            return;
        }
        
        try {
            await this.connection.invoke('LeaveGame', joinCode);
            console.log('Successfully left game');
            this.clearGameState();
        } catch (error) {
            console.error('Error leaving game:', error);
            // Reset state on error so reconnection can still work
            this.leaveInProgress = false;
            this.autoReconnectEnabled = true;
            this.connectionState = ConnectionState.CONNECTED;
            throw error;
        }
    }

    // ✅ NEW: Clear game state helper
    private clearGameState() {
        this.currentJoinCode = null;
        this.currentPlayerName = null;
        this.leaveInProgress = false;
        this.autoReconnectEnabled = true;
        this.connectionState = ConnectionState.DISCONNECTED;
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

    // ✅ REFACTORED: Better status checking methods
    isInGame(): boolean {
        return this.currentJoinCode !== null && 
               this.currentPlayerName !== null && 
               this.connectionState !== ConnectionState.INTENTIONALLY_LEFT;
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
               !this.leaveInProgress;
    }

    isIntentionallyLeaving(): boolean {
        return this.leaveInProgress || this.connectionState === ConnectionState.INTENTIONALLY_LEFT;
    }

    isSubmitting(): boolean {
        return false; // Placeholder for future implementation
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