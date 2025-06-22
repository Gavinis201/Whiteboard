import React, { useState, useEffect, useRef } from 'react';
import { useGame } from '../contexts/GameContext';
import { Answer } from '../types/game';
import { useNavigate } from 'react-router-dom';
import './Game.css';

export const Game: React.FC = () => {
    // FIX: Removed `setGame` which is not provided by the context and was causing errors.
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
    } = useGame();
    const navigate = useNavigate();

    const [prompt, setPrompt] = useState('');
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [lastX, setLastX] = useState(0);
    const [lastY, setLastY] = useState(0);
    const [flippedCards, setFlippedCards] = useState<Set<number>>(new Set());
    const [selectedColor, setSelectedColor] = useState('#000000');
    const [brushSize, setBrushSize] = useState(2);
    const [drawingHistory, setDrawingHistory] = useState<ImageData[]>([]);
    const [compressionStatus, setCompressionStatus] = useState<string>('');
    const [showColorPicker, setShowColorPicker] = useState(false);
    const [customColor, setCustomColor] = useState('#000000');
    const canvasInitializedRef = useRef(false);
    const [isUndoing, setIsUndoing] = useState(false);
    const [isClearing, setIsClearing] = useState(false);

    const isIPhone = () => /iPhone/i.test(navigator.userAgent);

    const colors = ['#000000', '#FF0000', '#FFA500', '#FFFF00', '#008000', '#0000FF', '#800080', '#895129', '#FFFFFF'];

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const setupCanvas = () => {
            if (canvasInitializedRef.current) return;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            const rect = canvas.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
            const displayWidth = isMobile ? Math.min(rect.width, 250) : Math.min(rect.width, 300);
            const displayHeight = (displayWidth * 5) / 3;
            const effectiveDpr = isMobile ? Math.min(dpr, 2) : dpr;
            canvas.width = displayWidth * effectiveDpr;
            canvas.height = displayHeight * effectiveDpr;
            ctx.scale(effectiveDpr, effectiveDpr);
            canvas.style.width = `${displayWidth}px`;
            canvas.style.height = `${displayHeight}px`;
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, displayWidth, displayHeight);
            canvasInitializedRef.current = true;
        };
        setupCanvas();
        window.addEventListener('resize', setupCanvas);
        return () => window.removeEventListener('resize', setupCanvas);
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.lineWidth = brushSize;
        ctx.strokeStyle = selectedColor;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
    }, [brushSize, selectedColor]);

    const getCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        return { x: clientX - rect.left, y: clientY - rect.top };
    };

    const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
        if ('touches' in e) e.preventDefault();
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!ctx || !canvas) return;
        const { x, y } = getCoordinates(e);
        setIsDrawing(true);
        setLastX(x);
        setLastY(y);
        ctx.beginPath();
        ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
        ctx.fillStyle = selectedColor;
        ctx.fill();
    };

    const draw = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isDrawing) return;
        if ('touches' in e) e.preventDefault();
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
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
        if (!isDrawing) return;
        setIsDrawing(false);
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!ctx || !canvas) return;
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        setDrawingHistory(prev => [...prev, imageData]);
    };

    const undoLastStroke = () => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!ctx || !canvas || drawingHistory.length === 0) return;
        setIsUndoing(true);
        const newHistory = drawingHistory.slice(0, -1);
        setDrawingHistory(newHistory);
        const displayWidth = parseFloat(canvas.style.width || '0');
        const displayHeight = parseFloat(canvas.style.height || '0');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, displayWidth, displayHeight);
        if (newHistory.length > 0) {
            ctx.putImageData(newHistory[newHistory.length - 1], 0, 0);
        }
        setTimeout(() => setIsUndoing(false), 200);
    };

    const clearCanvas = () => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!ctx || !canvas) return;
        setIsClearing(true);
        const displayWidth = parseFloat(canvas.style.width || '0');
        const displayHeight = parseFloat(canvas.style.height || '0');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, displayWidth, displayHeight);
        setDrawingHistory([]);
        setTimeout(() => setIsClearing(false), 200);
    };

    const handleSubmitAnswer = async () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        setCompressionStatus('Preparing...');
        try {
            const tempCanvas = document.createElement('canvas');
            const tempCtx = tempCanvas.getContext('2d');
            if (!tempCtx) return;
            tempCanvas.width = canvas.width;
            tempCanvas.height = canvas.height;
            tempCtx.fillStyle = 'white';
            tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
            tempCtx.drawImage(canvas, 0, 0);
            setCompressionStatus('Compressing...');
            const quality = isIPhone() ? 0.7 : 0.85;
            const base64Image = tempCanvas.toDataURL('image/jpeg', quality);
            if (base64Image.length > 1000000) { throw new Error('Drawing is too large.'); }
            setCompressionStatus('Sending...');
            await submitAnswer(base64Image);
            clearCanvas();
        } catch (error: any) {
            alert(error.message);
        } finally {
            setCompressionStatus('');
        }
    };

    const handleStartRound = async () => {
        if (!prompt.trim() || !game) return;
        await startNewRound(prompt);
        setPrompt('');
    };

    const handleCardClick = (answerId: number) => {
        setFlippedCards(prev => {
            const newSet = new Set(prev);
            newSet.has(answerId) ? newSet.delete(answerId) : newSet.add(answerId);
            return newSet;
        });
    };
    
    const handleLeaveGame = async () => {
        if (window.confirm('Are you sure you want to leave?')) {
            await leaveGame();
            navigate('/');
        }
    };

    const renderAnswerCard = (answer: Answer) => (
        <div key={answer.answerId} className="answer-card" onClick={() => handleCardClick(answer.answerId)}>
            <div className={`card-inner ${flippedCards.has(answer.answerId) ? 'flipped' : ''}`}>
                <div className="card-front"><p className="player-name">{answer.playerName || 'Unknown'}</p></div>
                <div className="card-back">
                    <h3 className="text-sm font-semibold">{answer.playerName || 'Unknown'}</h3>
                    <img src={answer.content} alt={`Drawing by ${answer.playerName}`} className="w-full h-auto" />
                </div>
            </div>
        </div>
    );

    if (!game || !player) {
        return <div className="text-center p-8">Loading Game...</div>;
    }

    return (
        <div className="min-h-screen bg-gray-50 p-4">
            <div className="max-w-7xl mx-auto bg-white rounded-xl shadow-lg p-4 sm:p-6">
                <div className="mb-6 flex justify-between items-center">
                    <div>
                        <h2 className="text-xl sm:text-2xl font-bold text-purple-600">
                            Game Code: <span className="text-2xl sm:text-3xl font-mono">{game.joinCode}</span>
                        </h2>
                        <p className="text-gray-600">Player: {player.name} {isReader && '(Reader)'}</p>
                    </div>
                    {!isReader && (
                        <button onClick={handleLeaveGame} className="bg-red-500 text-white px-4 py-2 rounded-md hover:bg-red-600">
                            Leave Game
                        </button>
                    )}
                </div>

                {isReader && (
                    <div className="mb-6">
                        <h3 className="text-xl font-semibold text-purple-600 mb-4">
                            Active Players ({players.length})
                            {currentRound && (
                                <span className="text-sm font-normal text-gray-600 ml-2">
                                    {/* FIX: Correctly calculate the number of players who should submit */}
                                    • {playersWhoSubmitted.size} / {players.filter(p => !p.isReader).length} submitted
                                </span>
                            )}
                        </h3>
                        <div className="bg-gray-50 rounded-lg p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {players.map(p => (
                                <div key={p.playerId} className="flex items-center gap-2 p-2 rounded-md bg-white border">
                                    <div className={`w-3 h-3 rounded-full ${p.isReader ? 'bg-purple-500' : 'bg-green-500'}`}></div>
                                    <span className="font-medium">{p.name}</span>
                                    {playersWhoSubmitted.has(p.playerId) && (
                                        <span className="ml-auto text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Submitted</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {isReader ? (
                    <div>
                        <div className="mb-6">
                            <h3 className="text-xl font-semibold text-purple-600 mb-2">Start a New Round</h3>
                            <div className="flex gap-3">
                                <input type="text" value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Enter the prompt" className="input flex-1" />
                                <button onClick={handleStartRound} className="bg-purple-600 text-white px-6 py-2 rounded-md hover:bg-purple-700">Start Round</button>
                            </div>
                        </div>
                        {answers.length > 0 && (
                            <div>
                                <h3 className="text-xl font-semibold text-purple-600 mb-4">Answers</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {answers.map(renderAnswerCard)}
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div>
                        <h3 className="text-xl font-semibold text-purple-600 mb-2">Question:</h3>
                        {currentRound ? (
                            <div>
                                <p className="text-lg text-gray-800 mb-4">"{currentRound.prompt}"</p>
                                {playersWhoSubmitted.has(player.playerId) ? (
                                    <div className="bg-green-50 text-green-700 p-4 rounded-lg">You have submitted your drawing! Waiting for others.</div>
                                ) : (
                                    <>
                                        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                            <div className="flex flex-wrap gap-1">
                                                {colors.map(color => (
                                                    <button key={color} onClick={() => setSelectedColor(color)} className={`w-7 h-7 rounded-full border-2 ${selectedColor === color ? 'border-purple-600 scale-110' : 'border-transparent'}`} style={{ backgroundColor: color }} />
                                                ))}
                                            </div>
                                            <div className="flex gap-2">
                                                <button onClick={undoLastStroke} disabled={drawingHistory.length === 0 || isUndoing} className="p-2 rounded-full bg-gray-200 disabled:opacity-50"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg></button>
                                                <button onClick={clearCanvas} disabled={isClearing} className="p-2 rounded-full bg-gray-200"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                                            </div>
                                        </div>
                                        <canvas
                                            ref={canvasRef}
                                            className="border rounded-lg bg-white shadow-inner w-full touch-none"
                                            onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onMouseLeave={stopDrawing}
                                            onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={stopDrawing}
                                        />
                                        <div className="flex flex-col sm:flex-row items-center gap-4 mt-2">
                                            <input type="range" min="1" max="20" value={brushSize} onChange={e => setBrushSize(Number(e.target.value))} className="w-full" />
                                            <button onClick={handleSubmitAnswer} disabled={!!compressionStatus} className="bg-purple-600 text-white px-8 py-3 rounded-lg hover:bg-purple-700 w-full sm:w-auto">
                                                {compressionStatus || 'Submit Drawing'}
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        ) : (
                            <p className="text-gray-600">Waiting for the reader to start a new round...</p>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};