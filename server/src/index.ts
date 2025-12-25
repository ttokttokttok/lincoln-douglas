import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { setupWebSocketServer } from './websocket/server.js';
import { setupRoutes } from './api/routes.js';
import { geminiSttService } from './stt/geminiStt.js';
import { translationService } from './translation/geminiTranslation.js';
import { argumentExtractor } from './flow/argumentExtractor.js';
import { ballotGenerator } from './flow/ballotGenerator.js';
import { elevenLabsTTS } from './tts/elevenLabsTts.js';
import { emotionDetector } from './emotion/emotionDetector.js';

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
const extractorReady = argumentExtractor.initialize();
const ballotReady = ballotGenerator.initialize();

// Initialize ElevenLabs TTS service
const ttsReady = elevenLabsTTS.initialize();

// Initialize Emotion Detection service (Milestone 4)
const emotionReady = emotionDetector.initialize();

console.log(`[Services] STT: ${sttReady ? '✓' : '✗'}, Translation: ${translationReady ? '✓' : '✗'}, Extractor: ${extractorReady ? '✓' : '✗'}, Ballot: ${ballotReady ? '✓' : '✗'}, TTS: ${ttsReady ? '✓' : '✗'}, Emotion: ${emotionReady ? '✓' : '✗'}`);
if (!sttReady) {
  console.log('[Services] Set GEMINI_API_KEY to enable all Gemini services');
}
if (!ttsReady) {
  console.log('[Services] Set ELEVENLABS_API_KEY to enable voice synthesis');
}

// Start server
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`WebSocket available at ws://localhost:${PORT}/ws`);
});
