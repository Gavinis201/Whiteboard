import React, { useEffect, useRef, useState } from 'react';

const BackgroundMusic: React.FC = () => {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [volume, setVolume] = useState(0.3);
    const [showControls, setShowControls] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Initialize audio element only once
    useEffect(() => {
        if (!audioRef.current) {
            try {
                const audio = new Audio('/Cartoon.mp3');
                audio.loop = true;
                audio.volume = volume;
                
                audio.addEventListener('canplaythrough', () => {
                    console.log('Audio ready to play');
                });

                audio.addEventListener('play', () => {
                    setIsPlaying(true);
                });

                audio.addEventListener('pause', () => {
                    setIsPlaying(false);
                });

                audio.addEventListener('error', (e) => {
                    console.error('Audio error:', e);
                    setError('Failed to load audio file. Please check if the file exists in the public directory.');
                });

                audioRef.current = audio;
            } catch (err) {
                console.error('Error setting up audio:', err);
                setError('Failed to initialize audio');
            }
        }

        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
        };
    }, []);

    // Update volume when it changes
    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.volume = volume;
        }
    }, [volume]);

    const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newVolume = parseFloat(e.target.value);
        setVolume(newVolume);
    };

    const togglePlayPause = async () => {
        if (!audioRef.current) return;

        try {
            if (isPlaying) {
                await audioRef.current.pause();
            } else {
                await audioRef.current.play();
            }
        } catch (error) {
            console.error('Error toggling play state:', error);
            setError('Failed to play/pause music: ' + (error as Error).message);
        }
    };

    if (error) {
        console.error('Background music error:', error);
    }

    return (
        <div 
            className="fixed bottom-4 right-4 z-50"
            onMouseEnter={() => setShowControls(true)}
            onMouseLeave={() => setShowControls(false)}
        >
            <div className="flex items-center space-x-2">
                {showControls && (
                    <div className="bg-white p-4 rounded-lg shadow-lg absolute right-0 bottom-0">
                        <div className="flex items-center space-x-3">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                            </svg>
                            <div className="flex flex-col items-center">
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.1"
                                    value={volume}
                                    onChange={handleVolumeChange}
                                    className="w-32 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                    style={{
                                        background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${volume * 100}%, #e5e7eb ${volume * 100}%, #e5e7eb 100%)`
                                    }}
                                />
                                <span className="text-xs text-gray-500 mt-1">
                                    {Math.round(volume * 100)}%
                                </span>
                            </div>
                        </div>
                    </div>
                )}
                <button
                    onClick={togglePlayPause}
                    className="p-2 bg-white rounded-full shadow-lg hover:bg-gray-100"
                    aria-label={isPlaying ? "Pause music" : "Play music"}
                >
                    {isPlaying ? (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                        </svg>
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                        </svg>
                    )}
                </button>
            </div>
        </div>
    );
};

export default BackgroundMusic; 