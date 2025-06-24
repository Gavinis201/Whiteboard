import { BrowserRouter as Router, Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom';
import { GameProvider, useGame } from './contexts/GameContext';
import { JoinGame } from './components/JoinGame';
import { Game } from './components/Game';
import { CreateGame } from './components/CreateGame';
import { LoadingSpinner } from './components/LoadingSpinner';
import './index.css';
import Header from './components/Header';
import Footer from './components/Footer';

const HomePage = () => {
  const { game, player, isInitialized } = useGame();
  const navigate = useNavigate();

  // If user is already in a game, show continue option
  if (isInitialized && game && player) {
    return (
      <div className="text-center py-8 sm:py-12">
        <div className="max-w-3xl mx-auto">
          <div className="mb-8">
            <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4">
              Welcome back to <span className="text-purple-600">Whiteboard Game</span>
            </h1>
            <p className="text-xl text-gray-600 mb-8">
              You're currently in game: <span className="font-semibold">{game.joinCode}</span>
            </p>
          </div>
           
          <div className="bg-white p-8 rounded-xl shadow-lg mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Continue Your Game</h2>
            <p className="text-gray-600 mb-6">You're already in a game as "{player.name}". Would you like to continue?</p>
            <button 
              onClick={() => navigate('/game')}
              className="bg-purple-600 text-white px-8 py-3 rounded-md hover:bg-purple-700 transition-colors text-lg"
            >
              Continue Game
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="text-center py-8 sm:py-12">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4">
            Welcome to <span className="text-purple-600">Whiteboard Game</span>
          </h1>
          <p className="text-xl text-gray-600 mb-8">
            Draw, guess, and have fun with friends!
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
          <div className="bg-white p-6 rounded-xl shadow-lg">
            <Link to="/create" className="block">
              <div className="h-40 bg-purple-100 rounded-lg mb-4 flex items-center justify-center cursor-pointer hover:bg-purple-200 transition-colors">
                <svg className="w-24 h-24 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </div>
            </Link>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Create a Game</h3>
            <p className="text-gray-600 mb-4">Start a new game as the reader and invite your friends to join</p>
            <Link to="/create">
              <button className="w-full bg-purple-600 text-white px-6 py-3 rounded-md hover:bg-purple-700 transition-colors">
                Create Game
              </button>
            </Link>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-lg">
            <Link to="/join" className="block">
              <div className="h-40 bg-purple-100 rounded-lg mb-4 flex items-center justify-center cursor-pointer hover:bg-purple-200 transition-colors">
                <svg className="w-24 h-24 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
            </Link>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Join a Game</h3>
            <p className="text-gray-600 mb-4">Enter a game code to join your friends' game and start drawing</p>
            <Link to="/join">
              <button className="w-full bg-purple-600 text-white px-6 py-3 rounded-md hover:bg-purple-700 transition-colors">
                Join Game
              </button>
            </Link>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-lg">
          <h3 className="text-xl font-semibold text-gray-900 mb-4">How to Play</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-purple-600 font-bold">1</span>
              </div>
              <h4 className="font-medium text-gray-900 mb-2">Create or Join</h4>
              <p className="text-gray-600">Start a new game or join an existing one with a game code</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-purple-600 font-bold">2</span>
              </div>
              <h4 className="font-medium text-gray-900 mb-2">Draw & Guess</h4>
              <p className="text-gray-600">The reader provides a prompt, and players draw their interpretations</p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-purple-600 font-bold">3</span>
              </div>
              <h4 className="font-medium text-gray-900 mb-2">Reveal & Laugh</h4>
              <p className="text-gray-600">See everyone's drawings and enjoy the creative interpretations</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const AppRoutes = () => {
  const { game, player, isInitialized, isLoading, loadingMessage } = useGame();

  console.log('AppRoutes render:', { isLoading, loadingMessage, isInitialized, hasGame: !!game, hasPlayer: !!player });

  // Show loading spinner if app is loading - this takes priority over everything else
  if (isLoading) {
    console.log('Rendering LoadingSpinner with message:', loadingMessage);
    return <LoadingSpinner text={loadingMessage} />;
  }

  // If user is in a game, always show the game page regardless of URL
  if (isInitialized && game && player) {
    console.log('Rendering Game component');
    return <Game />;
  }

  console.log('Rendering normal routes');
  // Otherwise, show the normal routes
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/join" element={<JoinGame />} />
      <Route path="/create" element={<CreateGame />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

function App() {
  return (
    <Router>
      <GameProvider>
        <div className="flex flex-col min-h-screen">
          <Header/>
          <div className="flex-grow">
            <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
              <AppRoutes />
            </main>
          </div>
          <Footer />
        </div>
      </GameProvider>
    </Router>
  );
}

export default App;
