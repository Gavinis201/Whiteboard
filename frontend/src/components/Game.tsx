import React, { useState, useEffect, useRef } from 'react';
import { useGame } from '../contexts/GameContext';
import { Answer } from '../types/game';
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
        players
    } = useGame();

    const [prompt, setPrompt] = useState('');
    const [answer, setAnswer] = useState('');
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [lastX, setLastX] = useState(0);
    const [lastY, setLastY] = useState(0);
    const [flippedCards, setFlippedCards] = useState<Set<number>>(new Set());

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Set up canvas
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#000000';

        // Set canvas size
        const resizeCanvas = () => {
            canvas.width = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;
        };
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        // Prevent default touch behaviors
        const preventDefault = (e: TouchEvent) => {
            e.preventDefault();
        };

        // Add touch event listeners
        canvas.addEventListener('touchstart', preventDefault, { passive: false });
        canvas.addEventListener('touchmove', preventDefault, { passive: false });
        canvas.addEventListener('touchend', preventDefault, { passive: false });

        return () => {
            window.removeEventListener('resize', resizeCanvas);
            canvas.removeEventListener('touchstart', preventDefault);
            canvas.removeEventListener('touchmove', preventDefault);
            canvas.removeEventListener('touchend', preventDefault);
        };
    }, []);

    const getCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };

        const rect = canvas.getBoundingClientRect();
        let x: number, y: number;

        if ('touches' in e) {
            // Prevent default touch behavior
            e.preventDefault();
            x = e.touches[0].clientX - rect.left;
            y = e.touches[0].clientY - rect.top;
        } else {
            x = e.clientX - rect.left;
            y = e.clientY - rect.top;
        }

        return { x, y };
    };

    const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        const { x, y } = getCoordinates(e);
        setIsDrawing(true);
        setLastX(x);
        setLastY(y);
    };

    const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        if (!isDrawing) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const { x, y } = getCoordinates(e);

        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(x, y);
        ctx.stroke();

        setLastX(x);
        setLastY(y);
    };

    const stopDrawing = () => {
        setIsDrawing(false);
    };

    const clearCanvas = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
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
                    <div className="card-back">
                        {answer.content.startsWith('data:image') ? (
                            <img 
                                src={answer.content} 
                                alt={`Drawing by ${player ? player.name : answer.playerName || 'Unknown Player'}`}
                            />
                        ) : (
                            <p>{answer.content}</p>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-gray-50 p-4">
            <div className="max-w-7xl mx-auto">
                <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6">
                    <div className="mb-4 sm:mb-6">
                        <h2 className="text-xl sm:text-2xl font-bold text-primary-600">
                            Game Code: {game?.joinCode}
                        </h2>
                        <p className="text-sm sm:text-base text-gray-600">
                            Player: {player?.name} {isReader ? '(Reader)' : ''}
                        </p>
                    </div>

                    {isReader ? (
                        <div className="mb-4 sm:mb-6">
                            <h3 className="text-lg sm:text-xl font-semibold text-gray-800 mb-3 sm:mb-4">Start a New Round</h3>
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
                                    className="btn btn-primary text-sm sm:text-base"
                                >
                                    Start Round
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="mb-4 sm:mb-6">
                            <h3 className="text-lg sm:text-xl font-semibold text-gray-800 mb-3 sm:mb-4">Current Round</h3>
                            {currentRound ? (
                                <div>
                                    <p className="text-base sm:text-lg text-gray-700 mb-4">{currentRound.prompt}</p>
                                    {playersWhoSubmitted.has(player?.playerId || 0) ? (
                                        <div className="bg-green-50 p-3 sm:p-4 rounded-lg border border-green-200">
                                            <p className="text-sm sm:text-base text-green-700">You have already submitted your answer for this round!</p>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="mb-4">
                                                <canvas
                                                    ref={canvasRef}
                                                    className="border rounded-lg w-full h-48 sm:h-64 bg-white shadow-sm"
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
                                            <div className="flex flex-col sm:flex-row gap-3">
                                                <button
                                                    onClick={clearCanvas}
                                                    className="btn btn-secondary text-sm sm:text-base"
                                                >
                                                    Clear
                                                </button>
                                                <button
                                                    onClick={handleSubmitAnswer}
                                                    className="btn btn-primary text-sm sm:text-base"
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
                            <h3 className="text-lg sm:text-xl font-semibold text-gray-800 mb-3 sm:mb-4">Answers</h3>
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