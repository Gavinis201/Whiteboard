import React, { useState } from 'react';
import { Link } from 'react-router-dom';

const Header: React.FC = () => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    return (
        <header className="bg-white shadow-md">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center h-16">
                    <Link to="/" className="text-xl sm:text-2xl font-bold text-purple-600">
                        WhiteBoard
                    </Link>
                    
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