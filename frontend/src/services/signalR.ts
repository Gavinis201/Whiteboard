import { HubConnectionBuilder, HubConnection, LogLevel, HttpTransportType } from '@microsoft/signalr';

class SignalRService {
    private connection: HubConnection | null = null;
    private connectionPromise: Promise<void> | null = null;
    private playerJoinedCallback: ((playerId: string, name: string) => void) | null = null;
    private playerLeftCallback: ((playerId: string) => void) | null = null;
    private answerReceivedCallback: ((playerId: string, playerName: string, answer: string) => void) | null = null;
    private roundStartedCallback: ((prompt: string) => void) | null = null;
    private roundEndedCallback: (() => void) | null = null;
    private answersRevealedCallback: (() => void) | null = null;

    private async ensureConnection() {
        if (this.connection?.state === 'Connected') {
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
        try {
            console.log('Attempting to connect to SignalR hub...');
            
            if (this.connection) {
                try {
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
                        if (retryContext.elapsedMilliseconds < 30000) {
                            return Math.random() * 5000;
                        }
                        return null;
                    }
                })
                .build();

            this.connection.onclose((error) => {
                console.error('SignalR connection closed:', error);
                this.connectionPromise = null;
                // Attempt to reconnect after a delay
                setTimeout(() => {
                    if (!this.connection || this.connection.state !== 'Connected') {
                        this.connect().catch(err => console.error('Reconnection failed:', err));
                    }
                }, 5000);
            });

            this.connection.onreconnecting((error) => {
                console.log('SignalR reconnecting:', error);
            });

            this.connection.onreconnected((connectionId) => {
                console.log('SignalR reconnected:', connectionId);
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
        } catch (err) {
            console.error('Error while establishing SignalR connection:', err);
            this.connection = null;
            this.connectionPromise = null;
            throw err;
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
            
            // Wait for the connection to be fully established
            if (this.connection.state !== 'Connected') {
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
            console.log('Starting round via SignalR:', { joinCode, prompt });
            await this.connection.invoke('StartRound', joinCode, prompt);
            console.log('Round started successfully');
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
            if (answer.length > 50000000) { // 50MB limit
                throw new Error('Answer is too large to send. Please try a simpler drawing.');
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
}

export const signalRService = new SignalRService(); 