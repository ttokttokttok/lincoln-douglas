import { Routes, Route } from 'react-router-dom';
import { Lobby } from './pages/Lobby';
import { Room } from './pages/Room';

function App() {
  return (
    <div className="min-h-screen">
      <Routes>
        <Route path="/" element={<Lobby />} />
        <Route path="/room/:roomId" element={<Room />} />
      </Routes>
    </div>
  );
}

export default App;
