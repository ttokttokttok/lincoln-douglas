/**
 * Gemini STT Service
 * 
 * Uses Gemini 2.0 Flash's multimodal capabilities to transcribe audio.
 * Buffers audio chunks and sends batches for transcription.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import type { LanguageCode } from '@shared/types';
import { LANGUAGES } from '@shared/types';

// Buffer duration in milliseconds before sending to Gemini
// Increased to 5 seconds to reduce API calls and avoid rate limits
const BUFFER_DURATION_MS = 5000; // 5 seconds

// At 16kHz, 16-bit mono: 32,000 bytes per second
const BYTES_PER_SECOND = 32000;
const BUFFER_SIZE_BYTES = (BUFFER_DURATION_MS / 1000) * BYTES_PER_SECOND;

/**
 * Create a WAV header for PCM audio data
 * Gemini requires proper audio format, not raw PCM
 */
function createWavHeader(dataLength: number, sampleRate = 16000, channels = 1, bitsPerSample = 16): Buffer {
  const header = Buffer.alloc(44);
  
  // RIFF header
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataLength, 4); // File size - 8
  header.write('WAVE', 8);
  
  // fmt subchunk
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // Subchunk1 size (16 for PCM)
  header.writeUInt16LE(1, 20); // Audio format (1 = PCM)
  header.writeUInt16LE(channels, 22); // Number of channels
  header.writeUInt32LE(sampleRate, 24); // Sample rate
  header.writeUInt32LE(sampleRate * channels * bitsPerSample / 8, 28); // Byte rate
  header.writeUInt16LE(channels * bitsPerSample / 8, 32); // Block align
  header.writeUInt16LE(bitsPerSample, 34); // Bits per sample
  
  // data subchunk
  header.write('data', 36);
  header.writeUInt32LE(dataLength, 40); // Data size
  
  return header;
}

/**
 * Convert raw PCM buffer to WAV format
 */
function pcmToWav(pcmBuffer: Buffer, sampleRate = 16000): Buffer {
  const header = createWavHeader(pcmBuffer.length, sampleRate);
  return Buffer.concat([header, pcmBuffer]);
}

interface TranscriptionSession {
  sessionId: string;
  participantId: string;
  language: LanguageCode;
  audioBuffer: Buffer[];
  bufferSize: number;
  lastFlushTime: number;
  flushTimer: NodeJS.Timeout | null;
  pendingFlush: Promise<void> | null;  // Track in-flight flush to avoid race conditions
}

interface TranscriptionResult {
  text: string;
  isFinal: boolean;
  confidence: number;
  language: LanguageCode;
}

type TranscriptionCallback = (
  participantId: string,
  result: TranscriptionResult
) => void;

class GeminiSTTService {
  private genAI: GoogleGenerativeAI | null = null;
  private model: ReturnType<GoogleGenerativeAI['getGenerativeModel']> | null = null;
  private sessions: Map<string, TranscriptionSession> = new Map();
  private onTranscription: TranscriptionCallback | null = null;
  private isInitialized = false;

