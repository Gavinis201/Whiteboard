import React, { useState, useEffect, useRef } from 'react';
import { useGame } from '../contexts/GameContext';
import { Answer, Prompt, getPrompts, getDetailedVoteResults } from '../services/api';
import { useNavigate } from 'react-router-dom';
import { LoadingSpinner } from './LoadingSpinner';
import { signalRService } from '../services/signalR';
import './Game.css';

export const Game: React.FC = () => {
    const {
        game, player, currentRound, answers, isReader,
        playersWhoSubmitted, startNewRound, submitAnswer, players, leaveGame, kickPlayer,
        isLoading, loadingMessage, selectedTimerDuration, timeRemaining, roundStartTime, isTimerActive,
        judgingModeEnabled, toggleJudgingMode,
        setSelectedTimerDuration, setTimeRemaining, setRoundStartTime, setIsTimerActive, setOnTimerExpire
    } = useGame();
    const navigate = useNavigate();

     // ✅ NEW: show loading spinner if game is loading
    if (isLoading) {
        return <LoadingSpinner text={loadingMessage || 'Loading game...'} />;
    }
 
    const [prompt, setPrompt] = useState('');
    const [prompts, setPrompts] = useState<Prompt[]>([]);
    const [showPromptsDropdown, setShowPromptsDropdown] = useState(false);
    const [filteredPrompts, setFilteredPrompts] = useState<Prompt[]>([]);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [drawingHistory, setDrawingHistory] = useState<ImageData[]>([]);
    const [undoneStrokes, setUndoneStrokes] = useState<ImageData[]>([]);
    const [flippedCards, setFlippedCards] = useState<Set<number>>(new Set());
    const [selectedColor, setSelectedColor] = useState('#000000');
    const [brushSize, setBrushSize] = useState(5);
    const [compressionStatus, setCompressionStatus] = useState<string>('');
    const [hasMoved, setHasMoved] = useState(false);
    const [startPoint, setStartPoint] = useState({ x: 0, y: 0 });
    const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'reconnecting'>('connected');
    const [voteResults, setVoteResults] = useState<any[]>([]);
    const [detailedVoteResults, setDetailedVoteResults] = useState<any[]>([]);
    const [allPlayersSubmitted, setAllPlayersSubmitted] = useState(false);
    const [gameMode, setGameMode] = useState<'Select' | 'Classic' | 'Blank' | 'Custom' | 'Trivia' | 'Would Ya' | 'Would You Rather'>('Select');
    // Add subcategory state for Trivia
    const [triviaCategory, setTriviaCategory] = useState('American History');
    // Add answer display state
    const [showAnswer, setShowAnswer] = useState(false);
    const [currentAnswer, setCurrentAnswer] = useState('');
    // Add fill bucket tool state
    const [isFillMode, setIsFillMode] = useState(false);
    const triviaCategories = [
      'American History',
      'Harry Potter',
      'Star Wars',
      'Marvel',
      'Disney Movies',
    ];

    const isIPhone = () => /iPhone/i.test(navigator.userAgent);
    const colors = ['#000000', '#FF0000', '#FFA500', '#FFFF00', '#008000', '#0000FF', '#800080', '#895129', '#FFFFFF'];

    // Utility function to hide answers in parentheses
    const hideAnswers = (text: string) => {
        // Replace text in parentheses with invisible text (same color as background)
        return text.replace(/\([^)]*\)/g, (match) => {
            return `<span style="color: transparent; background: transparent;">${match}</span>`;
        });
    };

    // Utility function to render text with hidden answers
    const renderTextWithHiddenAnswers = (text: string) => {
        const parts = text.split(/(\([^)]*\))/g);
        return parts.map((part, index) => {
            if (part.match(/^\([^)]*\)$/)) {
                // This is an answer in parentheses - make it invisible but selectable
                return <span key={index} style={{ 
                    color: 'transparent', 
                    background: 'transparent', 
                    userSelect: 'text',
                    cursor: 'text',
                    fontSize: '0.1px' // Make it tiny but still selectable
                }}>{part}</span>;
            }
            return <span key={index}>{part}</span>;
        });
    };

    // Set up timer expire callback for auto-submission
    useEffect(() => {
        if (currentRound && !isReader && !playersWhoSubmitted.has(player?.playerId || 0)) {
            setOnTimerExpire(() => async () => {
                try {
                    console.log('Timer expired, attempting auto-submission');
                    // Check if already submitted before attempting auto-submission
                    if (!playersWhoSubmitted.has(player?.playerId || 0)) {
                        // Check if page is visible - if not, we might be in background
                        const isPageVisible = !document.hidden;
                        console.log('Page visibility during auto-submission:', isPageVisible);
                        
                        // If page is not visible, we might be in background - still try to submit
                        if (!isPageVisible) {
                            console.log('Page not visible, but attempting auto-submission anyway');
                        }
                        
                        await handleSubmitAnswer();
                    } else {
                        console.log('Player already submitted, skipping auto-submission');
                    }
                } catch (error) {
                    console.error('Auto-submission failed:', error);
                    // Show a user-friendly message only if page is visible
                    if (!document.hidden) {
                        alert('Timer expired but submission failed. Please try submitting manually.');
                    }
                }
            });
        } else {
            setOnTimerExpire(null);
        }
         
        return () => setOnTimerExpire(null);
    }, [currentRound, isReader, playersWhoSubmitted, player?.playerId, setOnTimerExpire]);

    // Fetch prompts from database
    useEffect(() => {
        const fetchPrompts = async () => {
            try {
                const promptsData = await getPrompts();
                setPrompts(promptsData);
            } catch (error) {
                console.error('Error fetching prompts:', error);
            }
        };
        fetchPrompts();
    }, []);

    // Set up vote results listener
    useEffect(() => {
        signalRService.onVoteResultsUpdated((results: any[], maxVotes: number) => {
            setVoteResults(results);
            // Fetch detailed vote results when vote results are updated
            if (currentRound && judgingModeEnabled) {
                fetchDetailedVoteResults();
            }
        });

        return () => {
            signalRService.onVoteResultsUpdated(() => {});
        };
    }, [currentRound, judgingModeEnabled]);

    // Fetch detailed vote results
    const fetchDetailedVoteResults = async () => {
        if (!currentRound) return;
        try {
            const detailedResults = await getDetailedVoteResults(currentRound.roundId);
            setDetailedVoteResults(detailedResults);
        } catch (error) {
            console.error('Error fetching detailed vote results:', error);
        }
    };

    // Fetch detailed vote results when judging mode is enabled
    useEffect(() => {
        if (judgingModeEnabled && currentRound) {
            fetchDetailedVoteResults();
        }
    }, [judgingModeEnabled, currentRound]);

    // Check if all players have submitted
    useEffect(() => {
        if (currentRound && players.length > 0) {
            const nonReaderPlayers = players.filter(p => !p.isReader);
            const allSubmitted = nonReaderPlayers.length > 0 && 
                nonReaderPlayers.every(p => playersWhoSubmitted.has(p.playerId));
            setAllPlayersSubmitted(allSubmitted);
        }
    }, [currentRound, players, playersWhoSubmitted]);

    // Update filtered prompts based on game mode, subcategory, and input
    useEffect(() => {
        if (gameMode === 'Custom' || gameMode === 'Select') {
            setFilteredPrompts([]);
        } else if (prompt.trim() === '') {
            // Show all prompts for the selected mode when input is empty
            if (gameMode === 'Blank') {
                setFilteredPrompts(prompts.filter(p => p.category === 'Blank'));
            } else if (gameMode === 'Classic') {
                setFilteredPrompts(prompts.filter(p => !['Blank', 'Trivia - American History', 'Trivia - Harry Potter', 'Trivia - Star Wars', 'Trivia - Marvel', 'Trivia - Disney Movies', 'Would Ya', 'Would You Rather'].includes(p.category)));
            } else if (gameMode === 'Trivia') {
                setFilteredPrompts(prompts.filter(p => p.category === `Trivia - ${triviaCategory}`));
            } else if (gameMode === 'Would Ya') {
                setFilteredPrompts(prompts.filter(p => p.category === 'Would Ya'));
            } else if (gameMode === 'Would You Rather') {
                setFilteredPrompts(prompts.filter(p => p.category === 'Would You Rather'));
            }
        } else {
            // Filter by input text when user is typing
            if (gameMode === 'Blank') {
                setFilteredPrompts(
                    prompts.filter(p => p.category === 'Blank' && p.text.toLowerCase().includes(prompt.toLowerCase()))
                );
            } else if (gameMode === 'Classic') {
                setFilteredPrompts(
                    prompts.filter(p => !['Blank', 'Trivia - American History', 'Trivia - Harry Potter', 'Trivia - Star Wars', 'Trivia - Marvel', 'Trivia - Disney Movies', 'Would Ya', 'Would You Rather'].includes(p.category) && p.text.toLowerCase().includes(prompt.toLowerCase()))
                );
            } else if (gameMode === 'Trivia') {
                setFilteredPrompts(
                    prompts.filter(p => p.category === `Trivia - ${triviaCategory}` && p.text.toLowerCase().includes(prompt.toLowerCase()))
                );
            } else if (gameMode === 'Would Ya') {
                setFilteredPrompts(
                    prompts.filter(p => p.category === 'Would Ya' && p.text.toLowerCase().includes(prompt.toLowerCase()))
                );
            } else if (gameMode === 'Would You Rather') {
                setFilteredPrompts(
                    prompts.filter(p => p.category === 'Would You Rather' && p.text.toLowerCase().includes(prompt.toLowerCase()))
                );
            }
        }
    }, [prompt, prompts, gameMode, triviaCategory]);

    const handlePromptSelect = (selectedPrompt: string) => {
        // Store the full text with answers, but display clean version in input
        setPrompt(selectedPrompt);
        setShowPromptsDropdown(false);
    };

    const handlePromptItemClick = (e: React.MouseEvent, selectedPrompt: string) => {
        e.preventDefault();
        e.stopPropagation();
        handlePromptSelect(selectedPrompt);
    };

    const handlePromptInputFocus = () => {
        setShowPromptsDropdown(true);
    };

    const handlePromptInputBlur = () => {
        // ✅ OPTIMIZED: Immediate dropdown hiding with proper click handling
        setShowPromptsDropdown(false);
    };

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

        // Restore drawing history or set white background
        if (drawingHistory.length > 0) {
            // Restore the last saved state
            ctx.putImageData(drawingHistory[drawingHistory.length - 1], 0, 0);
        } else {
            // Clear to white background
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
    }, [drawingHistory, selectedColor, brushSize]);

            const getCoordinates = (e: React.PointerEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
        };

        const startDrawing = (e: React.PointerEvent) => {
        e.preventDefault();
        const { x, y } = getCoordinates(e);
        
        // Handle fill bucket tool
        if (isFillMode) {
            floodFill(Math.floor(x), Math.floor(y), selectedColor);
            return;
        }
        
        const ctx = canvasRef.current?.getContext('2d');
        if (!ctx) return;
        setIsDrawing(true);
        setHasMoved(false);
        setStartPoint({ x, y });

        ctx.strokeStyle = selectedColor;
        ctx.fillStyle = selectedColor;
        ctx.lineWidth = brushSize;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.beginPath();
        ctx.moveTo(x, y);
        };

        const draw = (e: React.PointerEvent) => {
        if (!isDrawing) return;
        e.preventDefault();
        const { x, y } = getCoordinates(e);
        const ctx = canvasRef.current?.getContext('2d');
        if (!ctx) return;

        const distance = Math.sqrt((x - startPoint.x) ** 2 + (y - startPoint.y) ** 2);
        if (distance > 2) {
            setHasMoved(true);
        } 

        ctx.lineTo(x, y);
        ctx.stroke();
        };

        const stopDrawing = () => {
        if (!isDrawing) return;
        setIsDrawing(false);

        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!ctx || !canvas) return;

        if (!hasMoved) {
            // 👆 Draw dot if user didn't move
            ctx.beginPath();
            ctx.arc(startPoint.x, startPoint.y, brushSize / 2, 0, 2 * Math.PI);
            ctx.fillStyle = selectedColor;
            ctx.fill();
            ctx.closePath();
        } else {
            // 👇 Ensure the path is properly closed
            ctx.closePath();
        }

        // 🧠 Save for undo
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        setDrawingHistory(prev => [...prev, imageData]);
        setUndoneStrokes([]);
        };





    const undoLastStroke = () => {
        if (drawingHistory.length === 0) return;
        
        // Get the last stroke and remove it from history
        const lastStroke = drawingHistory[drawingHistory.length - 1];
        setDrawingHistory(prev => prev.slice(0, -1));
        
        // Add the undone stroke to the undone strokes array
        setUndoneStrokes(prev => [...prev, lastStroke]);
        
        // Reset drawing state
        setIsDrawing(false);
        setHasMoved(false);
    };

    const redoLastStroke = () => {
        if (undoneStrokes.length === 0) return;
        
        // Get the last undone stroke and remove it from undone strokes
        const strokeToRedo = undoneStrokes[undoneStrokes.length - 1];
        setUndoneStrokes(prev => prev.slice(0, -1));
        
        // Add the stroke back to drawing history
        setDrawingHistory(prev => [...prev, strokeToRedo]);
        
        // Reset drawing state
        setIsDrawing(false);
        setHasMoved(false);
    };

    // Flood fill algorithm for fill bucket tool
    const floodFill = (startX: number, startY: number, fillColor: string) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        // Get image data for pixel manipulation
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        // Convert hex color to RGB
        const hexToRgb = (hex: string) => {
            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            return result ? {
                r: parseInt(result[1], 16),
                g: parseInt(result[2], 16),
                b: parseInt(result[3], 16)
            } : null;
        };
        
        const fillRgb = hexToRgb(fillColor);
        if (!fillRgb) return;
        
        // Get the target color (the color we're replacing)
        const targetIndex = (startY * canvas.width + startX) * 4;
        const targetR = data[targetIndex];
        const targetG = data[targetIndex + 1];
        const targetB = data[targetIndex + 2];
        
        // Don't fill if clicking on the same color
        if (targetR === fillRgb.r && targetG === fillRgb.g && targetB === fillRgb.b) {
            return;
        }
        
        // ✅ OPTIMIZED: Stack-based flood fill algorithm with early exit
        const stack: [number, number][] = [[startX, startY]];
        const visited = new Set<string>(); // Track visited pixels for faster performance
        
        while (stack.length > 0) {
            const [x, y] = stack.pop()!;
            const key = `${x},${y}`;
            
            // Check bounds and visited status
            if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height || visited.has(key)) {
                continue;
            }
            
            visited.add(key);
            const index = (y * canvas.width + x) * 4;
            
            // Check if this pixel matches the target color
            if (data[index] !== targetR || data[index + 1] !== targetG || data[index + 2] !== targetB) {
                continue;
            }
            
            // Fill this pixel
            data[index] = fillRgb.r;
            data[index + 1] = fillRgb.g;
            data[index + 2] = fillRgb.b;
            data[index + 3] = 255; // Alpha
            
            // Add neighboring pixels to stack (optimized order for better performance)
            stack.push([x + 1, y]);
            stack.push([x - 1, y]);
            stack.push([x, y + 1]);
            stack.push([x, y - 1]);
        }
        
        // Put the modified image data back
        ctx.putImageData(imageData, 0, 0);
        
        // Save for undo
        const newImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        setDrawingHistory(prev => [...prev, newImageData]);
        setUndoneStrokes([]);
    };

    const clearCanvas = () => {
        // Show confirmation dialog
        if (!window.confirm('Are you sure you want to clear the canvas?')) {
            return; // User clicked Cancel
        }
        
        clearCanvasWithoutConfirmation();
    };

    const clearCanvasWithoutConfirmation = () => {
        // Clear the drawing history and undone strokes
        setDrawingHistory([]);
        setUndoneStrokes([]);
        
        // Immediately clear the canvas
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (ctx && canvas) {
            // Clear to white background
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        
        // Reset drawing state
        setIsDrawing(false);
        setHasMoved(false);
    };

    const handleSubmitAnswer = async () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
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
            
            // Check if we're still in the game before submitting
            if (!game?.joinCode || !player?.playerId) {
                throw new Error('No longer in game. Please refresh and try again.');
            }
            
            await submitAnswer(base64Image);
            clearCanvasWithoutConfirmation(); // Use the version without confirmation
        } catch (error: any) {
            console.error('Error submitting answer:', error);
            alert(error.message || 'Failed to submit drawing. Please try again.');
        } finally {
            setCompressionStatus('');
        }
    };  
     
    const handleStartRound = async () => {
        if (!prompt.trim() || !game) return;
        await startNewRound(prompt, selectedTimerDuration || undefined);
        setPrompt('');
        // Reset answer state when starting a new round
        setShowAnswer(false);
        setCurrentAnswer('');
        // Reset fill mode when starting new round
        setIsFillMode(false);
        // setSelectedTimerDuration(null);
    };
    
    const handleCardClick = (answerId: number) => {
        setFlippedCards(prev => {
            const newSet = new Set(prev);
            newSet.has(answerId) ? newSet.delete(answerId) : newSet.add(answerId);
            return newSet;
        });
    };
    
    const handleLeaveGame = async () => {
        const message = isReader 
            ? 'Are you sure you want to leave? This will end the game for all players.'
            : 'Are you sure you want to leave the game?';
            
        if (window.confirm(message)) {
            await leaveGame();
            navigate('/');
        }
    };

    // FIX: Simplified the JSX inside .card-back to remove the problematic nested div.
    const renderAnswerCard = (answer: Answer) => {
        const voteResult = voteResults.find(r => r.answerId === answer.answerId);
        const detailedVoteResult = detailedVoteResults.find(r => r.answerId === answer.answerId);
        
        return (
            <div key={answer.answerId} className="answer-card" onClick={() => handleCardClick(answer.answerId)}>
                <div className={`card-inner ${flippedCards.has(answer.answerId) ? 'flipped' : ''}`}>
                    <div className="card-front">
                        <p className="player-name">{answer.playerName || 'Unknown'}</p>
                        {judgingModeEnabled && voteResult && (
                            <div className="vote-results">
                                <div className="vote-badge">
                                    <span className="vote-points">{voteResult.voteCount} votes</span>
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="card-back">
                        <h3 className="player-name-back">{answer.playerName || 'Unknown'}</h3>
                        <div className="drawing-container">
                            <img src={answer.content} alt={`Drawing by ${answer.playerName}`} />
                        </div>
                        {judgingModeEnabled && detailedVoteResult && detailedVoteResult.voters && detailedVoteResult.voters.length > 0 && (
                            <div className="voter-list-below">
                                <div className="voter-list">
                                    {detailedVoteResult.voters.map((voter: any, index: number) => (
                                        <div key={index} className="voter-item">
                                            {/* <span className="voter-rank">💜</span> */}
                                            <span className="voter-name">{voter.voterName}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                            </div>
        </div>
    );
};
    
    // Monitor connection status
    useEffect(() => {
        const checkConnection = () => {
            const isInGame = signalRService.isInGame();
            const isConnected = signalRService.isConnected();
            const isReconnecting = signalRService.isReconnecting();
            
            if (!isInGame) {
                setConnectionStatus('disconnected');
            } else if (isReconnecting || !isConnected) {
                setConnectionStatus('reconnecting');
            } else {
                setConnectionStatus('connected');
            }
        };

        // ✅ OPTIMIZED: Ultra-fast connection checks for maximum responsiveness
        const interval = setInterval(checkConnection, 500); // Check every 500ms for instant feedback
        checkConnection(); // Initial check

        return () => clearInterval(interval);
    }, []);

    if (!game || !player) return <div className="text-center p-8">Loading...</div>;

    return (
        <div className="min-h-screen bg-gray-50 p-4">
            {/* Fixed Timer Display for all users (host and players) */}
            {isTimerActive && selectedTimerDuration && timeRemaining !== null && (
                <div className="fixed top-4 right-4 z-50 bg-white rounded-lg shadow-lg border border-gray-200 p-4">
                    {isReader && (
                        <div className="text-purple-700 font-semibold mb-1 text-center">Players are drawing...</div>
                    )}
                    <div className="flex items-center gap-2">
                        <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div className="text-center">
                            <div className={`text-2xl font-bold ${timeRemaining <= 30 ? 'text-red-600 animate-pulse' : 'text-purple-600'}`}> 
                                {Math.floor(timeRemaining / 60)}:{(timeRemaining % 60).toString().padStart(2, '0')}
                            </div>
                            <div className="text-sm text-gray-600">Time Remaining</div>
                        </div>
                        {timeRemaining <= 30 && (
                            <div className="text-red-600 text-sm font-medium animate-pulse">⏰</div>
                        )}
                        {timeRemaining <= 10 && (
                            <div className="text-red-600 text-sm font-medium animate-bounce">⚠️</div>
                        )}
                    </div>
                </div>
            )}
            
            {/* Connection warning when timer is active */}
            {isTimerActive && connectionStatus === 'disconnected' && !isReader && (
                <div className="fixed top-20 right-4 z-50 bg-red-50 border border-red-200 rounded-lg p-3 max-w-sm">
                    <div className="flex items-center gap-2">
                        <div className="text-red-600">⚠️</div>
                        <div className="text-sm text-red-700">
                            <div className="font-semibold">Connection Lost</div>
                            <div>Your drawing will be submitted automatically when the timer expires.</div>
                        </div>
                    </div>
                </div>
            )}
            
            <div className="max-w-7xl mx-auto bg-white rounded-xl shadow-lg p-4 sm:p-6">
                {/* Header and Player List JSX remains the same */}
                <div className="mb-6 flex justify-between items-center">
                    <div>
                        <h2 className="text-xl sm:text-2xl font-bold text-purple-600">Game Code: <span className="text-2xl sm:text-3xl font-mono">{game.joinCode}</span></h2>
                        <p className="text-gray-600">Player: {player.name} {isReader && '(Reader)'}</p>
                        <div className="flex items-center gap-2 mt-1">
                            <div className={`w-2 h-2 rounded-full ${connectionStatus === 'connected' ? 'bg-green-500' : connectionStatus === 'reconnecting' ? 'bg-yellow-500' : 'bg-red-500'}`}></div>
                            <span className={`text-xs ${connectionStatus === 'connected' ? 'text-green-600' : connectionStatus === 'reconnecting' ? 'text-yellow-600' : 'text-red-600'}`}>
                                {connectionStatus === 'connected' ? 'Connected' : connectionStatus === 'reconnecting' ? 'Reconnecting...' : 'Disconnected'}
                            </span>
                        </div>
                    </div>
                    <button onClick={handleLeaveGame} className="bg-red-500 text-white px-4 py-2 rounded-md hover:bg-red-600">Leave</button>
                </div>
                {isReader && (
                    <div className="mb-6">
                        <h3 className="text-xl font-semibold text-purple-600 mb-4">Active Players ({players.length})</h3>
                        <div className="bg-gray-50 rounded-lg p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {players.map(p => (
                                <div key={p.playerId} className="flex items-center gap-2 p-2 rounded-md bg-white border">
                                    <div className={`w-3 h-3 rounded-full ${p.isReader ? 'bg-purple-500' : 'bg-green-500'}`}></div>
                                    <span className="font-medium">{p.name}</span>
                                    {playersWhoSubmitted.has(p.playerId) && (
                                        <span className="ml-auto text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Submitted</span>
                                    )}
                                    {isReader && !p.isReader && (
                                        <button 
                                            onClick={() => {
                                                if (window.confirm(`Are you sure you want to kick ${p.name} from the game?`)) {
                                                    kickPlayer(p.playerId);
                                                }
                                            }}
                                            className="ml-auto text-red-500 hover:text-red-700 p-1 rounded-full hover:bg-red-50 transition-colors"
                                            title={`Kick ${p.name} from the game`}
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                {isReader ? (
                    <div>
                        <div className="mb-6">
                            <div className="flex items-center gap-3 mb-2">
                                <h3 className="text-xl font-semibold text-purple-600">Start a New Round</h3>
                                {/* {allPlayersSubmitted && judgingModeEnabled && (
                                    <div className="bg-green-100 border border-green-300 rounded-full px-3 py-1">
                                        <span className="text-green-800 text-xs font-medium">Players Ready</span>
                                    </div>
                                )} */}
                            </div>
                            <div className="relative">
                                <div className="start-new-round-container flex items-center gap-2">
                                    {/* Game mode dropdown */}
                                    <select
                                        value={gameMode}
                                        onChange={e => setGameMode(e.target.value as any)}
                                        className="px-3 py-2 border border-gray-300 rounded-md bg-white"
                                        style={{ minWidth: 140 }}
                                    >
                                        <option value="Select" disabled>Game Modes</option>
                                        <option value="Custom">Custom</option>
                                        <option value="Classic">Classic</option>
                                        <option value="Blank">Blank Game</option>
                                        <option value="Trivia">Trivia</option>
                                        <option value="Would Ya">Answer as me</option>
                                        <option value="Would You Rather">Would You Rather?</option>
                                    </select>
                                    {/* Trivia subcategory dropdown */}
                                    {gameMode === 'Trivia' && (
                                        <select
                                            value={triviaCategory}
                                            onChange={e => setTriviaCategory(e.target.value)}
                                            className="px-3 py-2 border border-gray-300 rounded-md bg-white"
                                            style={{ minWidth: 140 }}
                                        >
                                            {triviaCategories.map(cat => (
                                                <option key={cat} value={cat}>{cat}</option>
                                            ))}
                                        </select>
                                    )}
                                    {/* Prompt input and suggestions */}
                                    <div className="flex-1 relative">
                                        <input
                                            type="text"
                                            value={prompt.replace(/\([^)]*\)/g, '')}
                                            onChange={e => setPrompt(e.target.value)}
                                            onFocus={handlePromptInputFocus}
                                            onBlur={handlePromptInputBlur}
                                            placeholder={
                                                gameMode === 'Select' ? 'Select a game mode first...'
                                                : gameMode === 'Blank' ? 'Enter your own or pick a Blank prompt...'
                                                : gameMode === 'Classic' ? 'Enter your own or pick a classic prompt...'
                                                : gameMode === 'Trivia' ? `Enter your own or pick a ${triviaCategory} trivia question...`
                                                : gameMode === 'Would Ya' ? 'Enter your own or pick a Would Ya question...'
                                                : gameMode === 'Would You Rather' ? 'Enter your own or pick a Would You Rather question...'
                                                : 'Type any prompt you want!'
                                            }
                                            className="input"
                                        />
                                        {/* Suggestions dropdown */}
                                        {gameMode !== 'Custom' && showPromptsDropdown && filteredPrompts.length > 0 && (
                                            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                                                {filteredPrompts.map((promptItem) => (
                                                    <div
                                                        key={promptItem.promptId}
                                                        className="px-4 py-2 hover:bg-gray-100 cursor-pointer border-b border-gray-100 last:border-b-0"
                                                        onMouseDown={(e) => handlePromptItemClick(e, promptItem.text)}
                                                    >
                                                        <div className="font-medium text-gray-900">{renderTextWithHiddenAnswers(promptItem.text)}</div>
                                                        <div className="text-sm text-gray-500">{promptItem.category}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    {/* Timer select and Start button remain unchanged */}
                                    <select 
                                        value={selectedTimerDuration || ''} 
                                        onChange={e => setSelectedTimerDuration(e.target.value ? Number(e.target.value) : null)}
                                        className="px-4 py-2 border border-gray-300 rounded-md bg-white"
                                    >
                                        <option value="">No Timer</option>
                                        <option value="1">1 Minute</option>
                                        <option value="2">2 Minutes</option>
                                        <option value="3">3 Minutes</option>
                                    </select>

                                    <button onClick={handleStartRound} className="bg-purple-600 text-white px-6 py-2 rounded-md hover:bg-purple-700">Start</button>
                                </div>
                                <div className="mt-4 flex items-center gap-4">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={judgingModeEnabled}
                                            onChange={(e) => toggleJudgingMode(e.target.checked)}
                                            className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                                        />
                                        <span className="text-sm font-medium text-gray-700">Voting Mode</span>
                                    </label>
                                    {judgingModeEnabled && (
                                        <span className="text-xs text-purple-600 bg-purple-50 px-2 py-1 rounded">
                                            Players will vote for their favorite drawings after submission
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                        
                        {currentRound && (
                            <div className="mb-6">
                                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                                    <h4 className="text-lg font-semibold text-purple-700 mb-2">Current Round Prompt:</h4>
                                    <p className="text-lg text-gray-800">"{renderTextWithHiddenAnswers(currentRound.prompt)}"</p>
                                    {allPlayersSubmitted && currentRound.prompt.includes('(') && (
                                        <div className="mt-3 pt-3 border-t border-purple-200">
                                            <div className="flex items-center gap-3">
                                                <button 
                                                    onClick={() => {
                                                        const answerMatch = currentRound.prompt.match(/\(([^)]+)\)/);
                                                        if (answerMatch) {
                                                            setCurrentAnswer(answerMatch[1]);
                                                            setShowAnswer(!showAnswer);
                                                        }
                                                    }}
                                                    className="bg-green-500 text-white px-4 py-2 rounded-md hover:bg-green-600 text-sm"
                                                >
                                                    🎯 {showAnswer ? 'Hide Answer' : 'Show Answer'}
                                                </button>
                                                {showAnswer && (
                                                    <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                                                        <span className="text-sm font-medium text-green-800">Answer: </span>
                                                        <span className="text-sm text-green-700">{currentAnswer}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                    
                                    {/* Show submission progress for host */}
                                    {judgingModeEnabled && (
                                        <div className="mt-4 pt-4 border-t border-purple-200">
                                            {/* Calculate number of unique voters */}
                                            {(() => {
                                                const nonReaderPlayers = players.filter(p => !p.isReader);
                                                // Collect all voter names from detailedVoteResults
                                                let uniqueVoters = new Set<string>();
                                                detailedVoteResults.forEach((result: any) => {
                                                    if (result.voters && Array.isArray(result.voters)) {
                                                        result.voters.forEach((voter: any) => {
                                                            if (voter && voter.voterName) uniqueVoters.add(voter.voterName);
                                                        });
                                                    }
                                                });
                                                const votesSoFar = uniqueVoters.size;
                                                const totalVoters = nonReaderPlayers.length;
                                                return (
                                                    <>
                                                        <div className="flex justify-between items-center mb-2">
                                                            <span className="text-sm font-medium text-purple-700">Player Votes:</span>
                                                            <span className="text-sm text-purple-600">
                                                                {votesSoFar} of {totalVoters} players
                                                            </span>
                                                        </div>
                                                        <div className="w-full bg-purple-200 rounded-full h-2">
                                                            <div 
                                                                className={`h-2 rounded-full transition-all duration-300 ${votesSoFar === totalVoters ? 'bg-green-500' : 'bg-purple-500'}`}
                                                                style={{ 
                                                                    width: `${(votesSoFar / totalVoters) * 100}%` 
                                                                }}
                                                            ></div>
                                                        </div>
                                                    </>
                                                );
                                            })()}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                        
                        {answers.length > 0 && (
                            <div>
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="text-xl font-semibold text-purple-600">Answers</h3>
                                    {/* {allPlayersSubmitted && judgingModeEnabled && (
                                        <div className="bg-green-100 border border-green-300 rounded-lg px-3 py-1">
                                            <span className="text-green-800 text-sm font-medium">All players submitted!</span>
                                        </div>
                                    )} */}
                                </div>
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
                                    <p className="text-lg text-gray-800">"{renderTextWithHiddenAnswers(currentRound.prompt)}"</p>
                                </div>
                                {playersWhoSubmitted.has(player.playerId) ? (
                                    <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                                        <div className="flex items-center gap-3 mb-4">
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${allPlayersSubmitted ? 'bg-green-600' : 'bg-green-500'}`}>
                                                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                </svg>
                                            </div>
                                            <div>
                                                <h3 className="text-lg font-semibold text-green-800">Drawing Submitted!</h3>
                                                <p className="text-green-700">
                                                    {allPlayersSubmitted ? 'All players have finished! ' : 'Waiting for other players to finish...'}
                                                </p>
                                            </div>
                                        </div>
                                        
                                        {/* Show the submitted drawing */}
                                        <div className="mb-4">
                                            <h4 className="text-sm font-medium text-green-800 mb-2">Your Drawing:</h4>
                                            <div className="bg-white border border-green-200 rounded-lg p-3">
                                                <img 
                                                    src={answers.find(a => a.playerId === player.playerId)?.content} 
                                                    alt="Your submitted drawing"
                                                    className="w-full h-48 object-contain bg-white rounded"
                                                />
                                            </div>
                                        </div>
                                        
                                        {/* Show submission progress */}
                                        <div className="mb-4">
                                            <div className="flex justify-between items-center mb-2">
                                                <span className="text-sm font-medium text-green-800">Submission Progress:</span>
                                                <span className={`text-sm ${allPlayersSubmitted ? 'text-green-800 font-medium' : 'text-green-700'}`}>
                                                    {allPlayersSubmitted ? 'All players submitted!' : `${playersWhoSubmitted.size} of ${players.filter(p => !p.isReader).length} players`}
                                                </span>
                                            </div>
                                            <div className="w-full bg-green-200 rounded-full h-2">
                                                <div 
                                                    className={`h-2 rounded-full transition-all duration-300 ${allPlayersSubmitted ? 'bg-green-600' : 'bg-green-500'}`}
                                                    style={{ 
                                                        width: `${(playersWhoSubmitted.size / players.filter(p => !p.isReader).length) * 100}%` 
                                                    }} 
                                                ></div>
                                            </div>
                                        </div>
                                        
                                        {judgingModeEnabled && (
                                            <div className={`border rounded-lg p-3 ${allPlayersSubmitted ? 'bg-purple-100 border-purple-300' : 'bg-purple-50 border-purple-200'}`}>
                                                {allPlayersSubmitted ? (
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-5 h-5 bg-purple-500 rounded-full flex items-center justify-center">
                                                            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                            </svg>
                                                        </div>
                                                        <p className="text-purple-800 text-sm font-medium">
                                                            All players have submitted! Redirecting to judging...
                                                        </p>
                                                    </div>
                                                ) : (
                                                    <p className="text-purple-800 text-sm">
                                                        <strong>Judging Mode Enabled:</strong> You'll be automatically redirected to vote for your favorite drawings once everyone has submitted.
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                        
                                        {/* {!judgingModeEnabled && allPlayersSubmitted && (
                                            <div className="border rounded-lg p-3 bg-green-100 border-green-300">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                                                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                        </svg>
                                                    </div>
                                                    <p className="text-green-800 text-sm font-medium">
                                                        All players have submitted! Waiting for the host to start the next round.
                                                    </p>
                                                </div>
                                            </div>
                                        )} */}
                                        

                                    </div>
                                ) : (
                                    <>
                                        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                            <div className="flex flex-wrap gap-1">
                                                {colors.map(color => (
                                                    <button 
                                                        key={color} 
                                                        onClick={() => setSelectedColor(color)} 
                                                        className={`w-7 h-7 rounded-full border-2 ${selectedColor === color ? 'border-purple-600 scale-110' : 'border-transparent'} ${
                                                            color === '#FFFFFF' ? 'shadow-[0_0_0_1px_rgba(0,0,0,0.3)]' : ''
                                                        }`} 
                                                        style={{ backgroundColor: color }} 
                                                    />
                                                ))}
                                                <div className="relative">
                                                    <input
                                                        type="color"
                                                        value={selectedColor}
                                                        onChange={(e) => setSelectedColor(e.target.value)}
                                                        className="w-7 h-7 rounded-full border-2 border-gray-300 cursor-pointer"
                                                        title="Choose custom color"
                                                    />
                                                </div>
                                            </div>
                                            <div className="flex gap-5">
                                                <button 
                                                    onClick={undoLastStroke} 
                                                    disabled={drawingHistory.length === 0} 
                                                    className="p-2 rounded-full bg-gray-200 hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                                    title="Undo last stroke"
                                                >
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                                                    </svg>
                                                </button>
                                                <button 
                                                    onClick={redoLastStroke} 
                                                    disabled={undoneStrokes.length === 0} 
                                                    className="p-2 rounded-full bg-gray-200 hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                                    title="Redo last stroke"
                                                >
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                    </svg>
                                                </button>
                                                <button 
                                                    onClick={() => setIsFillMode(!isFillMode)} 
                                                    className={`p-2 rounded-full transition-colors ${isFillMode ? 'bg-purple-200 hover:bg-purple-300' : 'bg-gray-200 hover:bg-gray-300'}`}
                                                    title="Fill bucket tool"
                                                >
                                                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                        {/* Bucket body */}
                                                        <path d="M6 8h12l-1.5 10.5a2 2 0 01-2 1.5H9.5a2 2 0 01-2-1.5L6 8z" />
                                                        {/* Bucket handle */}
                                                        <path d="M8 8a4 4 0 018 0" />
                                                        {/* Paint drip */}
                                                        <path d="M12 8v3c0 .5.5 1 .5 1s.5-.5.5-1V8z" fill="currentColor" stroke="none" />
                                                    </svg>

                                                </button>
                                                <button 
                                                    onClick={clearCanvas} 
                                                    className="p-2 rounded-full bg-gray-200 hover:bg-gray-300 transition-colors"
                                                    title="Clear canvas"
                                                >
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                    </svg>
                                                </button>
                                            </div>
                                        </div>
                                        <div className="canvas-container">
                                            <canvas
                                                  ref={canvasRef}
                                                  onPointerDown={startDrawing}
                                                  onPointerMove={draw}
                                                  onPointerUp={stopDrawing}
                                                  onPointerLeave={stopDrawing}
                                                />
                                            </div>
                                        <div className="flex flex-col sm:flex-row items-center gap-4 mt-2">
                                            {isFillMode && (
                                                <div className="bg-purple-100 border border-purple-300 rounded-lg px-3 py-1 text-sm text-purple-700 font-medium">
                                                    🪣 Fill Mode Active
                                                </div>
                                            )}
                                            <div className="flex flex-row gap-2 items-center w-full">
                                                🖌️
                                                <input
                                                    type="range"
                                                    min="1"
                                                    max="30"
                                                    value={brushSize}
                                                    onChange={e => setBrushSize(Number(e.target.value))}
                                                    className="flex-grow"
                                                    disabled={isFillMode}
                                                />
                                            </div>
                                            <button 
                                                onClick={handleSubmitAnswer} 
                                                disabled={!!compressionStatus} 
                                                className="bg-purple-600 text-white px-8 py-3 rounded-lg hover:bg-purple-700 w-full sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {compressionStatus || 'Submit Drawing'}
                                            </button>
                                        </div>
                                        {compressionStatus && (
                                            <div className="mt-2 text-center text-sm text-gray-600">
                                                {compressionStatus}
                                            </div>
                                        )}
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