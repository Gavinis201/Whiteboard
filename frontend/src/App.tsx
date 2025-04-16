import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom';
import { GameProvider } from './contexts/GameContext';
import { JoinGame } from './components/JoinGame';
import { Game } from './components/Game';
import { CreateGame } from './components/CreateGame';
import './App.css'

function App() {
  return (
    <Router>
      <GameProvider>
        <div className="min-h-screen bg-gray-100">
          <nav className="bg-white shadow-sm">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex justify-between h-16">
                <div className="flex">
                  <div className="flex-shrink-0 flex items-center">
                    <Link to="/" className="text-xl font-bold text-indigo-600">Whiteboard Game</Link>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <Link to="/create" className="text-gray-600 hover:text-gray-900">Create Game</Link>
                  <Link to="/join" className="text-gray-600 hover:text-gray-900">Join Game</Link>
                </div>
              </div>
            </div>
          </nav>
          <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
            <Routes>
              <Route path="/" element={
                <div className="text-center py-12">
                  <h1 className="text-4xl font-bold text-gray-900 mb-4">Welcome to Whiteboard Game</h1>
                  <p className="text-xl text-gray-600 mb-8">Create or join a game to get started</p>
                  <div className="space-x-4">
                    <Link to="/create" className="bg-indigo-600 text-white px-6 py-3 rounded-md hover:bg-indigo-700">
                      Create Game
                    </Link>
                    <Link to="/join" className="bg-gray-600 text-white px-6 py-3 rounded-md hover:bg-gray-700">
                      Join Game
                    </Link>
                  </div>
                </div>
              } />
              <Route path="/join" element={<JoinGame />} />
              <Route path="/create" element={<CreateGame />} />
              <Route path="/game" element={<Game />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      </GameProvider>
    </Router>
  );
}

export default App;
