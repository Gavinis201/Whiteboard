import React, { useState, useEffect, useRef } from 'react';
import { useGame } from '../contexts/GameContext';
import { Answer } from '../types/game';
import { useNavigate } from 'react-router-dom';
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
        leaveGame
    } = useGame();
    const navigate = useNavigate();

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

        // Set up canvas
        ctx.lineWidth = brushSize;
        ctx.lineCap = 'round';
        ctx.strokeStyle = selectedColor;
        ctx.lineJoin = 'round';

        // Set canvas size to match card dimensions
        const resizeCanvas = () => {
            const rect = canvas.getBoundingClientRect();
            const targetWidth = Math.min(rect.width, 300); // Set max width to 300px
            const targetHeight = (targetWidth * 5) / 3; // Calculate height based on 3:5 ratio
            
            canvas.width = targetWidth;
            canvas.height = targetHeight;
            
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        };
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        return () => {
            window.removeEventListener('resize', resizeCanvas);
        };
    }, []);

    const getCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };

        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        let x: number, y: number;

        if ('touches' in e) {
            x = (e.touches[0].clientX - rect.left) * scaleX;
            y = (e.touches[0].clientY - rect.top) * scaleY;
        } else {
            x = (e.clientX - rect.left) * scaleX;
            y = (e.clientY - rect.top) * scaleY;
        }

        return { x, y };
    };

    const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
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
            ctx.clearRect(0, 0, canvas.width, canvas.height);

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

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        setDrawingHistory([]);
        setCurrentStroke(null);
    };

    const handleSubmitAnswer = async () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        // Convert canvas to base64 image
        const base64Image = canvas.toDataURL('image/png');
        
        try {
            await submitAnswer(base64Image);
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
                <div className="game-content bg-white rounded-xl shadow-lg p-4 sm:p-6">
                    <div className="mb-4 sm:mb-6 flex justify-between items-center">
                        <div>
                            <h2 className="text-xl sm:text-2xl font-bold text-purple-600">
                                Game Code: <span className="text-2xl sm:text-3xl">{game?.joinCode}</span>
                            </h2>
                            <p className="text-sm sm:text-base text-gray-600">
                                Player: {player?.name} {isReader ? '(Reader)' : ''}
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
                                                <div className="relative">
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
                                                            width: '300px',
                                                            height: '500px',
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
            </div>
        </div>
    );
}; 