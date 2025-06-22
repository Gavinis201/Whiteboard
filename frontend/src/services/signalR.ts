import { HubConnectionBuilder, HubConnection, LogLevel, HttpTransportType, HubConnectionState } from '@microsoft/signalr';
import { Player, Round, Answer } from './api';

// Type for the full state payload
export interface GameStatePayload {
    players: Player[];
    activeRound: Round | null;
    currentAnswers: Answer[];
}

class SignalRService {
    private connection: HubConnection | null = null;
    private connectionPromise: Promise<void> | null = null;
    
    // Callbacks
    private gameStateSyncedCallback: ((payload: GameStatePayload) => void) | null = null;
    private playerListUpdatedCallback: ((players: Player[]) => void) | null = null;
    private answerReceivedCallback: ((playerId: string, playerName: string, answer: string) => void) | null = null;
    private roundStartedCallback: ((prompt: string) => void) | null = null;
    
    // State
    private isConnecting = false;
    private currentJoinCode: string | null = null;
    private currentPlayerName: string | null = null;

    private async ensureConnection() {
        if (this.connection?.state === HubConnectionState.Connected) return;
        if (this.connectionPromise) {
            await this.connectionPromise;
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
        if (this.isConnecting || this.connection?.state === HubConnectionState.Connected) return;
        this.isConnecting = true;

        try {
            if (this.connection) await this.connection.stop();

            this.connection = new HubConnectionBuilder()
                .withUrl('http://whiteboardv2-backend-ckf7efgxbxbjg0ft.eastus-01.azurewebsites.net/gameHub', {
                    transport: HttpTransportType.WebSockets,
                })
                .configureLogging(LogLevel.Information)
                .withAutomaticReconnect()
                .build();

            this.connection.onclose(e => console.error('SignalR connection closed:', e));
            this.connection.onreconnecting(e => console.log('SignalR reconnecting:', e));
            this.connection.onreconnected(id => {
                console.log('SignalR reconnected:', id);
                if (this.currentJoinCode && this.currentPlayerName) {
                    this.joinGame(this.currentJoinCode, this.currentPlayerName);
                }
            });

            this.setupEventHandlers();
            await this.connection.start();
            console.log('SignalR Connected');
        } catch (err) {
            console.error('SignalR connection error:', err);
            throw err;
        } finally {
            this.isConnecting = false;
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

        this.connection.on('AnswerReceived', (playerId: string, playerName: string, answer: string) => {
            this.answerReceivedCallback?.(playerId, playerName, answer);
        });

        this.connection.on('RoundStarted', (prompt: string) => {
            this.roundStartedCallback?.(prompt);
        });
    }
    
    async joinGame(joinCode: string, playerName: string) {
        await this.ensureConnection();
        if (!this.connection) throw new Error('No SignalR connection');

        this.currentJoinCode = joinCode;
        this.currentPlayerName = playerName;
        
        try {
            await this.connection.invoke('JoinGame', joinCode, playerName);
            console.log('Successfully invoked JoinGame');
        } catch (error) {
            console.error('Error invoking JoinGame:', error);
            throw error;
        }
    }

    async startRound(joinCode: string, prompt: string) {
        await this.ensureConnection();
        if (!this.connection) throw new Error('No SignalR connection');
        await this.connection.invoke('StartRound', joinCode, prompt);
    }

    async sendAnswer(joinCode: string, answer: string) {
        await this.ensureConnection();
        if (!this.connection) throw new Error('No SignalR connection');
        await this.connection.invoke('SubmitAnswer', joinCode, answer);
    }
    
    async leaveGame(joinCode: string) {
        await this.ensureConnection();
        if (!this.connection) throw new Error('No SignalR connection');
        try {
            await this.connection.invoke('LeaveGame', joinCode);
            console.log('Successfully left game');
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

    onAnswerReceived(callback: (playerId: string, playerName: string, answer: string) => void) {
        this.answerReceivedCallback = callback;
    }

    onRoundStarted(callback: (prompt: string) => void) {
        this.roundStartedCallback = callback;
    }
}

export const signalRService = new SignalRService();