import React, { useState, useEffect, useRef } from 'react';
import { useGame } from '../contexts/GameContext';
import { Answer } from '../types/game';
import { useNavigate } from 'react-router-dom';
import './Game.css';

export const Game: React.FC = () => {
    const {
        game, player, currentRound, answers, isReader,
        playersWhoSubmitted, startNewRound, submitAnswer, players, leaveGame,
    } = useGame();
    const navigate = useNavigate();

    const [prompt, setPrompt] = useState('');
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [drawingHistory, setDrawingHistory] = useState<ImageData[]>([]);
    const [flippedCards, setFlippedCards] = useState<Set<number>>(new Set());
    const [selectedColor, setSelectedColor] = useState('#000000');
    const [brushSize, setBrushSize] = useState(5);
    const [compressionStatus, setCompressionStatus] = useState<string>('');
    
    const isIPhone = () => /iPhone/i.test(navigator.userAgent);
    const colors = ['#000000', '#FF0000', '#FFA500', '#FFFF00', '#008000', '#0000FF', '#800080', '#895129', '#FFFFFF'];

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        const canvasWidth = 300;
        const canvasHeight = 400;
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;

        // Set up drawing styles immediately
        ctx.strokeStyle = selectedColor;
        ctx.lineWidth = brushSize;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (drawingHistory.length > 0) {
            ctx.putImageData(drawingHistory[drawingHistory.length - 1], 0, 0);
        } else {
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
    }, [drawingHistory, selectedColor, brushSize]);

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
        const { x, y } = getCoordinates(e);
        const ctx = canvasRef.current?.getContext('2d');
        if (!ctx) return;
        setIsDrawing(true);
        ctx.beginPath();
        ctx.moveTo(x, y);
    };

    const draw = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isDrawing) return;
        if ('touches' in e) e.preventDefault();
        const { x, y } = getCoordinates(e);
        const ctx = canvasRef.current?.getContext('2d');
        if (!ctx) return;
        ctx.lineTo(x, y);
        ctx.stroke();
    };

    const stopDrawing = () => {
        if (!isDrawing) return;
        setIsDrawing(false);
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (ctx && canvas) {
            ctx.closePath();
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            setDrawingHistory(prev => [...prev, imageData]);
        }
    };

    const undoLastStroke = () => {
        if (drawingHistory.length === 0) return;
        setDrawingHistory(prev => prev.slice(0, -1));
    };

    const clearCanvas = () => {
        setDrawingHistory([]);
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (ctx && canvas) {
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
    };

    const handleSubmitAnswer = async () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        
        setCompressionStatus('Sending...');
        try {
            // Create a temporary canvas to ensure white background
            const tempCanvas = document.createElement('canvas');
            const tempCtx = tempCanvas.getContext('2d');
            if (!tempCtx) return;
            
            // Set temp canvas to same size
            tempCanvas.width = canvas.width;
            tempCanvas.height = canvas.height;
            
            // Fill with white background first
            tempCtx.fillStyle = 'white';
            tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
            
            // Draw the original canvas content on top
            tempCtx.drawImage(canvas, 0, 0);
            
            const quality = isIPhone() ? 0.8 : 0.9;
            const base64Image = tempCanvas.toDataURL('image/jpeg', quality);
            if (base64Image.length > 1500000) { throw new Error('Drawing is too large.'); }
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
        if (window.confirm('Are you sure?')) {
            await leaveGame();
            navigate('/');
        }
    };

    // FIX: Simplified the JSX inside .card-back to remove the problematic nested div.
    const renderAnswerCard = (answer: Answer) => (
        <div key={answer.answerId} className="answer-card" onClick={() => handleCardClick(answer.answerId)}>
            <div className={`card-inner ${flippedCards.has(answer.answerId) ? 'flipped' : ''}`}>
                <div className="card-front">
                    <p className="player-name">{answer.playerName || 'Unknown'}</p>
                </div>
                <div className="card-back">
                    <h3 className="player-name-back">{answer.playerName || 'Unknown'}</h3>
                    <img src={answer.content} alt={`Drawing by ${answer.playerName}`} />
                </div>
            </div>
        </div>
    );
    
    if (!game || !player) return <div className="text-center p-8">Loading...</div>;

    return (
        <div className="min-h-screen bg-gray-50 p-4">
            <div className="max-w-7xl mx-auto bg-white rounded-xl shadow-lg p-4 sm:p-6">
                {/* Header and Player List JSX remains the same */}
                <div className="mb-6 flex justify-between items-center">
                    <div><h2 className="text-xl sm:text-2xl font-bold text-purple-600">Game Code: <span className="text-2xl sm:text-3xl font-mono">{game.joinCode}</span></h2><p className="text-gray-600">Player: {player.name} {isReader && '(Reader)'}</p></div>
                    {!isReader && <button onClick={handleLeaveGame} className="bg-red-500 text-white px-4 py-2 rounded-md hover:bg-red-600">Leave</button>}
                </div>
                {isReader && (
                    <div className="mb-6">
                        <h3 className="text-xl font-semibold text-purple-600 mb-4">Active Players ({players.length})</h3>
                        <div className="bg-gray-50 rounded-lg p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {players.map(p => (<div key={p.playerId} className="flex items-center gap-2 p-2 rounded-md bg-white border"><div className={`w-3 h-3 rounded-full ${p.isReader ? 'bg-purple-500' : 'bg-green-500'}`}></div><span className="font-medium">{p.name}</span>{playersWhoSubmitted.has(p.playerId) && (<span className="ml-auto text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Submitted</span>)}</div>))}
                        </div>
                    </div>
                )}
                {isReader ? (
                    <div>
                        <div className="mb-6">
                            <h3 className="text-xl font-semibold text-purple-600 mb-2">Start a New Round</h3>
                            <div className="flex gap-3">
                                <input type="text" value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Enter the prompt" className="input flex-1" />
                                <button onClick={handleStartRound} className="bg-purple-600 text-white px-6 py-2 rounded-md hover:bg-purple-700">Start</button>
                            </div>
                        </div>
                        
                        {currentRound && (
                            <div className="mb-6">
                                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                                    <h4 className="text-lg font-semibold text-purple-700 mb-2">Current Round Prompt:</h4>
                                    <p className="text-lg text-gray-800">"{currentRound.prompt}"</p>
                                </div>
                            </div>
                        )}
                        
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
                                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-6">
                                    <h4 className="text-lg font-semibold text-purple-700 mb-2">Current Prompt:</h4>
                                    <p className="text-lg text-gray-800">"{currentRound.prompt}"</p>
                                </div>
                                {playersWhoSubmitted.has(player.playerId) ? (
                                    <div className="bg-green-50 text-green-700 p-4 rounded-lg">Submitted! Waiting...</div>
                                ) : (
                                    <>
                                        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                            <div className="flex flex-wrap gap-1">{colors.map(color => (<button key={color} onClick={() => setSelectedColor(color)} className={`w-7 h-7 rounded-full border-2 ${selectedColor === color ? 'border-purple-600 scale-110' : 'border-transparent'}`} style={{ backgroundColor: color }} />))}</div>
                                            <div className="flex gap-2"><button onClick={undoLastStroke} disabled={drawingHistory.length === 0} className="p-2 rounded-full bg-gray-200 disabled:opacity-50"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg></button><button onClick={clearCanvas} className="p-2 rounded-full bg-gray-200"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button></div>
                                        </div>
                                        <div className="canvas-container"><canvas ref={canvasRef} onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onMouseLeave={stopDrawing} onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={stopDrawing} /></div>
                                        <div className="flex flex-col sm:flex-row items-center gap-4 mt-2">
                                            <input type="range" min="1" max="30" value={brushSize} onChange={e => setBrushSize(Number(e.target.value))} className="w-full" />
                                            <button onClick={handleSubmitAnswer} disabled={!!compressionStatus} className="bg-purple-600 text-white px-8 py-3 rounded-lg hover:bg-purple-700 w-full sm:w-auto">{compressionStatus || 'Submit Drawing'}</button>
                                        </div>
                                    </>
                                )}
                            </div>
                        ) : (<p className="text-gray-600">Waiting for the reader...</p>)}
                    </div>
                )}
            </div>
        </div>
    );
};