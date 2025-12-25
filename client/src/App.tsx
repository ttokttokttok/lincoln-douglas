import { Routes, Route } from 'react-router-dom';
import { Lobby } from './pages/Lobby';
import { Room } from './pages/Room';
import { Practice } from './pages/Practice';

function App() {
  return (
    <div className="min-h-screen">
      <Routes>
        <Route path="/" element={<Lobby />} />
        <Route path="/practice" element={<Practice />} />
        <Route path="/room/:roomId" element={<Room />} />
      </Routes>
    </div>
  );
}

export default App;
