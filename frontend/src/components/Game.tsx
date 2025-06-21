import React, { useState, useEffect, useRef } from 'react';
import { useGame } from '../contexts/GameContext';
import { Answer } from '../types/game';
import { useNavigate } from 'react-router-dom';
import { getGame } from '../services/api';
import './Game.css';

export const Game: React.FC = () => {
    const {
        game,
        player,
        currentRound,
        answers,
        isReader,
        playersWhoSubmitted,
        startNewRound,
        submitAnswer,
        players,
        leaveGame,
        setGame
    } = useGame();
    const navigate = useNavigate();

    // Debug logging
    console.log('Game component render:', { 
        hasGame: !!game, 
        gameJoinCode: game?.joinCode, 
        hasPlayer: !!player, 
        playerName: player?.name,
        isReader 
    });

    // Debug player list changes
    useEffect(() => {
        console.log('Game component - players changed:', { 
            players, 
            playerCount: players.length, 
            isReader,
            playerNames: players.map(p => p.name),
            playerDetails: players.map(p => ({ id: p.playerId, name: p.name, isReader: p.isReader }))
        });
    }, [players, isReader]);

    // Debug current round changes
    useEffect(() => {
        console.log('Game component - currentRound changed:', { 
            hasCurrentRound: !!currentRound,
            prompt: currentRound?.prompt,
            isReader,
            playerName: player?.name
        });
    }, [currentRound, isReader, player?.name]);

    const [prompt, setPrompt] = useState('');
    const [answer, setAnswer] = useState('');
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [lastX, setLastX] = useState(0);
    const [lastY, setLastY] = useState(0);
    const [flippedCards, setFlippedCards] = useState<Set<number>>(new Set());
    const [selectedColor, setSelectedColor] = useState('#000000');
    const [brushSize, setBrushSize] = useState(2);
    const [drawingHistory, setDrawingHistory] = useState<ImageData[]>([]);
    const [currentStroke, setCurrentStroke] = useState<ImageData | null>(null);
    const [compressionStatus, setCompressionStatus] = useState<string>('');
    const [showColorPicker, setShowColorPicker] = useState(false);
    const [customColor, setCustomColor] = useState('#000000');
    const canvasInitializedRef = useRef(false);
    const [isUndoing, setIsUndoing] = useState(false);
    const [isClearing, setIsClearing] = useState(false);

    // Helper function to get canvas dimensions consistently
    const getCanvasDimensions = () => {
        const canvas = canvasRef.current;
        if (!canvas) return { width: 0, height: 0 };
        
        const rect = canvas.getBoundingClientRect();
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        const displayWidth = isMobile ? Math.min(rect.width, 250) : Math.min(rect.width, 300);
        const displayHeight = (displayWidth * 5) / 3;
        
        return { width: displayWidth, height: displayHeight };
    };

    // Helper function to check if device is iPhone specifically
    const isIPhone = () => {
        return /iPhone/i.test(navigator.userAgent);
    };

    const colors = [
        '#000000', // Black
        '#FF0000', // Red
        '#FFA500', // ORANGE
        '#FFFF00', // YELLOW
        '#008000', // GREEN
        '#0000FF', // BLUE
        '#800080', // PURPLE
        '#895129', // BROWN
        '#FFFFFF', // White
    ];

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Set up canvas with proper high-DPI support
        const setupCanvas = () => {
            // Only set up canvas if it hasn't been initialized yet
            if (canvasInitializedRef.current) {
                console.log('Canvas already initialized, skipping setup');
                return;
            }

            const rect = canvas.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            
            // Check if we're on a mobile device
            const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
            
            // Set the display size (CSS pixels) - smaller for mobile to reduce memory usage
            let displayWidth, displayHeight;
            
            if (isMobile) {
                // For mobile devices, use smaller canvas to reduce memory usage
                displayWidth = Math.min(rect.width, 250);
                displayHeight = (displayWidth * 5) / 3;
            } else {
                // For desktop, use larger canvas
                displayWidth = Math.min(rect.width, 300);
                displayHeight = (displayWidth * 5) / 3;
            }
            
            // For mobile devices, limit the DPI scaling to reduce memory usage
            const effectiveDpr = isMobile ? Math.min(dpr, 2) : dpr;
            
            // Set the actual size in memory (scaled up for high-DPI)
            canvas.width = displayWidth * effectiveDpr;
            canvas.height = displayHeight * effectiveDpr;
            
            // Scale the drawing context so everything draws at the correct size
            ctx.scale(effectiveDpr, effectiveDpr);
            
            // Set the CSS size
            canvas.style.width = displayWidth + 'px';
            canvas.style.height = displayHeight + 'px';
            
            // Set up drawing context
            ctx.lineWidth = brushSize;
            ctx.lineCap = 'round';
            ctx.strokeStyle = selectedColor;
            ctx.lineJoin = 'round';
            
            // Fill with white background
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, displayWidth, displayHeight);
            
            // Mark canvas as initialized
            canvasInitializedRef.current = true;
            
            console.log('Canvas setup completed:', { 
                isMobile, 
                displayWidth, 
                displayHeight, 
                effectiveDpr, 
                actualWidth: canvas.width, 
                actualHeight: canvas.height 
            });
        };
        
        setupCanvas();
        
        // Handle window resize
        const handleResize = () => {
            // Reset initialization flag on resize to allow re-setup
            canvasInitializedRef.current = false;
            setupCanvas();
        };
        
        window.addEventListener('resize', handleResize);
        window.addEventListener('orientationchange', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('orientationchange', handleResize);
        };
    }, []); // Only run once on mount

    // Update drawing context when brush size or color changes (without resetting canvas)
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Only update drawing context properties - DO NOT clear or reset the canvas
        ctx.lineWidth = brushSize;
        ctx.strokeStyle = selectedColor;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        console.log('Updated drawing context properties only:', { brushSize, selectedColor });
    }, [brushSize, selectedColor]);

    const getCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };

        const rect = canvas.getBoundingClientRect();
        let x: number, y: number;

        if ('touches' in e) {
            x = e.touches[0].clientX - rect.left;
            y = e.touches[0].clientY - rect.top;
        } else {
            x = e.clientX - rect.left;
            y = e.clientY - rect.top;
        }

        return { x, y };
    };

    const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        // Prevent default behavior for touch events
        if ('touches' in e) {
            e.preventDefault();
        }
        
        const { x, y } = getCoordinates(e);
        setIsDrawing(true);
        setLastX(x);
        setLastY(y);
        setCompressionStatus(''); // Clear any previous compression status

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Draw initial point
        ctx.beginPath();
        ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
        ctx.fillStyle = selectedColor;
        ctx.fill();

        // Save the current state before starting a new stroke
        const currentState = ctx.getImageData(0, 0, canvas.width, canvas.height);
        setCurrentStroke(currentState);
    };

    const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        if (!isDrawing) return;

        // Prevent default behavior for touch events
        if ('touches' in e) {
            e.preventDefault();
        }

        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const { x, y } = getCoordinates(e);

        // Simple line drawing setup
        ctx.lineWidth = brushSize;
        ctx.strokeStyle = selectedColor;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Draw the line
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(x, y);
        ctx.stroke();

        // Draw a circle at the current position to ensure no gaps
        ctx.beginPath();
        ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
        ctx.fillStyle = selectedColor;
        ctx.fill();

        setLastX(x);
        setLastY(y);
    };

    const stopDrawing = () => {
        if (!isDrawing) return;
        
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Save the completed stroke to history
        const completedStroke = ctx.getImageData(0, 0, canvas.width, canvas.height);
        setDrawingHistory(prev => [...prev, completedStroke]);
        setCurrentStroke(null);

        setIsDrawing(false);
    };

    const undoLastStroke = () => {
        const canvas = canvasRef.current;
        if (!canvas) {
            console.log('No canvas found for undo');
            return;
        }
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            console.log('No canvas context found for undo');
            return;
        }

        if (drawingHistory.length > 0) {
            setIsUndoing(true);
            console.log('Undoing last stroke, history length:', drawingHistory.length);
            
            try {
                // Remove the last stroke from history
                const newHistory = [...drawingHistory];
                newHistory.pop();
                setDrawingHistory(newHistory);

                // Clear the canvas using the actual canvas dimensions (not CSS dimensions)
                ctx.clearRect(0, 0, canvas.width, canvas.height);

                // Redraw all strokes except the last one
                if (newHistory.length > 0) {
                    ctx.putImageData(newHistory[newHistory.length - 1], 0, 0);
                    console.log('Redrew canvas with', newHistory.length, 'strokes');
                } else {
                    console.log('Canvas cleared - no strokes remaining');
                }
            } catch (error) {
                console.error('Error during undo:', error);
            } finally {
                // Reset visual feedback after a short delay
                setTimeout(() => setIsUndoing(false), 300);
            }
        } else {
            console.log('No strokes to undo');
        }
    };

    const clearCanvas = () => {
        const canvas = canvasRef.current;
        if (!canvas) {
            console.log('No canvas found for clear');
            return;
        }

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            console.log('No canvas context found for clear');
            return;
        }

        setIsClearing(true);
        console.log('Clearing canvas, history length:', drawingHistory.length);

        try {
            // Clear the canvas using the actual canvas dimensions (not CSS dimensions)
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // Fill with white background to ensure clean state
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            setDrawingHistory([]);
            setCurrentStroke(null);
            setCompressionStatus(''); // Clear any compression status
            
            console.log('Canvas cleared successfully');
        } catch (error) {
            console.error('Error during clear:', error);
        } finally {
            // Reset visual feedback after a short delay
            setTimeout(() => setIsClearing(false), 300);
        }
    };

    const handleSubmitAnswer = async () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        try {
            setCompressionStatus('Preparing drawing...');
            
            // Get the actual canvas dimensions using the helper function
            const { width: actualWidth, height: actualHeight } = getCanvasDimensions();
            
            console.log('Original canvas size:', { width: actualWidth, height: actualHeight });

            // Create a temporary canvas for compression
            const tempCanvas = document.createElement('canvas');
            const tempCtx = tempCanvas.getContext('2d');
            if (!tempCtx) return;

            // Adaptive sizing based on device and content
            let targetWidth, targetHeight;
            
            // Check if we're on a mobile device
            const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
            const isIPhoneDevice = isIPhone();
            
            if (isIPhoneDevice) {
                // For iPhone, use even smaller dimensions to avoid memory issues
                targetWidth = Math.min(actualWidth, 300);
                targetHeight = Math.min(actualHeight, 450);
            } else if (isMobile) {
                // For other mobile devices, use smaller dimensions to reduce memory usage
                targetWidth = Math.min(actualWidth, 400);
                targetHeight = Math.min(actualHeight, 600);
            } else {
                // For desktop, allow larger sizes
                targetWidth = Math.min(actualWidth, 500);
                targetHeight = Math.min(actualHeight, 800);
            }
            
            // Maintain aspect ratio
            const aspectRatio = actualWidth / actualHeight;
            if (targetWidth / targetHeight > aspectRatio) {
                targetWidth = targetHeight * aspectRatio;
            } else {
                targetHeight = targetWidth / aspectRatio;
            }
            
            tempCanvas.width = targetWidth;
            tempCanvas.height = targetHeight;
            
            console.log('Target canvas size:', { width: targetWidth, height: targetHeight });
            
            // Fill with white background
            tempCtx.fillStyle = 'white';
            tempCtx.fillRect(0, 0, targetWidth, targetHeight);
            
            // Enable image smoothing for better quality
            tempCtx.imageSmoothingEnabled = true;
            tempCtx.imageSmoothingQuality = 'high';
            
            // Draw the original canvas content scaled down
            tempCtx.drawImage(canvas, 0, 0, targetWidth, targetHeight);
            
            setCompressionStatus('Compressing image...');
            
            // Progressive compression strategy
            const compressionLevels = isIPhoneDevice ? [
                // iPhone-specific compression levels (more aggressive)
                { quality: 0.7, maxSize: 1000000 },  // 1MB - good quality
                { quality: 0.6, maxSize: 800000 },   // 800KB - acceptable quality
                { quality: 0.5, maxSize: 600000 },   // 600KB - lower quality
                { quality: 0.4, maxSize: 400000 },   // 400KB - minimum quality
                { quality: 0.3, maxSize: 300000 },   // 300KB - very low quality
                { quality: 0.2, maxSize: 200000 }    // 200KB - extremely low quality
            ] : [
                // Standard compression levels for other devices
                { quality: 0.9, maxSize: 2000000 },  // 2MB - high quality
                { quality: 0.8, maxSize: 1500000 },  // 1.5MB - good quality
                { quality: 0.7, maxSize: 1000000 },  // 1MB - acceptable quality
                { quality: 0.6, maxSize: 800000 },   // 800KB - lower quality
                { quality: 0.5, maxSize: 600000 },   // 600KB - minimum quality
                { quality: 0.4, maxSize: 400000 }    // 400KB - very low quality
            ];
            
            let base64Image = '';
            let compressionUsed = null;
            
            // Try each compression level
            for (const level of compressionLevels) {
                setCompressionStatus(`Compressing... (${Math.round(level.quality * 100)}% quality)`);
                base64Image = tempCanvas.toDataURL('image/jpeg', level.quality);
                const sizeKB = Math.round(base64Image.length / 1024);
                
                console.log(`Trying compression level ${level.quality} (${level.maxSize/1024}KB limit): ${sizeKB}KB`);
                
                if (base64Image.length <= level.maxSize) {
                    compressionUsed = level;
                    console.log(`Successfully compressed to ${sizeKB}KB with quality ${level.quality}`);
                    break;
                }
            }
            
            // If all compression levels fail, try with even smaller dimensions
            if (!compressionUsed) {
                setCompressionStatus('Reducing image size...');
                console.log('All compression levels failed, trying with smaller dimensions...');
                
                // Reduce dimensions by 50%
                const smallerWidth = targetWidth * 0.5;
                const smallerHeight = targetHeight * 0.5;
                
                tempCanvas.width = smallerWidth;
                tempCanvas.height = smallerHeight;
                
                // Fill with white background
                tempCtx.fillStyle = 'white';
                tempCtx.fillRect(0, 0, smallerWidth, smallerHeight);
                
                // Draw with smaller dimensions
                tempCtx.drawImage(canvas, 0, 0, smallerWidth, smallerHeight);
                
                // Try with lowest quality
                base64Image = tempCanvas.toDataURL('image/jpeg', isIPhoneDevice ? 0.15 : 0.3);
                const finalSizeKB = Math.round(base64Image.length / 1024);
                
                console.log(`Final attempt with smaller dimensions: ${finalSizeKB}KB`);
                
                const maxSize = isIPhoneDevice ? 200000 : 400000; // 200KB for iPhone, 400KB for others
                if (base64Image.length > maxSize) {
                    throw new Error('Drawing is too complex. Please try a simpler drawing or use a smaller brush size.');
                }
                
                compressionUsed = { quality: isIPhoneDevice ? 0.15 : 0.3, maxSize };
            }
            
            // Submit the compressed image
            setCompressionStatus('Sending drawing...');
            console.log(`Submitting drawing: ${Math.round(base64Image.length / 1024)}KB with quality ${compressionUsed.quality}`);
            await submitAnswer(base64Image);
            
            setCompressionStatus('Drawing submitted successfully!');
            setTimeout(() => setCompressionStatus(''), 2000); // Clear status after 2 seconds
            
            clearCanvas();
        } catch (error: any) {
            console.error('Error submitting drawing:', error);
            setCompressionStatus('');
            alert(error.message); // Show error message to user
        }
    };

    const handleStartRound = async () => {
        if (!prompt.trim()) {
            console.error('Cannot start round: Prompt is empty');
            return;
        }

        try {
            console.log('Handling start round with prompt:', prompt);
            await startNewRound(prompt);
            console.log('Round started successfully');
            setPrompt('');
        } catch (error) {
            console.error('Error starting round:', error);
        }
    };

    const handleCardClick = (answerId: number) => {
        setFlippedCards(prev => {
            const newSet = new Set(prev);
            if (newSet.has(answerId)) {
                newSet.delete(answerId);
            } else {
                newSet.add(answerId);
            }
            return newSet;
        });
    };

    const renderAnswerCard = (answer: Answer) => {
        const player = players.find(p => p.playerId === answer.playerId);
        const isFlipped = flippedCards.has(answer.answerId);
        
        return (
            <div 
                key={answer.answerId} 
                className="answer-card"
                onClick={() => handleCardClick(answer.answerId)}
            >
                <div className={`card-inner ${isFlipped ? 'flipped' : ''}`}>
                    <div className="card-front">
                        <p className="player-name">
                            {player ? player.name : answer.playerName || 'Unknown Player'}
                        </p>
                        <p>Click to see drawing</p>
                    </div>
                    <div className="card-back flex flex-col">
                        <h3 className="text-sm font-semibold text-purple-600 sticky top-0 bg-white p-1 z-10">
                            {player ? player.name : answer.playerName || 'Unknown Player'}
                        </h3>
                        <div className="flex-1 overflow-auto flex items-center justify-center">
                            {answer.content.startsWith('data:image') ? (
                                <img 
                                    src={answer.content} 
                                    alt={`Drawing by ${player ? player.name : answer.playerName || 'Unknown Player'}`}
                                    style={{ 
                                        width: '200px',
                                        height: '300px',
                                    }}
                                />
                            ) : (
                                <p>{answer.content}</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const handleLeaveGame = async () => {
        if (window.confirm('Are you sure you want to leave the game?')) {
            try {
                await leaveGame();
                navigate('/');
            } catch (error) {
                console.error('Error leaving game:', error);
                // Even if there's an error, we should still redirect to home
                navigate('/');
            }
        }
    };

    // Function to handle custom color selection
    const handleCustomColorChange = (color: string) => {
        console.log('Changing color to:', color, '- canvas content preserved');
        setCustomColor(color);
        setSelectedColor(color);
        // Note: This will trigger the useEffect above, but it only updates context properties
    };

    // Function to toggle color picker
    const toggleColorPicker = () => {
        setShowColorPicker(!showColorPicker);
    };

    // Close color picker when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Element;
            if (showColorPicker && !target.closest('.color-picker-container')) {
                setShowColorPicker(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showColorPicker]);

    return (
        <div className="min-h-screen bg-gray-50 p-4">
            <div className="max-w-7xl mx-auto">
                {!game || !player ? (
                    <div className="game-content bg-white rounded-xl shadow-lg p-4 sm:p-6">
                        <div className="text-center">
                            <h2 className="text-xl sm:text-2xl font-bold text-purple-600 mb-4">
                                Loading Game...
                            </h2>
                            <p className="text-sm sm:text-base text-gray-600">
                                Please wait while we load your game data.
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="game-content bg-white rounded-xl shadow-lg p-4 sm:p-6">
                        <div className="mb-4 sm:mb-6 flex justify-between items-center">
                            <div>
                                <h2 className="text-xl sm:text-2xl font-bold text-purple-600">
                                    Game Code: <span className="text-2xl sm:text-3xl">{game.joinCode}</span>
                                </h2>
                                <p className="text-sm sm:text-base text-gray-600">
                                    Player: {player.name} {isReader ? '(Reader)' : ''}
                                </p>
                            </div>
                            {!isReader && (
                                <button
                                    onClick={handleLeaveGame}
                                    className="bg-red-500 text-white px-4 py-2 rounded-md hover:bg-red-600 transition-colors text-sm sm:text-base"
                                >
                                    Leave Game
                                </button>
                            )}
                        </div>

                        {/* Active Players List - Only show for host/reader */}
                        {isReader && (
                            <div className="mb-4 sm:mb-6">
                                <h3 className="text-lg sm:text-xl font-semibold text-purple-600 mb-3 sm:mb-4">
                                    Active Players ({players.length})
                                    {currentRound && (
                                        <span className="text-sm font-normal text-gray-600 ml-2">
                                            • {playersWhoSubmitted.size}/{players.length} submitted
                                        </span>
                                    )}
                                </h3>
                                <div className="bg-gray-50 rounded-lg p-3 sm:p-4">
                                    {players.length === 0 ? (
                                        <p className="text-sm sm:text-base text-gray-600 text-center">
                                            No players have joined yet. Share the game code: <span className="font-mono font-bold text-purple-600">{game.joinCode}</span>
                                        </p>
                                    ) : (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
                                            {players.map((playerItem) => (
                                                <div 
                                                    key={playerItem.playerId} 
                                                    className={`player-list-item flex items-center gap-2 p-2 sm:p-3 rounded-md border ${
                                                        playerItem.playerId === player?.playerId 
                                                            ? 'bg-purple-100 border-purple-300' 
                                                            : 'bg-white border-gray-200'
                                                    }`}
                                                >
                                                    <div className={`player-status-indicator w-3 h-3 rounded-full ${
                                                        playerItem.playerId === player?.playerId 
                                                            ? 'bg-purple-500' 
                                                            : 'bg-green-500'
                                                    }`}></div>
                                                    <span className="text-sm sm:text-base font-medium text-gray-700">
                                                        {playerItem.name && playerItem.name.trim() ? playerItem.name : 'Unknown Player'}
                                                    </span>
                                                    {playerItem.isReader && (
                                                        <span className="player-badge bg-purple-100 text-purple-700">
                                                            Reader
                                                        </span>
                                                    )}
                                                    {playerItem.playerId === player?.playerId && (
                                                        <span className="player-badge bg-blue-100 text-blue-700">
                                                            You
                                                        </span>
                                                    )}
                                                    {playersWhoSubmitted.has(playerItem.playerId) && (
                                                        <span className="player-badge bg-green-100 text-green-700">
                                                            Submitted
                                                        </span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Connection Status Indicator */}
                        <div className="mb-4 sm:mb-6">
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                <span>Connected to game</span>
                                <span className="text-xs text-gray-500">• Players can reconnect for 5 minutes after disconnection</span>
                            </div>
                        </div>

                        {isReader ? (
                            <div className="mb-4 sm:mb-6">
                                <h3 className="text-lg sm:text-xl font-semibold text-purple-600 mb-3 sm:mb-4">Start a New Round</h3>
                                <div className="flex flex-col sm:flex-row gap-3">
                                    <input
                                        type="text"
                                        value={prompt}
                                        onChange={(e) => setPrompt(e.target.value)}
                                        placeholder="Enter the card content"
                                        className="input flex-1 text-sm sm:text-base"
                                    />
                                    <button
                                        onClick={handleStartRound}
                                        className="bg-purple-600 text-white px-6 py-3 rounded-md hover:bg-purple-700 transition-colors text-sm sm:text-base"
                                    >
                                        Start Round
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="mb-4 sm:mb-6">
                                <h3 className="text-lg sm:text-xl font-semibold text-purple-600 mb-3 sm:mb-4">Question:</h3>
                                {currentRound ? (
                                    <div>
                                        <p className="text-base sm:text-lg text-gray-700 mb-4">"{currentRound.prompt}"</p>
                                        {playersWhoSubmitted.has(player?.playerId || 0) ? (
                                            <div className="bg-green-50 p-3 sm:p-4 rounded-lg border border-green-200">
                                                <p className="text-sm sm:text-base text-green-700">You have already submitted your answer for this round!</p>
                                            </div>
                                        ) : (
                                            <>
                                                {/* Color Palette and Action Buttons (Above Canvas) */}
                                                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                                    <div className="flex flex-wrap gap-1 items-center">
                                                        {colors.map((color) => (
                                                            <button
                                                                key={color}
                                                                onClick={() => setSelectedColor(color)}
                                                                className={`w-7 h-7 rounded-full border-2 transition-all ${
                                                                    selectedColor === color
                                                                        ? 'border-purple-600 scale-110 shadow-md'
                                                                        : 'border-gray-300 hover:scale-105'
                                                                }`}
                                                                style={{ backgroundColor: color }}
                                                                title={color}
                                                            />
                                                        ))}
                                                        {/* Custom Color Picker Button */}
                                                        <button
                                                            onClick={toggleColorPicker}
                                                            className={`w-7 h-7 rounded-full border-2 transition-all flex items-center justify-center ${
                                                                showColorPicker
                                                                    ? 'border-purple-600 scale-110 shadow-md bg-gradient-to-br from-purple-400 to-pink-400'
                                                                    : 'border-gray-300 hover:scale-105 bg-gradient-to-br from-gray-100 to-gray-200'
                                                            }`}
                                                            title="Custom color"
                                                        >
                                                            <svg className="w-4 h-4 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
                                                                <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                                                            </svg>
                                                        </button>
                                                        {showColorPicker && (
                                                            <div className="color-picker-container bg-white rounded-lg border p-3 shadow-lg absolute z-20 mt-2">
                                                                <div className="flex flex-col gap-2">
                                                                    <div className="flex items-center justify-between">
                                                                        <label className="text-xs font-medium text-gray-700">
                                                                            Custom Color
                                                                        </label>
                                                                        <button
                                                                            onClick={() => setShowColorPicker(false)}
                                                                            className="text-gray-400 hover:text-gray-600 transition-colors"
                                                                            title="Close color picker"
                                                                        >
                                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                                            </svg>
                                                                        </button>
                                                                    </div>
                                                                    <div className="flex items-center gap-2">
                                                                        <input
                                                                            type="color"
                                                                            value={customColor}
                                                                            onChange={(e) => handleCustomColorChange(e.target.value)}
                                                                            className="w-8 h-8 rounded border border-gray-300 cursor-pointer"
                                                                            title="Choose custom color"
                                                                        />
                                                                        <input
                                                                            type="text"
                                                                            value={customColor}
                                                                            onChange={(e) => handleCustomColorChange(e.target.value)}
                                                                            className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-500"
                                                                            placeholder="#000000"
                                                                            pattern="^#[0-9A-Fa-f]{6}$"
                                                                            title="Enter hex color code"
                                                                        />
                                                                    </div>
                                                                    <div className="flex gap-1">
                                                                        {/* Quick Color Presets */}
                                                                        {['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF', '#FFA500', '#800080', '#008000', '#FFC0CB'].map((color) => (
                                                                            <button
                                                                                key={color}
                                                                                onClick={() => handleCustomColorChange(color)}
                                                                                className="w-4 h-4 rounded border border-gray-300 hover:scale-110 transition-transform"
                                                                                style={{ backgroundColor: color }}
                                                                                title={color}
                                                                            />
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="flex gap-2 ml-auto">
                                                        <button
                                                            onClick={undoLastStroke}
                                                            disabled={drawingHistory.length === 0 || isUndoing}
                                                            className={`p-2 rounded-full shadow transition-all border ${
                                                                drawingHistory.length === 0 || isUndoing
                                                                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed border-gray-200'
                                                                    : 'bg-white text-purple-600 hover:bg-purple-50 hover:scale-105 border-purple-200'
                                                            } ${isUndoing ? 'animate-pulse' : ''}`}
                                                            title={drawingHistory.length === 0 ? "No strokes to undo" : "Undo last stroke"}
                                                        >
                                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                                                            </svg>
                                                        </button>
                                                        <button
                                                            onClick={clearCanvas}
                                                            disabled={isClearing}
                                                            className={`p-2 rounded-full shadow transition-all border ${
                                                                isClearing
                                                                    ? 'bg-red-200 text-red-400 cursor-not-allowed border-red-200'
                                                                    : 'bg-white text-red-600 hover:bg-red-50 hover:scale-105 border-red-200'
                                                            } ${isClearing ? 'animate-pulse' : ''}`}
                                                            title="Clear canvas"
                                                        >
                                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                            </svg>
                                                        </button>
                                                    </div>
                                                </div>
                                                {/* Drawing Canvas */}
                                                <div className="relative mb-2">
                                                    <canvas
                                                        ref={canvasRef}
                                                        className="border rounded-lg bg-white shadow-sm w-full"
                                                        onMouseDown={startDrawing}
                                                        onMouseMove={draw}
                                                        onMouseUp={stopDrawing}
                                                        onMouseLeave={stopDrawing}
                                                        onTouchStart={startDrawing}
                                                        onTouchMove={draw}
                                                        onTouchEnd={stopDrawing}
                                                        style={{
                                                            touchAction: 'none',
                                                            WebkitTouchCallout: 'none',
                                                            WebkitUserSelect: 'none',
                                                            userSelect: 'none',
                                                            msTouchAction: 'none',
                                                            maxWidth: '100%',
                                                            height: 'auto',
                                                        }}
                                                    />
                                                    {/* Compression Status */}
                                                    {compressionStatus && (
                                                        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg z-10">
                                                            <p className="text-sm font-medium">
                                                                {compressionStatus}
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>
                                                {/* Brush Size Slider & Submit Button */}
                                                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-4">
                                                    {/* Brush Size Slider */}
                                                    <div className="flex items-center gap-3 w-full sm:w-auto">
                                                        <div className="w-full max-w-xs h-2 bg-gray-200 rounded-full">
                                                            <input
                                                                type="range"
                                                                min="1"
                                                                max="20"
                                                                value={brushSize}
                                                                onChange={(e) => setBrushSize(Number(e.target.value))}
                                                                className="w-full h-2 bg-transparent appearance-none cursor-pointer"
                                                                style={{
                                                                    background: `linear-gradient(to right, #8b5cf6 0%, #8b5cf6 ${(brushSize - 1) / 19 * 100}%, #e5e7eb ${(brushSize - 1) / 19 * 100}%, #e5e7eb 100%)`
                                                                }}
                                                            />
                                                        </div>
                                                        <span className="text-sm text-gray-600 font-medium whitespace-nowrap">
                                                            {brushSize}px
                                                        </span>
                                                    </div>
                                                    {/* Submit Button */}
                                                    <button
                                                        onClick={handleSubmitAnswer}
                                                        className="bg-purple-600 text-white px-8 py-3 rounded-lg hover:bg-purple-700 transition-colors text-base font-medium shadow-lg hover:shadow-xl transform hover:scale-105 w-full sm:w-auto"
                                                    >
                                                        Submit Drawing
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                ) : (
                                    <p className="text-sm sm:text-base text-gray-600">Waiting for the reader to start a round...</p>
                                )}
                            </div>
                        )}

                        {isReader && answers.length > 0 && (
                            <div className="mt-4 sm:mt-6">
                                <h3 className="text-lg sm:text-xl font-semibold text-purple-600 mb-3 sm:mb-4">Answers</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                                    {answers.map((answer) => renderAnswerCard(answer))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}; 