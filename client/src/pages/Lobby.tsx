import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Bot, ArrowRight } from 'lucide-react';
import { API_URL } from '../lib/constants';

type Mode = 'select' | 'pvp' | 'practice';

export function Lobby() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('select');
  const [joinCode, setJoinCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [resolution, setResolution] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateRoom = async () => {
    if (!displayName.trim() || !resolution.trim()) return;

    setIsCreating(true);
    try {
      const response = await fetch(`${API_URL}/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolution }),
      });

      if (!response.ok) {
        throw new Error('Failed to create room');
      }

      const data = await response.json();
      sessionStorage.setItem('displayName', displayName);
      navigate(`/room/${data.code}`);
    } catch (error) {
      console.error('Failed to create room:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinRoom = async () => {
    if (!displayName.trim() || !joinCode.trim()) return;

    sessionStorage.setItem('displayName', displayName);
    navigate(`/room/${joinCode}`);
  };

  const handleStartPractice = () => {
    if (!displayName.trim()) return;
    sessionStorage.setItem('displayName', displayName);
    navigate('/practice');
  };

  // Mode selection view
  if (mode === 'select') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-4xl space-y-8">
          {/* Header */}
          <div className="text-center">
            <h1 className="text-4xl font-bold text-white mb-2">
              Lincoln-Douglas
            </h1>
            <p className="text-gray-400">
              Cross-Language Debate Platform
            </p>
          </div>

          {/* Display Name Input */}
          <div className="max-w-md mx-auto">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Your Name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Enter your display name"
              className="input"
            />
          </div>

          {/* Mode Selection Cards */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Debate a Human Card */}
            <div
              onClick={() => displayName.trim() && setMode('pvp')}
              className={`card cursor-pointer transition-all duration-200 hover:border-blue-500 hover:shadow-lg hover:shadow-blue-500/10 ${
                !displayName.trim() ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <div className="flex items-center gap-4 mb-4">
                <div className="p-3 bg-blue-500/20 rounded-lg">
                  <Users className="w-8 h-8 text-blue-400" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-white">Debate a Human</h2>
                  <p className="text-sm text-gray-400">PvP Mode</p>
                </div>
              </div>
              <p className="text-gray-300 mb-4">
                Create or join a room with another debater. Practice cross-examination
                and refine your arguments against real opponents.
              </p>
              <div className="flex items-center text-blue-400 text-sm font-medium">
                <span>Create or Join Room</span>
                <ArrowRight className="w-4 h-4 ml-2" />
              </div>
            </div>

            {/* Practice with AI Card */}
            <div
              onClick={() => displayName.trim() && handleStartPractice()}
              className={`card cursor-pointer transition-all duration-200 hover:border-purple-500 hover:shadow-lg hover:shadow-purple-500/10 ${
                !displayName.trim() ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <div className="flex items-center gap-4 mb-4">
                <div className="p-3 bg-purple-500/20 rounded-lg">
                  <Bot className="w-8 h-8 text-purple-400" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-white">Practice with AI</h2>
                  <p className="text-sm text-gray-400">Solo Practice</p>
                </div>
              </div>
              <p className="text-gray-300 mb-4">
                Hone your skills against AI debate opponents with unique personalities.
                Perfect for solo practice and skill development.
              </p>
              <div className="flex items-center text-purple-400 text-sm font-medium">
                <span>Choose Your Opponent</span>
                <ArrowRight className="w-4 h-4 ml-2" />
              </div>
            </div>
          </div>

          {/* Quick tip */}
          <p className="text-center text-gray-500 text-sm">
            Enter your name above to get started
          </p>
        </div>
      </div>
    );
  }

  // PvP mode view (create/join room)
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        {/* Back button */}
        <button
          onClick={() => setMode('select')}
          className="text-gray-400 hover:text-white flex items-center gap-2 transition-colors"
        >
          <ArrowRight className="w-4 h-4 rotate-180" />
          <span>Back to mode selection</span>
        </button>

        {/* Header */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-3 mb-2">
            <Users className="w-8 h-8 text-blue-400" />
            <h1 className="text-3xl font-bold text-white">Debate a Human</h1>
          </div>
          <p className="text-gray-400">Playing as: {displayName}</p>
        </div>

        {/* Create Room Section */}
        <div className="card">
          <h2 className="text-xl font-semibold mb-4">Create a Room</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Resolution
              </label>
              <input
                type="text"
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                placeholder="e.g., Universal Basic Income is justified"
                className="input"
              />
            </div>
            <button
              onClick={handleCreateRoom}
              disabled={!resolution.trim() || isCreating}
              className="btn btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCreating ? 'Creating...' : 'Create Room'}
            </button>
          </div>
        </div>

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-700"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-gray-950 text-gray-500">or</span>
          </div>
        </div>

        {/* Join Room Section */}
        <div className="card">
          <h2 className="text-xl font-semibold mb-4">Join a Room</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Room Code
              </label>
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="Enter 6-character code"
                maxLength={6}
                className="input text-center text-2xl tracking-widest font-mono"
              />
            </div>
            <button
              onClick={handleJoinRoom}
              disabled={joinCode.length !== 6}
              className="btn btn-secondary w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Join Room
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
