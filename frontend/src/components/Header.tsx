import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';

const Header: React.FC = () => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [volume, setVolume] = useState(0.3);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const settingsRef = useRef<HTMLDivElement | null>(null);

    // Initialize audio element only once
    useEffect(() => {
        if (!audioRef.current) {
            try {
                const audio = new Audio('/Cartoon.mp3');
                audio.loop = true;
                audio.volume = volume;
                
                audio.addEventListener('play', () => {
                    setIsPlaying(true);
                });

                audio.addEventListener('pause', () => {
                    setIsPlaying(false);
                });

                audioRef.current = audio;
            } catch (err) {
                console.error('Error setting up audio:', err);
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

    // Close settings when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
                setShowSettings(false);
            }
        };
        if (showSettings) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showSettings]);

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
        }
    };

    const { theme, setTheme, themes } = useTheme();

    return (
        <header className="bg-white shadow-md">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center h-16">
                    <Link to="/" className="text-xl sm:text-2xl font-bold text-purple-600">
                        WhiteBoard
                    </Link>
                    
                    <div className="flex items-center space-x-4">
                        {/* Settings Button */}
                        <div className="relative" ref={settingsRef}>
                            <button
                                onClick={() => setShowSettings(!showSettings)}
                                className="p-2 rounded-md text-gray-600 hover:text-purple-600 hover:bg-purple-50 focus:outline-none"
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                            </button>

                            {/* Settings Dropdown */}
                            {showSettings && (
                                <div className="absolute right-0 mt-2 w-64 bg-white rounded-md shadow-lg py-2 z-50">
                                    <div className="px-4 py-2 border-b border-gray-100">
                                        <div className="flex items-center space-x-3">
                                            <button
                                                onClick={togglePlayPause}
                                                className="p-2 rounded-full hover:bg-gray-100"
                                            >
                                                {isPlaying ? (
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                                                    </svg>
                                                ) : (
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                                                    </svg>
                                                )}
                                            </button>
                                            <div className="flex-1">
                                                <input
                                                    type="range"
                                                    min="0"
                                                    max="1"
                                                    step="0.1"
                                                    value={volume}
                                                    onChange={handleVolumeChange}
                                                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                                    style={{
                                                        background: `linear-gradient(to right, var(--brand-600) 0%, var(--brand-600) ${volume * 100}%, #e5e7eb ${volume * 100}%, #e5e7eb 100%)`
                                                    }}
                                                />
                                                <span className="text-xs text-gray-500">
                                                    {Math.round(volume * 100)}%
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="px-4 py-2">
                                        <label className="block text-xs uppercase tracking-wide text-gray-500 mb-1">Theme</label>
                                        <select
                                            className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                                            value={theme}
                                            onChange={e => setTheme(e.target.value as any)}
                                        >
                                            {themes.map(t => (
                                                <option key={t.value} value={t.value}>{t.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Mobile menu button */}
                        <button
                            onClick={() => setIsMenuOpen(!isMenuOpen)}
                            className="md:hidden p-2 rounded-md text-gray-600 hover:text-purple-600 focus:outline-none"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                {isMenuOpen ? (
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                ) : (
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                                )}
                            </svg>
                        </button>

                        {/* Desktop Navigation */}
                        <nav className="hidden md:flex items-center space-x-4">
                            <Link to="/" className="text-gray-600 hover:text-purple-600 transition-colors duration-200">
                                Home
                            </Link>
                            <Link 
                                to="/create" 
                                className="bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700 transition-colors"
                            >
                                Create Game
                            </Link>
                            <Link 
                                to="/join" 
                                className="bg-purple-100 text-purple-600 px-4 py-2 rounded-md hover:bg-purple-200 transition-colors"
                            >
                                Join Game
                            </Link>
                        </nav>
                    </div>
                </div>

                {/* Mobile Navigation */}
                {isMenuOpen && (
                    <div className="md:hidden py-4 space-y-2">
                        <Link 
                            to="/" 
                            className="block px-4 py-2 text-gray-600 hover:text-purple-600 hover:bg-purple-50 rounded-md"
                            onClick={() => setIsMenuOpen(false)}
                        >
                            Home
                        </Link>
                        <Link 
                            to="/create" 
                            className="block px-4 py-2 text-white bg-purple-600 hover:bg-purple-700 rounded-md"
                            onClick={() => setIsMenuOpen(false)}
                        >
                            Create Game
                        </Link>
                        <Link 
                            to="/join" 
                            className="block px-4 py-2 text-purple-600 bg-purple-100 hover:bg-purple-200 rounded-md"
                            onClick={() => setIsMenuOpen(false)}
                        >
                            Join Game
                        </Link>
                    </div>
                )}
            </div>
        </header>
    );
};

export default Header;