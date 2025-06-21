import { HubConnectionBuilder, HubConnection, LogLevel, HttpTransportType, HubConnectionState } from '@microsoft/signalr';

class SignalRService {
    private connection: HubConnection | null = null;
    private connectionPromise: Promise<void> | null = null;
    private playerJoinedCallback: ((playerId: string, name: string) => void) | null = null;
    private playerLeftCallback: ((playerId: string) => void) | null = null;
    private playerReconnectedCallback: ((playerId: string, name: string) => void) | null = null;
    private answerReceivedCallback: ((playerId: string, playerName: string, answer: string) => void) | null = null;
    private roundStartedCallback: ((prompt: string) => void) | null = null;
    private roundEndedCallback: (() => void) | null = null;
    private answersRevealedCallback: (() => void) | null = null;
    
    // Reconnection state tracking
    private isReconnecting = false;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 10;
    private currentJoinCode: string | null = null;
    private currentPlayerName: string | null = null;
    private reconnectionTimer: number | null = null;
    private isConnecting = false; // Track if we're currently in the process of connecting
    private connectionState: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' = 'disconnected';

    private async ensureConnection() {
        if (this.connection?.state === HubConnectionState.Connected) {
            return;
        }

        if (this.connectionPromise) {
            try {
                await this.connectionPromise;
                return;
            } catch (error) {
                console.warn('Previous connection attempt failed, retrying...', error);
                this.connectionPromise = null;
            }
        }

        this.connectionPromise = this.connect();
        try {
            await this.connectionPromise;
        } finally {
            this.connectionPromise = null;
        }
    }

    async connect() {
        // Prevent multiple simultaneous connection attempts
        if (this.isConnecting) {
            console.log('Connection already in progress, waiting...');
            if (this.connectionPromise) {
                await this.connectionPromise;
                return;
            }
        }

        if (this.connection?.state === HubConnectionState.Connected) {
            console.log('Already connected to SignalR');
            return;
        }

        this.isConnecting = true;
        this.connectionState = 'connecting';

        try {
            console.log('Attempting to connect to SignalR hub...');
            
            // Check if this is a refresh scenario
            const refreshInProgress = sessionStorage.getItem('whiteboard_refresh_in_progress');
            if (refreshInProgress === 'true') {
                console.log('Refresh detected - preserving connection state');
                // Don't stop existing connection during refresh
            } else if (this.connection) {
                try {
                    console.log('Stopping existing connection...');
                    await this.connection.stop();
                } catch (error) {
                    console.warn('Error stopping existing connection:', error);
                }
                this.connection = null;
            }

            this.connection = new HubConnectionBuilder()
                .withUrl('https://whiteboardv2-backend-ckf7efgxbxbjg0ft.eastus-01.azurewebsites.net/gameHub', {
                    transport: HttpTransportType.WebSockets | HttpTransportType.LongPolling | HttpTransportType.ServerSentEvents,
                    skipNegotiation: false,
                    withCredentials: true
                })
                .configureLogging(LogLevel.Debug)
                .withAutomaticReconnect({
                    nextRetryDelayInMilliseconds: retryContext => {
                        // More conservative reconnection strategy to avoid loops
                        if (retryContext.elapsedMilliseconds < 30000) { // 30 seconds
                            return Math.random() * 2000 + 2000; // 2-4 seconds
                        } else if (retryContext.elapsedMilliseconds < 120000) { // 2 minutes
                            return Math.random() * 5000 + 5000; // 5-10 seconds
                        }
                        return null; // Stop trying after 2 minutes
                    }
                })
                .build();

            this.connection.onclose((error) => {
                console.error('SignalR connection closed:', error);
                this.connectionPromise = null;
                this.isReconnecting = false;
                this.isConnecting = false;
                this.connectionState = 'disconnected';
                
                // Check if this is a refresh-related closure
                const refreshInProgress = sessionStorage.getItem('whiteboard_refresh_in_progress');
                if (refreshInProgress === 'true') {
                    console.log('Connection closed during refresh - will restore on page load');
                    return; // Don't attempt reconnection during refresh
                }
                
                // Only attempt to reconnect if we have game context and we're not already reconnecting
                if (this.currentJoinCode && this.currentPlayerName && !this.isReconnecting) {
                    this.scheduleReconnection();
                }
            });

            this.connection.onreconnecting((error) => {
                console.log('SignalR reconnecting:', error);
                this.isReconnecting = true;
                this.connectionState = 'reconnecting';
            });

            this.connection.onreconnected((connectionId) => {
                console.log('SignalR reconnected:', connectionId);
                this.isReconnecting = false;
                this.reconnectAttempts = 0;
                this.connectionState = 'connected';
                
                // Rejoin the game if we have the context
                if (this.currentJoinCode && this.currentPlayerName) {
                    this.rejoinGame();
                }
            });

            // Set up event handlers
            this.setupEventHandlers();

            // Start the connection with a longer timeout
            const connectionPromise = this.connection.start();
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Connection timeout')), 30000);
            });

