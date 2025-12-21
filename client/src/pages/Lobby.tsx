import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export function Lobby() {
  const navigate = useNavigate();
  const [joinCode, setJoinCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [resolution, setResolution] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateRoom = async () => {
    if (!displayName.trim() || !resolution.trim()) return;

    setIsCreating(true);
    try {
      // TODO: Implement room creation via WebSocket
      console.log('Creating room:', { displayName, resolution });
      // For now, navigate to a mock room
      navigate('/room/test-room');
    } catch (error) {
      console.error('Failed to create room:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinRoom = async () => {
    if (!displayName.trim() || !joinCode.trim()) return;

    try {
      // TODO: Implement room joining via WebSocket
      console.log('Joining room:', { displayName, joinCode });
      navigate(`/room/${joinCode}`);
    } catch (error) {
      console.error('Failed to join room:', error);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
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
        <div>
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
              disabled={!displayName.trim() || !resolution.trim() || isCreating}
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
              disabled={!displayName.trim() || joinCode.length !== 6}
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
