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
            playerNames: players.map(p => p.name)
        });
    }, [players, isReader]);

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
            const rect = canvas.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            
            // Set the display size (CSS pixels)
            const displayWidth = Math.min(rect.width, 300);
            const displayHeight = (displayWidth * 5) / 3;
            
            // Set the actual size in memory (scaled up for high-DPI)
            canvas.width = displayWidth * dpr;
            canvas.height = displayHeight * dpr;
            
            // Scale the drawing context so everything draws at the correct size
            ctx.scale(dpr, dpr);
            
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
        };
        
        setupCanvas();
        
        // Handle window resize
        const handleResize = () => {
            setupCanvas();
        };
        
        window.addEventListener('resize', handleResize);
        window.addEventListener('orientationchange', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('orientationchange', handleResize);
        };
    }, [brushSize, selectedColor]);

    // Update drawing context when brush size or color changes
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Update drawing context properties
        ctx.lineWidth = brushSize;
        ctx.strokeStyle = selectedColor;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
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
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        if (drawingHistory.length > 0) {
            // Remove the last stroke from history
            const newHistory = [...drawingHistory];
            newHistory.pop();
            setDrawingHistory(newHistory);

            // Clear the canvas
            const rect = canvas.getBoundingClientRect();
            const displayWidth = Math.min(rect.width, 300);
            const displayHeight = (displayWidth * 5) / 3;
            ctx.clearRect(0, 0, displayWidth, displayHeight);

            // Redraw all strokes except the last one
            if (newHistory.length > 0) {
                ctx.putImageData(newHistory[newHistory.length - 1], 0, 0);
            }
        }
    };

    const clearCanvas = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const rect = canvas.getBoundingClientRect();
        const displayWidth = Math.min(rect.width, 300);
        const displayHeight = (displayWidth * 5) / 3;

        ctx.clearRect(0, 0, displayWidth, displayHeight);
        setDrawingHistory([]);
        setCurrentStroke(null);
    };

    const handleSubmitAnswer = async () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        try {
            // Create a temporary canvas for compression
            const tempCanvas = document.createElement('canvas');
            const tempCtx = tempCanvas.getContext('2d');
            if (!tempCtx) return;

            // Set a reasonable size for the compressed image (300x500 is good for drawings)
            const targetWidth = 300;
            const targetHeight = 500;
            
            tempCanvas.width = targetWidth;
            tempCanvas.height = targetHeight;
            
            // Fill with white background
            tempCtx.fillStyle = 'white';
            tempCtx.fillRect(0, 0, targetWidth, targetHeight);
            
            // Draw the original canvas content scaled down
            tempCtx.drawImage(canvas, 0, 0, targetWidth, targetHeight);
            
            // Convert to base64 with compression
            const base64Image = tempCanvas.toDataURL('image/jpeg', 0.8); // Use JPEG with 80% quality for better compression
            
            console.log('Submitting compressed image, size:', Math.round(base64Image.length / 1024), 'KB');
            
            // Check if the image is still too large (should be under 1MB for SignalR)
            if (base64Image.length > 1000000) { // 1MB limit
                // Try with even more compression
                const moreCompressedImage = tempCanvas.toDataURL('image/jpeg', 0.5); // 50% quality
                console.log('Trying more compression, size:', Math.round(moreCompressedImage.length / 1024), 'KB');
                
                if (moreCompressedImage.length > 1000000) {
                    alert('Drawing is too large. Please try drawing with fewer details or a smaller brush size.');
                    return;
                }
                
                await submitAnswer(moreCompressedImage);
            } else {
                await submitAnswer(base64Image);
            }
            
            clearCanvas();
        } catch (error: any) {
            console.error('Error submitting drawing:', error);
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
                            {isReader && (
                                <button
                                    onClick={async () => {
                                        try {
                                            console.log('Manual refresh - fetching game data...');
                                            const updatedGame = await getGame(game.joinCode);
                                            console.log('Manual refresh - updated game data:', updatedGame);
                                            setGame({
                                                ...updatedGame,
                                                currentRound: game?.currentRound || null
                                            });
                                        } catch (error) {
                                            console.error('Manual refresh error:', error);
                                        }
                                    }}
                                    className="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 transition-colors text-sm sm:text-base ml-2"
                                >
                                    Refresh Players
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
                                                        {playerItem.name}
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
                                                <div className="mb-4">
                                                    <div className="flex flex-wrap gap-2 mb-4">
                                                        {colors.map((color) => (
                                                            <button
                                                                key={color}
                                                                onClick={() => setSelectedColor(color)}
                                                                className={`w-8 h-8 rounded-full border-2 ${
                                                                    selectedColor === color ? 'border-purple-600' : 'border-gray-300'
                                                                }`}
                                                                style={{ backgroundColor: color }}
                                                                title={color}
                                                            />
                                                        ))}
                                                    </div>
                                                    <div className="mb-4">
                                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                                            Brush Size
                                                        </label>
                                                        <input
                                                            type="range"
                                                            min="1"
                                                            max="20"
                                                            value={brushSize}
                                                            onChange={(e) => setBrushSize(Number(e.target.value))}
                                                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                                                        />
                                                    </div>
                                                    <div className="relative canvas-container">
                                                        <canvas
                                                            ref={canvasRef}
                                                            className="border rounded-lg bg-white shadow-sm"
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
                                                                msTouchAction: 'none'
                                                            }}
                                                        />
                                                    </div>
                                                    <div className="flex flex-col sm:flex-row gap-3 mt-4">
                                                        <button
                                                            onClick={clearCanvas}
                                                            className="bg-purple-100 text-purple-600 px-6 py-3 rounded-md hover:bg-purple-200 transition-colors text-sm sm:text-base"
                                                        >
                                                            Clear
                                                        </button>
                                                        <button
                                                            onClick={undoLastStroke}
                                                            className="bg-purple-100 text-purple-600 px-6 py-3 rounded-md hover:bg-purple-200 transition-colors text-sm sm:text-base"
                                                            disabled={drawingHistory.length === 0}
                                                        >
                                                            Undo
                                                        </button>
                                                        <button
                                                            onClick={handleSubmitAnswer}
                                                            className="bg-purple-600 text-white px-6 py-3 rounded-md hover:bg-purple-700 transition-colors text-sm sm:text-base"
                                                        >
                                                            Submit Drawing
                                                        </button>
                                                    </div>
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