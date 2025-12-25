/**
 * Gemini STT Service
 *
 * Uses Gemini 2.0 Flash's multimodal capabilities to transcribe audio.
 * Buffers audio chunks and sends batches for transcription.
 */
import { GoogleGenerativeAI } from '@google/generative-ai';
// Buffer duration in milliseconds before sending to Gemini
const BUFFER_DURATION_MS = 2000; // 2 seconds
// At 16kHz, 16-bit mono: 32,000 bytes per second
const BYTES_PER_SECOND = 32000;
const BUFFER_SIZE_BYTES = (BUFFER_DURATION_MS / 1000) * BYTES_PER_SECOND;
class GeminiSTTService {
    genAI = null;
    model = null;
    sessions = new Map();
    onTranscription = null;
    isInitialized = false;
    /**
     * Initialize the Gemini client
     */
    initialize() {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.warn('[GeminiSTT] GEMINI_API_KEY not set - transcription disabled');
            return false;
        }
        try {
            this.genAI = new GoogleGenerativeAI(apiKey);
            this.model = this.genAI.getGenerativeModel({
                model: 'gemini-2.0-flash',
            });
            this.isInitialized = true;
            console.log('[GeminiSTT] Initialized successfully');
            return true;
        }
        catch (error) {
            console.error('[GeminiSTT] Failed to initialize:', error);
            return false;
        }
    }
    /**
     * Set the callback for transcription results
     */
    setTranscriptionCallback(callback) {
        this.onTranscription = callback;
    }
    /**
     * Start a transcription session for a participant
     */
    startSession(participantId, sessionId, language) {
        // End any existing session
        this.endSession(participantId);
        const session = {
            sessionId,
            participantId,
            language,
            audioBuffer: [],
            bufferSize: 0,
            lastFlushTime: Date.now(),
            flushTimer: null,
        };
        this.sessions.set(participantId, session);
        console.log(`[GeminiSTT] Started session for ${participantId}, language: ${language}`);
    }
    /**
     * Add audio chunk to buffer
     */
    async addAudioChunk(participantId, audioData) {
        const session = this.sessions.get(participantId);
        if (!session) {
            return;
        }
        // Add to buffer
        session.audioBuffer.push(audioData);
        session.bufferSize += audioData.length;
        // Clear existing timer
        if (session.flushTimer) {
            clearTimeout(session.flushTimer);
        }
        // Check if we should flush
        if (session.bufferSize >= BUFFER_SIZE_BYTES) {
            // Buffer is full, flush immediately
            await this.flushBuffer(participantId);
        }
        else {
            // Set timer to flush after a short delay (for natural pauses)
            session.flushTimer = setTimeout(() => {
                this.flushBuffer(participantId);
            }, 500); // Flush 500ms after last chunk if buffer not full
        }
    }
    /**
     * Flush the audio buffer and transcribe
     */
    async flushBuffer(participantId) {
        const session = this.sessions.get(participantId);
        if (!session || session.audioBuffer.length === 0) {
            return;
        }
        if (!this.isInitialized || !this.model) {
            console.warn('[GeminiSTT] Not initialized, skipping transcription');
            return;
        }
        // Combine all chunks into one buffer
        const combinedBuffer = Buffer.concat(session.audioBuffer);
        const base64Audio = combinedBuffer.toString('base64');
        // Clear the buffer
        session.audioBuffer = [];
        session.bufferSize = 0;
        session.lastFlushTime = Date.now();
        if (session.flushTimer) {
            clearTimeout(session.flushTimer);
            session.flushTimer = null;
        }
        // Transcribe
        try {
            const result = await this.transcribeAudio(base64Audio, session.language);
            if (result && result.text.trim()) {
                this.onTranscription?.(participantId, result);
            }
        }
        catch (error) {
            console.error('[GeminiSTT] Transcription error:', error);
        }
    }
    /**
     * Transcribe audio using Gemini
     */
    async transcribeAudio(base64Audio, language) {
        if (!this.model) {
            return null;
        }
        const languageName = this.getLanguageName(language);
        try {
            const result = await this.model.generateContent([
                {
                    inlineData: {
                        mimeType: 'audio/pcm;rate=16000',
                        data: base64Audio,
                    },
                },
                {
                    text: `Transcribe this audio. The speaker is speaking in ${languageName}. 
Return ONLY the transcription text, nothing else. 
If you cannot understand the audio or it's silent, return an empty string.`,
                },
            ]);
            const text = result.response.text().trim();
            return {
                text,
                isFinal: true,
                confidence: 0.9, // Gemini doesn't provide confidence scores
                language,
            };
        }
        catch (error) {
            // Handle specific errors
            if (error.message?.includes('Could not find audio')) {
                // Silent or no audio detected
                return null;
            }
            throw error;
        }
    }
    /**
     * End a transcription session and flush remaining audio
     */
    async endSession(participantId) {
        const session = this.sessions.get(participantId);
        if (!session) {
            return;
        }
        // Flush any remaining audio
        if (session.audioBuffer.length > 0) {
            await this.flushBuffer(participantId);
        }
        // Clear timer
        if (session.flushTimer) {
            clearTimeout(session.flushTimer);
        }
        this.sessions.delete(participantId);
        console.log(`[GeminiSTT] Ended session for ${participantId}`);
    }
    /**
     * Get language name from code
     */
    getLanguageName(code) {
        const names = {
            en: 'English',
            ko: 'Korean',
            ja: 'Japanese',
            es: 'Spanish',
            zh: 'Chinese (Mandarin)',
        };
        return names[code];
    }
    /**
     * Check if service is ready
     */
    isReady() {
        return this.isInitialized;
    }
}
export const geminiSttService = new GeminiSTTService();
//# sourceMappingURL=geminiStt.js.map