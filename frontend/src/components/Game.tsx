import React, { useState, useEffect, useRef, useCallback } from 'react';
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
        judgingModeEnabled, toggleJudgingMode, roundsWithVotingEnabled,
        setSelectedTimerDuration, setTimeRemaining, setRoundStartTime, setIsTimerActive, setOnTimerExpire
    } = useGame();

    // ✅ DEBUG: Log players array changes
    useEffect(() => {
        console.log('🎯 Game component - players array updated:', players);
        console.log('🎯 Game component - players length:', players.length);
        console.log('🎯 Game component - game?.players:', game?.players);
    }, [players, game?.players]);
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
    // Add pen input tolerance
    const [lastPointerId, setLastPointerId] = useState<number | null>(null);
    // Add per-round voting mode state
    const [roundVotingMode, setRoundVotingMode] = useState(false);
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

    // Debug function to test detailed vote results API
    const testDetailedVoteResults = async () => {
        if (!currentRound) return;
        try {
            console.log('🔍 MANUAL TEST: Fetching detailed vote results for round:', currentRound.roundId);
            const detailedResults = await getDetailedVoteResults(currentRound.roundId);
            console.log('🔍 MANUAL TEST: Detailed vote results received:', detailedResults);
            
            // Also test the debug endpoint
            try {
                const apiUrl = import.meta.env.VITE_API_URL || 'https://whiteboardv2-backend-ckf7efgxbxbjg0ft.eastus-01.azurewebsites.net/api';
                const response = await fetch(`${apiUrl}/votes/debug/all`);
                const allVotes = await response.json();
                console.log('🔍 MANUAL TEST: All votes in database:', allVotes);
            } catch (error) {
                console.error('🔍 MANUAL TEST: Error fetching all votes:', error);
            }
        } catch (error) {
            console.error('🔍 MANUAL TEST: Error fetching detailed vote results:', error);
        }
    };

    // Fetch detailed vote results
    const fetchDetailedVoteResults = useCallback(async () => {
        if (!currentRound) return;
        try {
            console.log('🔍 Fetching detailed vote results for round:', currentRound.roundId);
            const detailedResults = await getDetailedVoteResults(currentRound.roundId);
            console.log('🔍 Detailed vote results received:', detailedResults);
            console.log('🔍 Detailed results structure:', detailedResults.map(r => ({
                answerId: r.answerId,
                playerName: r.playerName,
                voteCount: r.voteCount,
                voters: r.voters
            })));
            setDetailedVoteResults(detailedResults);
        } catch (error) {
            console.error('❌ Error fetching detailed vote results:', error);
        }
    }, [currentRound]);

    // Set up vote results listener
    useEffect(() => {
        signalRService.onVoteResultsUpdated((results: any[], maxVotes: number) => {
            console.log('Vote results updated:', results);
            setVoteResults(results);
            // Fetch detailed vote results when vote results are updated
            if (currentRound) {
                console.log('🔍 Triggering detailed vote results fetch due to vote results update');
                fetchDetailedVoteResults();
            }
        });

        return () => {
            signalRService.onVoteResultsUpdated(() => {});
        };
    }, [currentRound, fetchDetailedVoteResults]);

    // Fetch detailed vote results when there are votes or judging mode is enabled
    useEffect(() => {
        if (currentRound) {
            console.log('🔍 Triggering detailed vote results fetch due to currentRound change');
            fetchDetailedVoteResults();
        }
    }, [currentRound]);

    // Also fetch detailed results when answers change (in case votes were cast before answers loaded)
    useEffect(() => {
        if (currentRound && answers.length > 0) {
            console.log('🔍 Triggering detailed vote results fetch due to answers change');
            fetchDetailedVoteResults();
        }
    }, [currentRound, answers.length]);

    // Check if all players have submitted
    useEffect(() => {
        if (currentRound && players.length > 0) {
            const nonReaderPlayers = players.filter(p => !p.isReader);
            const allSubmitted = nonReaderPlayers.length > 0 && 
                nonReaderPlayers.every(p => playersWhoSubmitted.has(p.playerId));
            setAllPlayersSubmitted(allSubmitted);
        }
    }, [currentRound, players, playersWhoSubmitted]);

    // Debug logging for currentRound changes
    useEffect(() => {
        if (currentRound) {
            console.log('Current round updated:', {
                roundId: currentRound.roundId,
                prompt: currentRound.prompt,
                timerDurationMinutes: currentRound.timerDurationMinutes,
                isCompleted: currentRound.isCompleted
            });
        } else {
            console.log('Current round cleared');
        }
    }, [currentRound]);

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
        console.log('Prompt selected:', selectedPrompt);
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
        
        // Use pointer coordinates for better pen support
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // Clamp coordinates to canvas bounds
        return {
            x: Math.max(0, Math.min(x, canvas.width)),
            y: Math.max(0, Math.min(y, canvas.height))
        };
    };

    const startDrawing = (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        
        const { x, y } = getCoordinates(e);
        
        // Handle fill bucket tool
        if (isFillMode) {
            floodFill(Math.floor(x), Math.floor(y), selectedColor);
            return;
        }
        
        const ctx = canvasRef.current?.getContext('2d');
        if (!ctx) return;
        
        // Track pointer ID for pen support
        setLastPointerId(e.pointerId);
        
        // Reset drawing state
        setIsDrawing(true);
        setHasMoved(false);
        setStartPoint({ x, y });

        // Set drawing styles with consistent brush size
        ctx.strokeStyle = selectedColor;
        ctx.fillStyle = selectedColor;
        ctx.lineWidth = brushSize; // Use consistent brush size
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Start new path
        ctx.beginPath();
        ctx.moveTo(x, y);
    };

    const draw = (e: React.PointerEvent) => {
        if (!isDrawing || e.pointerId !== lastPointerId) return;
        e.preventDefault();
        e.stopPropagation();
        
        const { x, y } = getCoordinates(e);
        const ctx = canvasRef.current?.getContext('2d');
        if (!ctx) return;

        // Check if we've moved enough to consider it a stroke
        const distance = Math.sqrt((x - startPoint.x) ** 2 + (y - startPoint.y) ** 2);
        if (distance > 2) {
            setHasMoved(true);
        } 

        // Use consistent brush size
        ctx.lineWidth = brushSize;

        // Continue the line
        ctx.lineTo(x, y);
        ctx.stroke();
    };

    const stopDrawing = (e?: React.PointerEvent) => {
        if (!isDrawing) return;
        
        // Only stop if it's the same pointer or no specific pointer
        if (e && e.pointerId !== lastPointerId) return;
        
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        
        setIsDrawing(false);
        setLastPointerId(null);

        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!ctx || !canvas) return;

        if (!hasMoved) {
            // Draw dot if user didn't move
            ctx.beginPath();
            ctx.arc(startPoint.x, startPoint.y, brushSize / 2, 0, 2 * Math.PI);
            ctx.fillStyle = selectedColor;
            ctx.fill();
            ctx.closePath();
        } else {
            // Ensure the path is properly closed
            ctx.closePath();
        }

        // Save for undo
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

        // Convert hex color to RGBA
        const hexToRgba = (hex: string) => {
            let c = hex.replace('#', '');
            if (c.length === 3) c = c[0]+c[0]+c[1]+c[1]+c[2]+c[2];
            const num = parseInt(c, 16);
            return {
                r: (num >> 16) & 255,
                g: (num >> 8) & 255,
                b: num & 255,
                a: 255
            };
        };
        const fillRgba = hexToRgba(fillColor);

        // Clamp coordinates
        const clampedX = Math.max(0, Math.min(startX, canvas.width - 1));
        const clampedY = Math.max(0, Math.min(startY, canvas.height - 1));

        // Get the target color (the color we're replacing)
        const targetIndex = (clampedY * canvas.width + clampedX) * 4;
        const targetR = data[targetIndex];
        const targetG = data[targetIndex + 1];
        const targetB = data[targetIndex + 2];
        const targetA = data[targetIndex + 3];

        // If the target color is already the fill color (including alpha), do nothing
        if (
            Math.abs(targetR - fillRgba.r) < 2 &&
            Math.abs(targetG - fillRgba.g) < 2 &&
            Math.abs(targetB - fillRgba.b) < 2 &&
            Math.abs(targetA - fillRgba.a) < 2
        ) {
            return;
        }

        // Helper to compare colors (RGBA)
        const colorMatch = (i: number) => {
            return (
                Math.abs(data[i] - targetR) < 16 &&
                Math.abs(data[i + 1] - targetG) < 16 &&
                Math.abs(data[i + 2] - targetB) < 16 &&
                Math.abs(data[i + 3] - targetA) < 16
            );
        };

        // Flood fill using BFS
        const queue: [number, number][] = [[clampedX, clampedY]];
        const visited = new Uint8Array(canvas.width * canvas.height);
        while (queue.length > 0) {
            const [x, y] = queue.shift()!;
            if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) continue;
            const idx = (y * canvas.width + x);
            if (visited[idx]) continue;
            const i = idx * 4;
            if (!colorMatch(i)) continue;
            // Fill pixel
            data[i] = fillRgba.r;
            data[i + 1] = fillRgba.g;
            data[i + 2] = fillRgba.b;
            data[i + 3] = fillRgba.a;
            visited[idx] = 1;
            // Add neighbors
            queue.push([x + 1, y]);
            queue.push([x - 1, y]);
            queue.push([x, y + 1]);
            queue.push([x, y - 1]);
        }
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
            
            // ✅ ENHANCED: Check connection status before submitting
            if (connectionStatus === 'disconnected') {
                console.log('Connection is disconnected, attempting to reconnect before submission');
                setCompressionStatus('Reconnecting...');
                
                // Try to reconnect
                try {
                    await signalRService.forceReconnect();
                    await signalRService.joinGame(game.joinCode, player.name);
                    setCompressionStatus('Sending...');
                } catch (reconnectError) {
                    console.error('Failed to reconnect:', reconnectError);
                    throw new Error('Connection lost. Please refresh the page and try again.');
                }
            }
            
            await submitAnswer(base64Image);
            clearCanvasWithoutConfirmation(); // Use the version without confirmation
        } catch (error: any) {
            console.error('Error submitting answer:', error);
            
            // ✅ ENHANCED: Better error messages for different scenarios
            let errorMessage = 'Failed to submit drawing. Please try again.';
            
            if (error.message?.includes('Connection lost')) {
                errorMessage = 'Connection lost. Please refresh the page and try again.';
            } else if (error.message?.includes('No longer in game')) {
                errorMessage = 'You are no longer in the game. Please refresh and rejoin.';
            } else if (error.message?.includes('Player not identified')) {
                errorMessage = 'Connection issue. Please refresh the page and try again.';
            } else if (error.message?.includes('already submitted')) {
                errorMessage = 'You have already submitted a drawing for this round.';
            }
            
            alert(errorMessage);
        } finally {
            setCompressionStatus('');
        }
    };  
     
    const handleStartRound = async () => {
        if (!prompt.trim() || !game) return;
        // Use the full prompt text (with parentheses) for starting the round
        console.log('Starting round with prompt:', prompt);
        console.log('Round voting mode:', roundVotingMode);
        await startNewRound(prompt, selectedTimerDuration || undefined, roundVotingMode);
        setPrompt('');
        // Reset answer state when starting a new round
        setShowAnswer(false);
        setCurrentAnswer('');
        // Reset fill mode when starting new round
        setIsFillMode(false);
        // Reset round voting mode after starting round
        // setRoundVotingMode(false);
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
            console.log('🎯 Game component: User confirmed leaving game');
            try {
                await leaveGame();
                console.log('🎯 Game component: Successfully left game, navigating to home');
                navigate('/');
            } catch (error) {
                console.error('🎯 Game component: Error leaving game:', error);
                // Even if there's an error, we should still navigate away
                navigate('/');
            }
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
                        {voteResult && voteResult.voteCount > 0 && (
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
                        {detailedVoteResult && detailedVoteResult.voters && detailedVoteResult.voters.length > 0 ? (
                            <div className="voter-list-below">
                                <div className="voter-list">
                                    {detailedVoteResult.voters.map((voter: any, index: number) => (
                                        <div key={index} className="voter-item">
                                            <span className="voter-name">{voter.voterName}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="voter-list-below">
                                {/* <div className="text-sm text-gray-500 italic">No votes yet</div> */}
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
            const isPlayerIdentified = signalRService.isPlayerIdentified();
            const isIntentionallyLeaving = signalRService.isIntentionallyLeaving();
            
            console.log('🎯 Connection status check:', {
                isInGame,
                isConnected,
                isReconnecting,
                isPlayerIdentified,
                isIntentionallyLeaving
            });
            
            if (isIntentionallyLeaving) {
                setConnectionStatus('disconnected');
            } else if (!isInGame) {
                setConnectionStatus('disconnected');
            } else if (isReconnecting || !isConnected) {
                setConnectionStatus('reconnecting');
            } else if (!isPlayerIdentified) {
                // Connected but player not properly identified
                setConnectionStatus('reconnecting');
            } else {
                setConnectionStatus('connected');
            }
        };

        // ✅ OPTIMIZED: Ultra-fast connection checks for maximum responsiveness
        const interval = setInterval(checkConnection, 1000); // Check every 1 second for instant feedback
        checkConnection(); // Initial check

        return () => clearInterval(interval);
    }, []);

    if (!game || !player) return <div className="text-center p-8">Loading...</div>;

    return (
        <div className="min-h-screen bg-gray-50 p-4" style={{
            userSelect: 'none',
            WebkitUserSelect: 'none',
            MozUserSelect: 'none',
            msUserSelect: 'none',
            touchAction: 'manipulation'
        }}>
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
            
            {/* Connection warning when player is not properly identified
            {isTimerActive && connectionStatus === 'reconnecting' && !isReader && !playersWhoSubmitted.has(player?.playerId || 0) && (
                <div className="fixed top-20 right-4 z-50 bg-yellow-50 border border-yellow-200 rounded-lg p-3 max-w-sm">
                    <div className="flex items-center gap-2">
                        <div className="text-yellow-600">🔄</div>
                        <div className="text-sm text-yellow-700">
                            <div className="font-semibold">Reconnecting...</div>
                            <div>Please wait while we restore your connection to the game.</div>
                        </div>
                    </div>
                </div>
            )} */}
            
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
                                    
                                    <div className="flex items-center gap-3">
                                        <span className="text-sm font-medium text-gray-700">Round Voting Mode</span>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                console.log('🔍 Round voting toggle switch clicked!');
                                                console.log('🔍 Current roundVotingMode:', roundVotingMode);
                                                const newValue = !roundVotingMode;
                                                console.log('🔍 New value:', newValue);
                                                setRoundVotingMode(newValue);
                                                console.log('🔍 Updated roundVotingMode to:', newValue);
                                            }}
                                            disabled={!isReader}
                                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 ${
                                                roundVotingMode ? 'bg-purple-600' : 'bg-gray-200'
                                            }`}
                                            role="switch"
                                            aria-checked={roundVotingMode}
                                        >
                                            <div className="absolute inset-0 flex items-center justify-center text-xs text-white font-bold">
                                                {roundVotingMode ? 'ON' : 'OFF'}
                                            </div>
                                            <span
                                                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                                    roundVotingMode ? 'translate-x-6' : 'translate-x-1'
                                                }`}
                                            />
                                        </button>
                                    </div>
                                    {roundVotingMode && (
                                        <span className="text-xs text-purple-600 bg-purple-50 px-2 py-1 rounded">
                                            This round will have voting enabled
                                        </span>
                                    )}
                                    {!roundVotingMode && (
                                        <span className="text-xs text-gray-600 bg-gray-50 px-2 py-1 rounded">
                                            This round will not have voting
                                        </span>
                                    )}
                                    {!isReader && (
                                        <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
                                            Only the host can toggle voting mode
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
                                    
                                    {/* Show voting progress for host */}
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
                                        
                                        // ✅ FIX: Only count active players who are still in the game
                                        // Filter out any voters who are no longer in the current player list
                                        const activeVoters = Array.from(uniqueVoters).filter(voterName => 
                                            nonReaderPlayers.some(player => player.name === voterName)
                                        );
                                        const activeVotesSoFar = activeVoters.length;
                                        const totalActiveVoters = nonReaderPlayers.length;
                                        
                                        // Only show if there are votes or if judging mode is enabled
                                        if (votesSoFar > 0 || game?.judgingModeEnabled) {
                                            return (
                                                <div className="mt-4 pt-4 border-t border-purple-200">
                                                    <div className="flex justify-between items-center mb-2">
                                                        <span className="text-sm font-medium text-purple-700">Player Votes:</span>
                                                        <span className="text-sm text-purple-600">
                                                            {activeVotesSoFar} of {totalActiveVoters} active players
                                                        </span>
                                                    </div>
                                                    <div className="w-full bg-purple-200 rounded-full h-2">
                                                        <div 
                                                            className={`h-2 rounded-full transition-all duration-300 ${activeVotesSoFar === totalActiveVoters && totalActiveVoters > 0 ? 'bg-green-500' : 'bg-purple-500'}`}
                                                            style={{ 
                                                                width: `${totalActiveVoters > 0 ? (activeVotesSoFar / totalActiveVoters) * 100 : 0}%` 
                                                            }}
                                                        ></div>
                                                    </div>
                                                    {/* Show departed voters if any */}
                                                    {votesSoFar > activeVotesSoFar && (
                                                        <div className="mt-2 text-xs text-gray-500">
                                                            {votesSoFar - activeVotesSoFar} vote{votesSoFar - activeVotesSoFar !== 1 ? 's' : ''} from departed player{votesSoFar - activeVotesSoFar !== 1 ? 's' : ''}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        }
                                        return null;
                                    })()}
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
                                    {/* Debug info for reconnection issues */}
                                    {/* <div className="mt-2 text-xs text-gray-500">
                                        Round ID {currentRound.roundId}, Timer: {currentRound.timerDurationMinutes || 'none'}
                                    </div> */}
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
                                        
                                        {currentRound && roundsWithVotingEnabled.has(currentRound.roundId) && (
                                            <div className={`border rounded-lg p-3 ${allPlayersSubmitted ? 'bg-purple-100 border-purple-300' : 'bg-purple-50 border-purple-200'}`}>
                                                {allPlayersSubmitted ? (
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-5 h-5 bg-purple-500 rounded-full flex items-center justify-center">
                                                            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                            </svg>
                                                        </div>
                                                        <p className="text-purple-800 text-sm font-medium">
                                                            All players have submitted! Redirecting to voting...
                                                        </p>
                                                    </div>
                                                ) : (
                                                    <p className="text-purple-800 text-sm">
                                                        <strong>Voting Mode Enabled:</strong> You'll be automatically redirected to vote for your favorite drawings once everyone has submitted.
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                        
                                        {currentRound && !roundsWithVotingEnabled.has(currentRound.roundId) && allPlayersSubmitted && (
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
                                        <div className="canvas-container select-none" style={{ 
                                            userSelect: 'none', 
                                            WebkitUserSelect: 'none', 
                                            MozUserSelect: 'none', 
                                            msUserSelect: 'none',
                                            touchAction: 'none',
                                            WebkitTouchCallout: 'none',
                                            WebkitTapHighlightColor: 'transparent',
                                            WebkitUserModify: 'read-only',
                                            WebkitOverflowScrolling: 'touch'
                                        }}>
                                            <canvas
                                                ref={canvasRef}
                                                onPointerDown={startDrawing}
                                                onPointerMove={draw}
                                                onPointerUp={stopDrawing}
                                                onPointerLeave={stopDrawing}
                                                onPointerCancel={stopDrawing}
                                                onTouchStart={(e) => e.preventDefault()}
                                                onTouchMove={(e) => e.preventDefault()}
                                                onTouchEnd={(e) => e.preventDefault()}
                                                style={{ 
                                                    userSelect: 'none', 
                                                    WebkitUserSelect: 'none', 
                                                    MozUserSelect: 'none', 
                                                    msUserSelect: 'none',
                                                    touchAction: 'none',
                                                    WebkitTouchCallout: 'none',
                                                    WebkitTapHighlightColor: 'transparent',
                                                    WebkitUserModify: 'read-only',
                                                    WebkitOverflowScrolling: 'touch'
                                                }}
                                            />
                                        </div>
                                        <div className="flex flex-col sm:flex-row items-center gap-4 mt-2 select-none" style={{ userSelect: 'none', WebkitUserSelect: 'none', MozUserSelect: 'none', msUserSelect: 'none' }}>
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
                                                className="bg-purple-600 text-white px-8 py-3 rounded-lg hover:bg-purple-700 w-full sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed select-none user-select-none"
                                                style={{ 
                                                    userSelect: 'none',
                                                    WebkitUserSelect: 'none',
                                                    MozUserSelect: 'none',
                                                    msUserSelect: 'none'
                                                }}
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