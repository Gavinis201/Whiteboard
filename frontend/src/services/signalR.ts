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
    
    // State
    private isConnecting = false;
    private isReconnectingState = false; // ✅ NEW: Track reconnecting state
    private currentJoinCode: string | null = null;
    private currentPlayerName: string | null = null;

    constructor() {
        // Automatically start the connection when the service is instantiated
        this.ensureConnection();
    }

    private async ensureConnection() {
        if (this.connection?.state === HubConnectionState.Connected) return;
        if (this.connectionPromise) {
            await this.connectionPromise;
            return;
        }
        
        // ✅ ULTRA-FAST: No delays for instant reconnection
        if (this.isMobileSafari() && this.connection?.state === HubConnectionState.Disconnected) {
            console.log('Mobile Safari detected, instant connection recovery');
            // No delay for ultra-fast reconnection
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
        this.isConnecting = true;

        try {
            if (this.connection) await this.connection.stop();

            this.connection = new HubConnectionBuilder()
                .withUrl('https://whiteboardv2-backend-ckf7fgxbxbjg0ft.eastus-01.azurewebsites.net/gameHub', {
                    transport: HttpTransportType.WebSockets | HttpTransportType.LongPolling | HttpTransportType.ServerSentEvents,
                    skipNegotiation: false,
                    timeout: 30000, // 30 second timeout for connection
                })
                .configureLogging(LogLevel.Information)
                .withAutomaticReconnect([0, 100, 200, 500, 1000]) // ✅ ULTRA-FAST: Instant reconnection strategy
                .build();

            // 🔄 REFINED: Add more detailed logging for connection lifecycle
            this.connection.onclose(e => {
                console.error('SignalR connection closed:', e);
                this.isReconnectingState = false;
                
                // For mobile Safari, don't immediately clear state on connection close
                // as it might be due to background tab throttling
                if (e && !this.isMobileSafari()) {
                    console.log('Connection closed due to error, clearing game state');
                    this.currentJoinCode = null;
                    this.currentPlayerName = null;
                } else if (e) {
                    console.log('Connection closed on mobile Safari, preserving state for potential reconnection');
                }
            });
            
            this.connection.onreconnecting(e => {
                console.log('SignalR is reconnecting...', e);
                this.isReconnectingState = true; // ✅ NEW: Set state to true
            });
            
            this.connection.onreconnected(id => {
                console.log('SignalR reconnected successfully:', id);
                this.isReconnectingState = false; // ✅ NEW: Set state to false
                // Only try to rejoin if we have valid game info
                if (this.currentJoinCode && this.currentPlayerName) {
                    console.log('Re-joining game after reconnection...');
                    this.joinGame(this.currentJoinCode, this.currentPlayerName).catch(err => {
                        console.error('Failed to auto-rejoin game after reconnection:', err);
                    });
                }
            });

            this.setupEventHandlers();
            await this.connection.start();
            console.log('SignalR Connected');
        } catch (err) {
            console.error('SignalR connection error:', err);
            this.isConnecting = false;
            throw err;
        } finally {
            this.isConnecting = false;
        }
    }

    // ✅ ULTRA-FAST: Instant force reconnection method
    async forceReconnect() {
        console.log('⚡ ULTRA-FAST: Force reconnecting SignalR...');
        
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
        this.isReconnectingState = false;
        
        // Attempt to reconnect instantly
        try {
            await this.connect();
            console.log('⚡ ULTRA-FAST: Force reconnection successful');
        } catch (error) {
            console.error('⚡ ULTRA-FAST: Force reconnection failed:', error);
            throw error;
        }
    }

    private setupEventHandlers() {
        if (!this.connection) return;

        // Handler for the full state sync on join/reconnect
        this.connection.on('GameStateSynced', (payload: GameStatePayload) => {
            console.log('GameStateSynced event received:', payload);
            this.gameStateSyncedCallback?.(payload);
        });

        // Handler for other players to get a simple player list update
        this.connection.on('PlayerListUpdated', (players: Player[]) => {
            console.log('PlayerListUpdated event received for group:', players);
            this.playerListUpdatedCallback?.(players);
        });

        this.connection.on('AnswerReceived', (playerId: string, playerName: string, answer: string, answerId: number, roundNumber?: number) => {
            this.answerReceivedCallback?.(playerId, playerName, answer, answerId, roundNumber);
        });

        this.connection.on('RoundStarted', (prompt: string, roundId: number, timerDurationMinutes?: number, votingEnabled?: boolean) => {
            console.log('🎯 SignalR RoundStarted event received:', { prompt, roundId, timerDurationMinutes, votingEnabled });
            console.log('🎯 Calling roundStartedCallback:', !!this.roundStartedCallback);
            console.log('🎯 Current connection state:', this.connection?.state);
            console.log('🎯 Current game info:', this.getCurrentGameInfo());
            this.roundStartedCallback?.(prompt, roundId, timerDurationMinutes, votingEnabled);
        });

        this.connection.on('PlayerKicked', (playerId: string, playerName: string) => {
            this.playerKickedCallback?.(playerId, playerName);
        });

        this.connection.on('JudgingModeToggled', (enabled: boolean) => {
            console.log('🎯 SignalR JudgingModeToggled event received:', enabled);
            console.log('🎯 Current game info:', this.getCurrentGameInfo());
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
        const connected = await this.ensureConnectionSafe();
        if (!connected || !this.connection) throw new Error('No SignalR connection');
        this.currentJoinCode = joinCode;
        this.currentPlayerName = playerName;
        try {
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Join game timeout')), 5000);
            });
            const joinPromise = this.connection.invoke('JoinGame', joinCode, playerName);
            await Promise.race([joinPromise, timeoutPromise]);
            console.log('Successfully invoked JoinGame');
        } catch (error) {
            console.error('Error invoking JoinGame:', error);
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
    
    async leaveGame(joinCode: string) {
        const connected = await this.ensureConnectionSafe();
        if (!connected || !this.connection) {
            console.warn('No SignalR connection when leaving game. Skipping backend call.');
            this.currentJoinCode = null;
            this.currentPlayerName = null;
            return;
        }
        try {
            await this.connection.invoke('LeaveGame', joinCode);
            console.log('Successfully left game');
            this.currentJoinCode = null;
            this.currentPlayerName = null;
        } catch (error) {
            console.error('Error leaving game:', error);
            throw error;
        }
    }

    // Callback Registration
    onGameStateSynced(callback: (payload: GameStatePayload) => void) {
        this.gameStateSyncedCallback = callback;
    }

    onPlayerListUpdated(callback: (players: Player[]) => void) {
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

    // ✅ NEW: Public methods to check connection status
    isInGame(): boolean {
        return this.currentJoinCode !== null && this.currentPlayerName !== null;
    }

    isConnected(): boolean {
        return this.connection?.state === HubConnectionState.Connected;
    }

    isReconnecting(): boolean {
        return this.isReconnectingState;
    }

    // ✅ ENHANCED: Check if player is properly identified in the game
    isPlayerIdentified(): boolean {
        return this.isConnected() && 
               this.currentJoinCode !== null && 
               this.currentPlayerName !== null &&
               !this.isReconnectingState;
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

    // ✅ NEW: Mobile Safari detection for better connection handling
    private isMobileSafari(): boolean {
        const userAgent = navigator.userAgent;
        return /iPhone|iPad|iPod/.test(userAgent) && /Safari/.test(userAgent) && !/Chrome/.test(userAgent);
    }
}

export const signalRService = new SignalRService();