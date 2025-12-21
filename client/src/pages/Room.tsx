import { useParams } from 'react-router-dom';

export function Room() {
  const { roomId } = useParams<{ roomId: string }>();

  return (
    <div className="min-h-screen p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="card mb-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold">Debate Room</h1>
              <p className="text-gray-400 text-sm">Room Code: {roomId}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-400">Status</p>
              <p className="text-yellow-400 font-medium">Waiting for opponent...</p>
            </div>
          </div>
        </div>

        {/* Video Grid */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          {/* Local Video */}
          <div className="card aspect-video flex items-center justify-center">
            <div className="text-center text-gray-500">
              <div className="text-6xl mb-2">📹</div>
              <p>Your video will appear here</p>
              <p className="text-sm mt-2">Camera access required</p>
            </div>
          </div>

          {/* Remote Video */}
          <div className="card aspect-video flex items-center justify-center">
            <div className="text-center text-gray-500">
              <div className="text-6xl mb-2">👤</div>
              <p>Opponent video will appear here</p>
              <p className="text-sm mt-2">Waiting for connection...</p>
            </div>
          </div>
        </div>

        {/* Bottom Panel */}
        <div className="grid grid-cols-3 gap-4">
          {/* Language Settings */}
          <div className="card">
            <h3 className="font-semibold mb-3">Language Settings</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Speaking:</span>
                <span>English</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Listening:</span>
                <span>English</span>
              </div>
            </div>
          </div>

          {/* Timer */}
          <div className="card text-center">
            <h3 className="font-semibold mb-3">Timer</h3>
            <div className="text-5xl font-mono font-bold text-white mb-2">
              3:00
            </div>
            <div className="text-sm text-gray-400">AC - Affirmative Constructive</div>
            <div className="flex gap-2 justify-center mt-4">
              <button className="btn btn-primary">Start</button>
              <button className="btn btn-secondary">Use Prep</button>
            </div>
          </div>

          {/* Prep Time */}
          <div className="card">
            <h3 className="font-semibold mb-3">Prep Time</h3>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-aff-500 font-medium">AFF</span>
                <span className="font-mono">2:00</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-neg-500 font-medium">NEG</span>
                <span className="font-mono">2:00</span>
              </div>
            </div>
          </div>
        </div>

        {/* Placeholder for future features */}
        <div className="card mt-4">
          <h3 className="font-semibold mb-3">Resolution</h3>
          <p className="text-gray-300 italic">
            "Resolved: That Universal Basic Income is justified."
          </p>
        </div>
      </div>
    </div>
  );
}