            await Promise.race([connectionPromise, timeoutPromise]);
            console.log('SignalR Connected successfully');
            this.connectionState = 'connected';
            
            // Clear refresh state after successful connection
            sessionStorage.removeItem('whiteboard_refresh_in_progress');
        } catch (err) {
            console.error('Error while establishing SignalR connection:', err);
            this.connection = null;
            this.connectionPromise = null;
            this.connectionState = 'disconnected';
            throw err;
        } finally {
            this.isConnecting = false;
        }
    }

    private scheduleReconnection() {
        // Prevent multiple reconnection schedules
        if (this.reconnectionTimer || this.isReconnecting) {
            console.log('Reconnection already scheduled or in progress, skipping...');
            return;
        }
        
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('Max reconnection attempts reached');
            return;
        }
        
        this.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000); // Exponential backoff, max 30s
        
        console.log(`Scheduling reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);
        
        this.reconnectionTimer = setTimeout(async () => {
            try {
                this.isReconnecting = true;
                await this.connect();
                if (this.currentJoinCode && this.currentPlayerName) {
                    await this.rejoinGame();
                }
            } catch (error) {
                console.error('Reconnection failed:', error);
                // Don't schedule another reconnection here - let the onclose handler handle it
            } finally {
                this.isReconnecting = false;
                this.reconnectionTimer = null;
            }
        }, delay);
    }

    private async rejoinGame() {
        if (!this.currentJoinCode || !this.currentPlayerName) {
            console.warn('Cannot rejoin game: missing join code or player name');
            return;
        }
        
        try {
            console.log('Rejoining game after reconnection:', this.currentJoinCode);
            await this.joinGame(this.currentJoinCode, this.currentPlayerName);
            console.log('Successfully rejoined game after reconnection');
        } catch (error) {
            console.error('Failed to rejoin game after reconnection:', error);
        }
    }

    private setupEventHandlers() {
        if (!this.connection) return;

        console.log('Setting up SignalR event handlers');

        this.connection.on('PlayerJoined', (playerId: string, playerName: string) => {
            console.log('PlayerJoined event received in SignalR service:', playerId, playerName);
            if (this.playerJoinedCallback) {
                console.log('Calling PlayerJoined callback');
                this.playerJoinedCallback(playerId, playerName);
            } else {
                console.warn('PlayerJoined callback not registered');
            }
        });

        this.connection.on('PlayerLeft', (playerId: string) => {
            console.log('PlayerLeft event received in SignalR service:', playerId);
            if (this.playerLeftCallback) {
                console.log('Calling PlayerLeft callback');
                this.playerLeftCallback(playerId);
            } else {
                console.warn('PlayerLeft callback not registered');
            }
        });

        this.connection.on('PlayerReconnected', (playerId: string, playerName: string) => {
            console.log('PlayerReconnected event received in SignalR service:', playerId, playerName);
            if (this.playerReconnectedCallback) {
                console.log('Calling PlayerReconnected callback');
                this.playerReconnectedCallback(playerId, playerName);
            } else {
                console.warn('PlayerReconnected callback not registered');
            }
        });

        this.connection.on('AnswerReceived', (playerId: string, playerName: string, answer: string) => {
            console.log('AnswerReceived event in SignalR service:', { playerId, playerName, answer });
            if (this.answerReceivedCallback) {
                this.answerReceivedCallback(playerId, playerName, answer);
            }
        });

        this.connection.on('RoundStarted', (prompt: string) => {
            console.log('RoundStarted event in SignalR service:', prompt);
            if (this.roundStartedCallback) {
                this.roundStartedCallback(prompt);
            }
        });

        this.connection.on('RoundEnded', () => {
            console.log('RoundEnded event received in SignalR service');
            if (this.roundEndedCallback) {
                this.roundEndedCallback();
            }
        });

        this.connection.on('AnswersRevealed', () => {
            console.log('AnswersRevealed event received in SignalR service');
            if (this.answersRevealedCallback) {
                this.answersRevealedCallback();
            }
        });
    }

    async disconnect() {
        if (this.connection) {
            await this.connection.stop();
            this.connection = null;
        }
        this.connectionPromise = null;
    }

    async joinGame(joinCode: string, playerName: string) {
        try {
            await this.ensureConnection();
            
            if (!this.connection) {
                throw new Error('No SignalR connection');
            }

            console.log('Joining game via SignalR:', joinCode, 'as', playerName);
            
            // Store current game context for reconnection
            this.currentJoinCode = joinCode;
            this.currentPlayerName = playerName;
            
            // Wait for the connection to be fully established
            if (this.connection.state !== HubConnectionState.Connected) {
                console.log('Waiting for connection to be established...');
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            // Retry logic for joining game
            let retries = 3;
            while (retries > 0) {
                try {
                    await this.connection.invoke('JoinGame', joinCode, playerName);
                    console.log('Successfully joined game:', joinCode);
                    return;
                } catch (error) {
                    console.warn(`Failed to join game (attempt ${4 - retries}/3):`, error);
                    retries--;
                    if (retries === 0) throw error;
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
        } catch (error) {
            console.error('Error joining game:', error);
            throw error;
        }
    }

    async startRound(joinCode: string, prompt: string) {
        await this.ensureConnection();
        
        if (!this.connection) {
            throw new Error('No SignalR connection');
        }

        try {
            console.log('Starting round via SignalR:', { joinCode, prompt, connectionState: this.connection.state });
            
            // Retry logic for starting round
            let retries = 3;
            while (retries > 0) {
                try {
                    await this.connection.invoke('StartRound', joinCode, prompt);
                    console.log('Round started successfully');
                    return;
                } catch (error) {
                    console.warn(`Failed to start round (attempt ${4 - retries}/3):`, error);
                    retries--;
                    if (retries === 0) throw error;
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
        } catch (error) {
            console.error('Error starting round:', error);
            throw error;
        }
    }

    async sendAnswer(joinCode: string, answer: string) {
        await this.ensureConnection();
        
        if (!this.connection) {
            throw new Error('No SignalR connection');
        }

        try {
            console.log('Sending answer:', { 
                joinCode, 
                answerLength: answer.length,
                answerSizeKB: Math.round(answer.length / 1024)
            });
            
            // Check if the answer is too large for SignalR
            // Increased limit to 10MB for better mobile support
            if (answer.length > 10000000) { // 10MB limit
                throw new Error('Drawing is too large to send. Please try a simpler drawing or use a smaller brush size.');
            }
            
            await this.connection.invoke('SubmitAnswer', joinCode, answer);
            console.log('Answer sent successfully');
        } catch (error) {
            console.error('Error sending answer:', error);
            throw error;
        }
    }

    async revealAnswers(joinCode: string) {
        await this.ensureConnection();
        
        if (!this.connection) {
            throw new Error('No SignalR connection');
        }

        try {
            console.log('Revealing answers:', joinCode);
            await this.connection.invoke('RevealAnswers', joinCode);
            console.log('Answers revealed successfully');
        } catch (error) {
            console.error('Error revealing answers:', error);
            throw error;
        }
    }

    onPlayerJoined(callback: (playerId: string, name: string) => void) {
        console.log('Registering PlayerJoined callback');
        this.playerJoinedCallback = callback;
        console.log('PlayerJoined callback registered successfully');
    }

    onPlayerLeft(callback: (playerId: string) => void) {
        console.log('Registering PlayerLeft callback');
        this.playerLeftCallback = callback;
        console.log('PlayerLeft callback registered successfully');
    }

    onPlayerReconnected(callback: (playerId: string, name: string) => void) {
        console.log('Registering PlayerReconnected callback');
        this.playerReconnectedCallback = callback;
        console.log('PlayerReconnected callback registered successfully');
    }

    onAnswerReceived(callback: (playerId: string, playerName: string, answer: string) => void) {
        console.log('Registering AnswerReceived callback');
        this.answerReceivedCallback = callback;
        console.log('AnswerReceived callback registered successfully');
    }

    onRoundStarted(callback: (prompt: string) => void) {
        console.log('Registering RoundStarted callback');
        this.roundStartedCallback = callback;
        console.log('RoundStarted callback registered successfully');
    }

    onRoundEnded(callback: () => void) {
        console.log('Registering RoundEnded callback');
        this.roundEndedCallback = callback;
        console.log('RoundEnded callback registered successfully');
    }

    onAnswersRevealed(callback: () => void) {
        console.log('Registering AnswersRevealed callback');
        this.answersRevealedCallback = callback;
        console.log('AnswersRevealed callback registered successfully');
    }

    async leaveGame(joinCode: string) {
        if (!this.connection) {
            throw new Error('SignalR connection not established');
        }

        try {
            // Clear reconnection context
            this.clearGameContext();
            
            // Try different method names that might be implemented on the server
            try {
                await this.connection.invoke('LeaveGame', joinCode);
            } catch (error) {
                console.warn('LeaveGame method not found, trying alternative method names...');
                try {
                    await this.connection.invoke('Leave', joinCode);
                } catch (error) {
                    console.warn('Leave method not found, trying RemovePlayer...');
                    await this.connection.invoke('RemovePlayer', joinCode);
                }
            }
            console.log('Successfully left game:', joinCode);
        } catch (error) {
            console.error('Error leaving game:', error);
            // Even if the server method fails, we should still disconnect from the hub
            await this.disconnect();
            throw error;
        }
    }

    private clearGameContext() {
        this.currentJoinCode = null;
        this.currentPlayerName = null;
        this.reconnectAttempts = 0;
        this.isReconnecting = false;
        
        if (this.reconnectionTimer) {
            clearTimeout(this.reconnectionTimer);
            this.reconnectionTimer = null;
        }
        
        console.log('Game context cleared, reconnection attempts stopped');
    }

    // Method to clear reconnection state manually
    clearReconnectionState() {
        this.reconnectAttempts = 0;
        this.isReconnecting = false;
        
        if (this.reconnectionTimer) {
            clearTimeout(this.reconnectionTimer);
            this.reconnectionTimer = null;
        }
        
        console.log('Reconnection state cleared manually');
    }

    // Method to handle refresh scenarios
    handleRefresh() {
        console.log('Handling page refresh - preserving connection state');
        
        // Store current connection state
        if (this.currentJoinCode && this.currentPlayerName) {
            sessionStorage.setItem('whiteboard_refresh_in_progress', 'true');
            sessionStorage.setItem('whiteboard_signalr_state', JSON.stringify({
                joinCode: this.currentJoinCode,
                playerName: this.currentPlayerName,
                timestamp: Date.now()
            }));
        }
        
        // Don't disconnect - let the connection persist through refresh
        // The connection will be restored automatically when the page reloads
    }

    // Method to restore connection state after refresh
    restoreFromRefresh() {
        const refreshState = sessionStorage.getItem('whiteboard_signalr_state');
        if (refreshState) {
            try {
                const state = JSON.parse(refreshState);
                console.log('Restoring SignalR state from refresh:', state);
                
                this.currentJoinCode = state.joinCode;
                this.currentPlayerName = state.playerName;
                
                // Clear the stored state
                sessionStorage.removeItem('whiteboard_signalr_state');
                
                return true;
            } catch (error) {
                console.error('Error restoring SignalR state from refresh:', error);
                sessionStorage.removeItem('whiteboard_signalr_state');
            }
        }
        return false;
    }

    // Method to check if we're currently connected
    isConnected(): boolean {
        return this.connection?.state === HubConnectionState.Connected;
    }

    // Method to get current connection state
    getConnectionState(): string {
        return this.connectionState;
    }

    // Method to check if we're currently reconnecting
    isReconnectingState(): boolean {
        return this.isReconnecting;
    }
}

export const signalRService = new SignalRService(); 