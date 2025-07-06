import React, { useState, useEffect } from 'react';
import { useGame } from '../contexts/GameContext';
import { Answer, VoteResult } from '../types/game';
import { signalRService } from '../services/signalR';
import './JudgingPage.css';

export const JudgingPage: React.FC = () => {
    const { game, player, currentRound, answers, players } = useGame();
    const [selectedVotes, setSelectedVotes] = useState<{ [rank: number]: number | null }>({
        1: null, // 1st place
        2: null, // 2nd place  
        3: null  // 3rd place
    });
    const [voteResults, setVoteResults] = useState<VoteResult[]>([]);
    const [hasVoted, setHasVoted] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Filter out the current player's own drawing
    const otherPlayersAnswers = answers.filter(answer => answer.playerId !== player?.playerId);

    useEffect(() => {
        // Set up vote results listener
        signalRService.onVoteResultsUpdated((results: VoteResult[]) => {
            setVoteResults(results);
        });

        return () => {
            signalRService.onVoteResultsUpdated(() => {});
        };
    }, []);

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
            for (const [rank, answerId] of Object.entries(selectedVotes)) {
                if (answerId !== null) {
                    await signalRService.submitVote(game.joinCode, answerId, parseInt(rank));
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

    const canSubmit = selectedVotes[1] !== null && selectedVotes[2] !== null && selectedVotes[3] !== null;

    if (!currentRound || !player) {
        return <div className="judging-page">Loading...</div>;
    }

    return (
        <div className="judging-page">
            <div className="judging-header">
                <h1>🎨 Vote for Your Favorite Drawings!</h1>
                <p className="prompt-text">"{currentRound.prompt}"</p>
                <div className="voting-instructions">
                    <p>Select your top 3 favorite drawings:</p>
                    <ul>
                        <li><strong>🥇 1st Place</strong> - Your absolute favorite (3 points)</li>
                        <li><strong>🥈 2nd Place</strong> - Your second favorite (2 points)</li>
                        <li><strong>🥉 3rd Place</strong> - Your third favorite (1 point)</li>
                    </ul>
                </div>
            </div>

            {hasVoted ? (
                <div className="voting-complete">
                    <h2>✅ Thanks for voting!</h2>
                    <p>Waiting for other players to finish voting...</p>
                    <div className="live-results">
                        <h3>Live Results:</h3>
                        <div className="results-grid">
                            {voteResults.map((result, index) => (
                                <div key={result.answerId} className={`result-card ${index < 3 ? 'top-three' : ''}`}>
                                    <div className="result-rank">#{index + 1}</div>
                                    <div className="result-player">{result.playerName}</div>
                                    <div className="result-points">{result.totalPoints} points</div>
                                    <div className="result-breakdown">
                                        🥇{result.firstPlaceVotes} 🥈{result.secondPlaceVotes} 🥉{result.thirdPlaceVotes}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            ) : (
                <div className="voting-section">
                    <div className="answers-grid">
                        {otherPlayersAnswers.map((answer) => (
                            <div key={answer.answerId} className="answer-card">
                                <div className="answer-image">
                                    <img src={answer.content} alt={`Drawing by ${answer.playerName}`} />
                                </div>
                                <div className="answer-info">
                                    <h3>{answer.playerName}</h3>
                                    {getVoteDisplayForAnswer(answer.answerId)}
                                </div>
                                <div className="vote-buttons">
                                    <button
                                        className={`vote-btn ${selectedVotes[1] === answer.answerId ? 'selected first' : ''}`}
                                        onClick={() => handleVoteSelect(1, answer.answerId)}
                                        disabled={selectedVotes[1] !== null && selectedVotes[1] !== answer.answerId}
                                    >
                                        🥇 1st
                                    </button>
                                    <button
                                        className={`vote-btn ${selectedVotes[2] === answer.answerId ? 'selected second' : ''}`}
                                        onClick={() => handleVoteSelect(2, answer.answerId)}
                                        disabled={selectedVotes[2] !== null && selectedVotes[2] !== answer.answerId}
                                    >
                                        🥈 2nd
                                    </button>
                                    <button
                                        className={`vote-btn ${selectedVotes[3] === answer.answerId ? 'selected third' : ''}`}
                                        onClick={() => handleVoteSelect(3, answer.answerId)}
                                        disabled={selectedVotes[3] !== null && selectedVotes[3] !== answer.answerId}
                                    >
                                        🥉 3rd
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="vote-summary">
                        <h3>Your Votes:</h3>
                        <div className="selected-votes">
                            <div className="vote-item">
                                <span className="vote-rank">🥇 1st:</span>
                                <span className="vote-player">
                                    {selectedVotes[1] ? otherPlayersAnswers.find(a => a.answerId === selectedVotes[1])?.playerName : 'Not selected'}
                                </span>
                            </div>
                            <div className="vote-item">
                                <span className="vote-rank">🥈 2nd:</span>
                                <span className="vote-player">
                                    {selectedVotes[2] ? otherPlayersAnswers.find(a => a.answerId === selectedVotes[2])?.playerName : 'Not selected'}
                                </span>
                            </div>
                            <div className="vote-item">
                                <span className="vote-rank">🥉 3rd:</span>
                                <span className="vote-player">
                                    {selectedVotes[3] ? otherPlayersAnswers.find(a => a.answerId === selectedVotes[3])?.playerName : 'Not selected'}
                                </span>
                            </div>
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
            )}
        </div>
    );
}; 