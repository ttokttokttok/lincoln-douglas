import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { setupWebSocketServer } from './websocket/server.js';
import { setupRoutes } from './api/routes.js';
import { geminiSttService } from './stt/geminiStt.js';
import { translationService } from './translation/geminiTranslation.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// REST API routes
setupRoutes(app);

// Create HTTP server
const server = createServer(app);

// Setup WebSocket server
setupWebSocketServer(server);

// Initialize Gemini services
const sttReady = geminiSttService.initialize();
const translationReady = translationService.initialize();

console.log(`[Services] STT: ${sttReady ? '✓' : '✗'}, Translation: ${translationReady ? '✓' : '✗'}`);
if (!sttReady || !translationReady) {
  console.log('[Services] Set GEMINI_API_KEY to enable STT and translation');
}

// Start server
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`WebSocket available at ws://localhost:${PORT}/ws`);
});
