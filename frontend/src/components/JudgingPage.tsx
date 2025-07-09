import React, { useState, useEffect } from 'react';
import { useGame } from '../contexts/GameContext';
import { Answer, VoteResult } from '../types/game';
import { signalRService } from '../services/signalR';
import './JudgingPage.css';
import { useNavigate } from 'react-router-dom';

export const JudgingPage: React.FC = () => {
    const { game, player, currentRound, answers, players, judgingModeEnabled, isReader, leaveGame } = useGame();
    const [selectedVote, setSelectedVote] = useState<number | null>(null);
    const [voteResults, setVoteResults] = useState<VoteResult[]>([]);
    const [hasVoted, setHasVoted] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const navigate = useNavigate();

    // Filter out the current player's own drawing
    const otherPlayersAnswers = answers.filter(answer => answer.playerId !== player?.playerId);
    
    useEffect(() => {
        // Set up vote results listener
        signalRService.onVoteResultsUpdated((results: VoteResult[], maxVotes: number) => {
            setVoteResults(results);
        });

        // Set up judging mode listener to update state when enabled
        signalRService.onJudgingModeToggled((enabled: boolean) => {
            if (enabled) {
                console.log('Judging mode enabled, updating state');
                // The state will be updated by the GameContext, no need to refresh
            }
        });

        return () => {
            signalRService.onVoteResultsUpdated(() => {});
            signalRService.onJudgingModeToggled(() => {});
        };
    }, []); // Empty dependency array - only run once

    const handleVoteSelect = (answerId: number | null) => {
        // If selecting the same answer, deselect it
        if (selectedVote === answerId) {
            setSelectedVote(null);
        } else {
            // Select the new answer
            setSelectedVote(answerId);
        }
    };

    const handleSubmitVote = async () => {
        if (!game?.joinCode || !player || selectedVote === null) return;

        setIsSubmitting(true);
        try {
            console.log('Submitting vote:', { joinCode: game.joinCode, answerId: selectedVote });
            await signalRService.submitVote(game.joinCode, selectedVote);
            setHasVoted(true);
        } catch (error) {
            console.error('Error submitting vote:', error);
            alert('Failed to submit vote. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const getVoteCountForAnswer = (answerId: number) => {
        const result = voteResults.find(r => r.answerId === answerId);
        return result ? result.voteCount : 0;
    };

    const getVoteDisplayForAnswer = (answerId: number) => {
        const result = voteResults.find(r => r.answerId === answerId);
        if (!result) return null;
        
        return (
            <div className="vote-display">
                <div className="vote-badge">
                    <span className="vote-points">{result.voteCount} votes</span>
                </div>
            </div>
        );
    };

    const canSubmit = selectedVote !== null && otherPlayersAnswers.length > 0;

    const handleLeaveGame = async () => {
        const message = isReader 
            ? 'Are you sure you want to leave? This will end the game for all players.'
            : 'Are you sure you want to leave the game?';
            
        if (window.confirm(message)) {
            await leaveGame();
            navigate('/');
        }
    };

    if (!currentRound || !player) {
        return (
            <div className="judging-page">
                <div className="loading-container">
                    <div className="loading-spinner"></div>
                    <p>Loading voting session...</p>
                </div>
            </div>
        );
    }

    // Check if judging mode is enabled
    if (!judgingModeEnabled) {
        return (
            <div className="judging-page">
                <div className="judging-container">
                    <div className="judging-header">
                        <div className="header-content">
                            <h1 className="header-title">🎨 Waiting for Host</h1>
                            <div className="prompt-card">
                                <div className="prompt-header">
                                    <p className="prompt-text">"{currentRound.prompt}"</p>
                                </div>
                            </div>
                            <button className="leave-game-btn-integrated" onClick={handleLeaveGame}>
                                Leave Game
                            </button>
                        </div>
                    </div>
                    
                    <div className="waiting-section">
                        <div className="waiting-card">
                            <div className="waiting-icon">⏳</div>
                            <h2>Judging Mode Not Enabled</h2>
                            <p>The host needs to enable judging mode before voting can begin.</p>
                            <div className="waiting-info">
                                <p>All players have submitted their drawings, but the host hasn't enabled voting yet.</p>
                                <p>Please wait for the host to enable judging mode.</p>
                            </div>
                            <button
                                className="refresh-btn"
                                onClick={() => window.location.reload()}
                            >
                                Refresh Page
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="judging-page">
            {/* New Round Notification */}
           
            
            <div className="judging-container">
                {/* Header Section */}
                <div className="judging-header">
                    <div className="header-content">
                        <h1 className="header-title">🎨 Vote for Your Favorite!</h1>
                        <div className="prompt-card">
                            <div className="prompt-header">
                                <p className="prompt-text">"{currentRound.prompt}"</p>
                            </div>
                        </div>
                        <button className="leave-game-btn-integrated" onClick={handleLeaveGame}>
                            Leave Game
                        </button>
                    </div>
                </div>

                {/* Instructions Section
                {otherPlayersAnswers.length > 0 && !hasVoted && (
                    <div className="instructions-section">
                        <div className="instructions-card">
                            <h2 className="instructions-title">How to Vote</h2>
                            <div className="instructions-grid">
                                <div className="instruction-item">
                                    <div className="rank-badge first">❤️</div>
                                    <div className="instruction-content">
                                        <h3>Vote for Your Favorite</h3>
                                        <p>Click on the drawing you like the most!</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )} */}

                {/* Main Content */}
                {hasVoted ? (
                    <div className="voting-complete">
                        <div className="complete-card">
                            <div className="complete-header">
                                <div className="success-icon">✅</div>
                                <h2>Thanks for voting!</h2>
                                <p>Waiting for other players to finish...</p>
                            </div>
                        </div>
                    </div>
                ) : otherPlayersAnswers.length === 0 ? (
                    <div className="no-voting-section">
                        <div className="no-voting-card">
                            <div className="no-voting-icon">🎨</div>
                            <h2>No Drawings to Vote On</h2>
                            <p>There are no other drawings available to vote on in this round.</p>
                            <div className="no-voting-reasons">
                                <p>This might happen if:</p>
                                <ul>
                                    <li>You're the only player who submitted a drawing</li>
                                    <li>Other players haven't submitted their drawings yet</li>
                                </ul>
                            </div>
                            <button
                                className="skip-voting-btn"
                                onClick={() => setHasVoted(true)}
                            >
                                Skip Voting
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="voting-section">
                        {/* Drawings Grid */}
                        <div className="drawings-grid">
                            {otherPlayersAnswers.map((answer) => (
                                <div key={answer.answerId} className="drawing-card">
                                    <div className="drawing-image-container">
                                        <img 
                                            src={answer.content} 
                                            alt={`Drawing by ${answer.playerName}`}
                                            className="drawing-image"
                                        />
                                    </div>
                                    
                                    <div className="drawing-info">
                                        <h3 className="artist-name">{answer.playerName}</h3>
                                        
                                        <div className="vote-buttons">
                                            <button
                                                className={`vote-btn ${selectedVote === answer.answerId ? 'selected first' : ''}`}
                                                onClick={() => handleVoteSelect(answer.answerId)}
                                            >
                                                💜 Vote
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Vote Summary */}
                        <div className="vote-summary">
                            <div className="summary-card">
                                <h3 className="summary-title">Your Vote</h3>
                                <div className="selected-votes">
                                    <div className="vote-item">
                                        <span className="vote-rank">💜 Favorite:</span>
                                        <span className="vote-player">
                                            {selectedVote ? otherPlayersAnswers.find(a => a.answerId === selectedVote)?.playerName : 'Not selected'}
                                        </span>
                                    </div>
                                </div>
                                <button
                                    className={`submit-votes-btn ${canSubmit ? 'enabled' : 'disabled'}`}
                                    onClick={handleSubmitVote}
                                    disabled={!canSubmit || isSubmitting}
                                >
                                    {isSubmitting ? 'Submitting...' : 'Submit Vote'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}; 