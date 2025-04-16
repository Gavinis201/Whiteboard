import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom';
import { GameProvider } from './contexts/GameContext';
import { JoinGame } from './components/JoinGame';
import { Game } from './components/Game';
import { CreateGame } from './components/CreateGame';
import './index.css';
import Header from './components/Header';
import Footer from './components/Footer';



function App() {
  return (
    <Router>
      <GameProvider>
        <Header/>
        <div className="min-h-screen bg-gray-100">
          
          <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
            <Routes>
              <Route path="/" element={
                <div className="text-center py-12">
                  <h1 className="text-4xl font-bold text-gray-900 mb-4">Welcome to Whiteboard Game</h1>
                  <p className="text-xl text-gray-600 mb-8">Create or join a game to get started</p>
                    <div className="space-x-4">
                    <Link to="/create">
                      <button className="bg-purple-600 text-white px-6 py-3 rounded-md hover:bg-purple-700">
                      Create Game
                      </button>
                    </Link>
                    <Link to="/join">
                      <button className="bg-purple-600 text-white px-6 py-3 rounded-md hover:bg-purple-700">
                      Join Game
                      </button>
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
        <Footer />
      </GameProvider>
    </Router>
  );
}

export default App;
