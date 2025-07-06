import React, { useState, useEffect } from 'react';
import { useGame } from '../contexts/GameContext';
import { Answer, VoteResult } from '../types/game';
import { signalRService } from '../services/signalR';
import './JudgingPage.css';

export const JudgingPage: React.FC = () => {
    const { game, player, currentRound, answers, players, judgingModeEnabled } = useGame();
    const [selectedVotes, setSelectedVotes] = useState<{ [rank: number]: number | null }>({});
    const [voteResults, setVoteResults] = useState<VoteResult[]>([]);
    const [hasVoted, setHasVoted] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [maxVotes, setMaxVotes] = useState(3);
    const [actualVotesNeeded, setActualVotesNeeded] = useState(3);

    // Filter out the current player's own drawing
    const otherPlayersAnswers = answers.filter(answer => answer.playerId !== player?.playerId);
    
    // Calculate actual votes needed based on available drawings
    const availableDrawings = otherPlayersAnswers.length;
    const effectiveMaxVotes = Math.min(maxVotes, availableDrawings);

    useEffect(() => {
        // Get max votes for this game
        const getMaxVotes = async () => {
            if (game?.joinCode) {
                try {
                    const max = await signalRService.getMaxVotesForGame(game.joinCode);
                    setMaxVotes(max);
                } catch (error) {
                    console.error('Error getting max votes:', error);
                }
            }
        };

        getMaxVotes();

        // Set up vote results listener
        signalRService.onVoteResultsUpdated((results: VoteResult[], maxVotes: number) => {
            setVoteResults(results);
            setMaxVotes(maxVotes);
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

    // Update actual votes needed when maxVotes or available drawings change
    useEffect(() => {
        const availableDrawings = otherPlayersAnswers.length;
        const effectiveMaxVotes = Math.min(maxVotes, availableDrawings);
        setActualVotesNeeded(effectiveMaxVotes);
        
        // Initialize or update selectedVotes with the correct number of ranks
        const initialVotes: { [rank: number]: number | null } = {};
        for (let i = 1; i <= effectiveMaxVotes; i++) {
            initialVotes[i] = null;
        }
        setSelectedVotes(initialVotes);
    }, [maxVotes, otherPlayersAnswers.length]);

    const handleVoteSelect = (rank: number, answerId: number | null) => {
        setSelectedVotes(prev => {
            const newVotes = { ...prev };
            
            // If selecting the same answer for the same rank, deselect it
            if (newVotes[rank] === answerId) {
                newVotes[rank] = null;
            } else {
                // If selecting a different answer, update it
                newVotes[rank] = answerId;
                
                // Remove this answer from other ranks to prevent duplicates
                Object.keys(newVotes).forEach(key => {
                    const rankKey = parseInt(key);
                    if (rankKey !== rank && newVotes[rankKey] === answerId) {
                        newVotes[rankKey] = null;
                    }
                });
            }
            
            return newVotes;
        });
    };

    const handleSubmitVotes = async () => {
        if (!game?.joinCode || !player) return;

        setIsSubmitting(true);
        try {
            // Submit each vote
            for (const [rankStr, answerId] of Object.entries(selectedVotes)) {
                if (answerId !== null) {
                    const rank = parseInt(rankStr);
                    console.log('Submitting vote:', { joinCode: game.joinCode, answerId, rank });
                    await signalRService.submitVote(game.joinCode, answerId, rank);
                }
            }
            setHasVoted(true);
        } catch (error) {
            console.error('Error submitting votes:', error);
            alert('Failed to submit votes. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const getVoteCountForAnswer = (answerId: number) => {
        const result = voteResults.find(r => r.answerId === answerId);
        return result ? result.totalPoints : 0;
    };

    const getVoteDisplayForAnswer = (answerId: number) => {
        const result = voteResults.find(r => r.answerId === answerId);
        if (!result) return null;
        
        return (
            <div className="vote-display">
                <div className="vote-badge">
                    <span className="vote-points">{result.totalPoints} pts</span>
                </div>
                <div className="vote-breakdown">
                    <span className="vote-rank">🥇 {result.firstPlaceVotes}</span>
                    <span className="vote-rank">🥈 {result.secondPlaceVotes}</span>
                    <span className="vote-rank">🥉 {result.thirdPlaceVotes}</span>
                </div>
            </div>
        );
    };

    const canSubmit = Object.values(selectedVotes).every(vote => vote !== null) && actualVotesNeeded > 0;

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
                                <p className="prompt-text">"{currentRound.prompt}"</p>
                            </div>
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
                        <h1 className="header-title">🎨 Vote for Your Favorites!</h1>
                        <div className="prompt-card">
                            <p className="prompt-text">"{currentRound.prompt}"</p>
                        </div>
                    </div>
                </div>

                {/* Instructions Section */}
                {actualVotesNeeded > 0 && !hasVoted && (
                    <div className="instructions-section">
                        <div className="instructions-card">
                            <h2 className="instructions-title">How to Vote</h2>
                            <div className="instructions-grid">
                                {actualVotesNeeded >= 1 && (
                                    <div className="instruction-item">
                                        <div className="rank-badge first">🥇</div>
                                        <div className="instruction-content">
                                            <h3>1st Place</h3>
                                            <p>Your absolute favorite (3 points)</p>
                                        </div>
                                    </div>
                                )}
                                {actualVotesNeeded >= 2 && (
                                    <div className="instruction-item">
                                        <div className="rank-badge second">🥈</div>
                                        <div className="instruction-content">
                                            <h3>2nd Place</h3>
                                            <p>Your second favorite (2 points)</p>
                                        </div>
                                    </div>
                                )}
                                {actualVotesNeeded >= 3 && (
                                    <div className="instruction-item">
                                        <div className="rank-badge third">🥉</div>
                                        <div className="instruction-content">
                                            <h3>3rd Place</h3>
                                            <p>Your third favorite (1 point)</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

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
                ) : actualVotesNeeded === 0 ? (
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
                                        {getVoteDisplayForAnswer(answer.answerId)}
                                    </div>
                                    
                                    <div className="drawing-info">
                                        <h3 className="artist-name">{answer.playerName}</h3>
                                        
                                        <div className="vote-buttons">
                                            {actualVotesNeeded >= 1 && (
                                                <button
                                                    className={`vote-btn ${selectedVotes[1] === answer.answerId ? 'selected first' : ''}`}
                                                    onClick={() => handleVoteSelect(1, answer.answerId)}
                                                    disabled={selectedVotes[1] !== null && selectedVotes[1] !== answer.answerId}
                                                >
                                                    🥇 1st
                                                </button>
                                            )}
                                            {actualVotesNeeded >= 2 && (
                                                <button
                                                    className={`vote-btn ${selectedVotes[2] === answer.answerId ? 'selected second' : ''}`}
                                                    onClick={() => handleVoteSelect(2, answer.answerId)}
                                                    disabled={selectedVotes[2] !== null && selectedVotes[2] !== answer.answerId}
                                                >
                                                    🥈 2nd
                                                </button>
                                            )}
                                            {actualVotesNeeded >= 3 && (
                                                <button
                                                    className={`vote-btn ${selectedVotes[3] === answer.answerId ? 'selected third' : ''}`}
                                                    onClick={() => handleVoteSelect(3, answer.answerId)}
                                                    disabled={selectedVotes[3] !== null && selectedVotes[3] !== answer.answerId}
                                                >
                                                    🥉 3rd
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Vote Summary */}
                        <div className="vote-summary">
                            <div className="summary-card">
                                <h3 className="summary-title">Your Votes</h3>
                                <div className="selected-votes">
                                    {actualVotesNeeded >= 1 && (
                                        <div className="vote-item">
                                            <span className="vote-rank">🥇 1st:</span>
                                            <span className="vote-player">
                                                {selectedVotes[1] ? otherPlayersAnswers.find(a => a.answerId === selectedVotes[1])?.playerName : 'Not selected'}
                                            </span>
                                        </div>
                                    )}
                                    {actualVotesNeeded >= 2 && (
                                        <div className="vote-item">
                                            <span className="vote-rank">🥈 2nd:</span>
                                            <span className="vote-player">
                                                {selectedVotes[2] ? otherPlayersAnswers.find(a => a.answerId === selectedVotes[2])?.playerName : 'Not selected'}
                                            </span>
                                        </div>
                                    )}
                                    {actualVotesNeeded >= 3 && (
                                        <div className="vote-item">
                                            <span className="vote-rank">🥉 3rd:</span>
                                            <span className="vote-player">
                                                {selectedVotes[3] ? otherPlayersAnswers.find(a => a.answerId === selectedVotes[3])?.playerName : 'Not selected'}
                                            </span>
                                        </div>
                                    )}
                                </div>
                                <button
                                    className={`submit-votes-btn ${canSubmit ? 'enabled' : 'disabled'}`}
                                    onClick={handleSubmitVotes}
                                    disabled={!canSubmit || isSubmitting}
                                >
                                    {isSubmitting ? 'Submitting...' : 'Submit Votes'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}; 