  /**
   * Initialize the Gemini client
   */
  initialize(): boolean {
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
    } catch (error) {
      console.error('[GeminiSTT] Failed to initialize:', error);
      return false;
    }
  }

  /**
   * Set the callback for transcription results
   */
  setTranscriptionCallback(callback: TranscriptionCallback): void {
    this.onTranscription = callback;
  }

  /**
   * Start a transcription session for a participant
   */
  startSession(
    participantId: string,
    sessionId: string,
    language: LanguageCode
  ): void {
    // End any existing session
    this.endSession(participantId);

    const session: TranscriptionSession = {
      sessionId,
      participantId,
      language,
      audioBuffer: [],
      bufferSize: 0,
      lastFlushTime: Date.now(),
      flushTimer: null,
      pendingFlush: null,
    };

    this.sessions.set(participantId, session);
    console.log(`[GeminiSTT] Started session for ${participantId}, language: ${language}`);
  }

  /**
   * Add audio chunk to buffer
   */
  async addAudioChunk(participantId: string, audioData: Buffer): Promise<void> {
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
      // Track the flush promise so endSession can await it
      const flushPromise = this.flushBuffer(participantId);
      session.pendingFlush = flushPromise;
      await flushPromise;
      session.pendingFlush = null;
    } else {
      // Set timer to flush after a short delay (for natural pauses)
      session.flushTimer = setTimeout(async () => {
        const currentSession = this.sessions.get(participantId);
        if (currentSession) {
          const flushPromise = this.flushBuffer(participantId);
          currentSession.pendingFlush = flushPromise;
          await flushPromise;
          // Only clear if session still exists
          const sessionAfterFlush = this.sessions.get(participantId);
          if (sessionAfterFlush) {
            sessionAfterFlush.pendingFlush = null;
          }
        }
      }, 500); // Flush 500ms after last chunk if buffer not full
    }
  }

  /**
   * Flush the audio buffer and transcribe
   */
  private async flushBuffer(participantId: string): Promise<void> {
    const session = this.sessions.get(participantId);
    if (!session || session.audioBuffer.length === 0) {
      return;
    }

    if (!this.isInitialized || !this.model) {
      console.warn('[GeminiSTT] Not initialized, skipping transcription');
      return;
    }

    // Combine all chunks into one buffer
    const pcmBuffer = Buffer.concat(session.audioBuffer);

    // Clear the buffer
    session.audioBuffer = [];
    session.bufferSize = 0;
    session.lastFlushTime = Date.now();

    if (session.flushTimer) {
      clearTimeout(session.flushTimer);
      session.flushTimer = null;
    }

    // Need minimum audio length for meaningful transcription (~0.5 seconds)
    const minBytes = BYTES_PER_SECOND * 0.5; // 16KB minimum
    if (pcmBuffer.length < minBytes) {
      console.log(`[GeminiSTT] Audio too short (${pcmBuffer.length} bytes), skipping`);
      return;
    }

    // Debug: Calculate audio level (RMS) to verify mic is capturing audio
    const samples = new Int16Array(pcmBuffer.buffer, pcmBuffer.byteOffset, pcmBuffer.length / 2);
    let sumSquares = 0;
    let maxSample = 0;
    for (let i = 0; i < samples.length; i++) {
      sumSquares += samples[i] * samples[i];
      maxSample = Math.max(maxSample, Math.abs(samples[i]));
    }
    const rms = Math.sqrt(sumSquares / samples.length);

    // Guard against Math.log10(0) which returns -Infinity
    // Use a small epsilon to avoid log(0) crash
    const rmsForDb = Math.max(rms, 1);  // Minimum of 1 to avoid -Infinity
    const rmsDb = 20 * Math.log10(rmsForDb / 32768);
    console.log(`[GeminiSTT] Audio level: RMS=${Math.round(rms)} (${rmsDb.toFixed(1)}dB), Peak=${maxSample}, Length=${pcmBuffer.length}bytes`);

    // Skip if audio is essentially silent (RMS < 100, about -50dB)
    if (rms < 100) {
      console.log(`[GeminiSTT] Audio too quiet (RMS=${Math.round(rms)}), likely silence - skipping`);
      return;
    }

    // Transcribe
    try {
      const result = await this.transcribeAudio(pcmBuffer, session.language);

      if (result && result.text.trim()) {
        const text = result.text.trim();

        // Filter out Gemini meta-responses (not actual transcriptions)
        const metaPatterns = [
          /^\[silence\]$/i,
          /^\[silent\]$/i,
          /^no audio/i,
          /^the audio/i,
          /^this audio/i,
          /^i cannot/i,
          /^i can't/i,
          /^there is no/i,
          /^audio not detected/i,
          /^no speech/i,
        ];

        const isMetaResponse = metaPatterns.some(pattern => pattern.test(text));
        if (isMetaResponse) {
          console.log(`[GeminiSTT] Skipping meta-response: "${text}"`);
          return;
        }

        // Filter out responses that are only punctuation/dots (Gemini returns "." for unclear audio)
        const textWithoutPunctuation = text.replace(/[\s.,!?;:\-…·•]+/g, '');
        if (textWithoutPunctuation.length === 0) {
          console.log(`[GeminiSTT] Skipping punctuation-only response: "${text}"`);
          return;
        }

        // Filter out very short responses that are likely noise (single letters, etc.)
        if (textWithoutPunctuation.length <= 2) {
          console.log(`[GeminiSTT] Skipping too-short response: "${text}"`);
          return;
        }

        console.log(`[GeminiSTT] Transcribed: "${text.substring(0, 50)}..."`);
        this.onTranscription?.(participantId, result);
      }
    } catch (error) {
      console.error('[GeminiSTT] Transcription error:', error);
    }
  }

  /**
   * Transcribe audio using Gemini
   * Takes raw PCM buffer, converts to WAV, and sends to Gemini
   */
  private async transcribeAudio(
    pcmBuffer: Buffer,
    language: LanguageCode
  ): Promise<TranscriptionResult | null> {
    if (!this.model) {
      return null;
    }

    // Convert PCM to WAV format (Gemini requires proper audio format)
    const wavBuffer = pcmToWav(pcmBuffer);
    const base64Audio = wavBuffer.toString('base64');

    const languageName = this.getLanguageName(language);

    try {
      const result = await this.model.generateContent([
        {
          inlineData: {
            mimeType: 'audio/wav',
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
    } catch (error: any) {
      // Handle specific errors
      if (error.message?.includes('Could not find audio') || 
          error.message?.includes('no audio') ||
          error.message?.includes('silent')) {
        // Silent or no audio detected
        return null;
      }
      throw error;
    }
  }

  /**
   * End a transcription session
   * IMPORTANT: We intentionally DISCARD remaining audio rather than flushing it.
   * This prevents audio captured after a speech ends from being transcribed
   * and sent to the opponent (e.g., casual conversation between speeches).
   */
  async endSession(participantId: string): Promise<void> {
    const session = this.sessions.get(participantId);
    if (!session) {
      return;
    }

    // Clear timer first to prevent any NEW flushes from starting
    if (session.flushTimer) {
      clearTimeout(session.flushTimer);
      session.flushTimer = null;
    }

    // CRITICAL: Wait for any in-flight flush to complete before deleting session
    // This prevents the race condition where flush is still running when session is deleted
    if (session.pendingFlush) {
      console.log(`[GeminiSTT] Waiting for pending flush to complete for ${participantId}`);
      try {
        await session.pendingFlush;
      } catch (error) {
        console.error(`[GeminiSTT] Error during pending flush for ${participantId}:`, error);
      }
    }

    // DISCARD remaining audio - don't flush it
    // This is intentional: we don't want post-speech audio to be transcribed
    const discardedBytes = session.bufferSize;
    if (discardedBytes > 0) {
      console.log(`[GeminiSTT] Discarding ${discardedBytes} bytes of post-speech audio for ${participantId}`);
    }

    this.sessions.delete(participantId);
    console.log(`[GeminiSTT] Ended session for ${participantId}`);
  }

  /**
   * Get language name from code
   */
  private getLanguageName(code: LanguageCode): string {
    const lang = LANGUAGES.find(l => l.code === code);
    return lang?.name || code;
  }

  /**
   * Check if service is ready
   */
  isReady(): boolean {
    return this.isInitialized;
  }
}

export const geminiSttService = new GeminiSTTService();

