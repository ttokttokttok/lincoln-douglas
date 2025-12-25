# Milestone 3 — ElevenLabs Voice Synthesis Implementation Plan

## Status: IN PROGRESS 🟡

**Current Phase:** Phase 5 Complete → Ready for Phase 4 (Voice Selection UI) or Testing

**Last Updated:** 2024-12-24 - Phase 5 Integration Complete
- **Phase 1**: ElevenLabs TTS service, Session Manager, types, env config
- **Phase 2**: WebSocket integration (handlers, translation→TTS pipeline)
- **Phase 3**: Browser audio playback (AudioPlaybackManager, useAudioPlayback hook)
- **Phase 5**: Full integration complete (done before Phase 4)
  - Added TTS callbacks to `useWebSocket` hook
  - Wired TTS into `Room.tsx` component
  - **Mutes original WebRTC audio when TTS plays**
  - Unmutes when TTS ends
  - TTS state in debug panel

## Overview

This document details the implementation strategy for Milestone 3 of the Cross-Language Lincoln-Douglas Debate Platform. We're building the voice synthesis pipeline: ElevenLabs TTS integration, streaming audio playback, voice selection, and emotion preservation.

**The Goal:** When a debater speaks in Korean, their opponent hears a synthesized English voice in near real-time — same intensity, same conviction, with natural delivery.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              CURRENT PIPELINE (M2)                               │
│                                                                                  │
│   Speaker Audio → Gemini STT → Gemini Translation → Text Transcript Display     │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       │ + Milestone 3
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              NEW PIPELINE (M3)                                   │
│                                                                                  │
│   Speaker Audio ──────────────────────────────────────────────────────────┐     │
│        │                                                                  │     │
│        ▼                                                                  │     │
│   ┌──────────┐     ┌──────────────┐     ┌──────────────┐                 │     │
│   │  Gemini  │────▶│    Gemini    │────▶│  ElevenLabs  │                 │     │
│   │   STT    │     │  Translation │     │  TTS Stream  │                 │     │
│   └──────────┘     └──────────────┘     └──────┬───────┘                 │     │
│                                                │                          │     │
│                                                ▼                          │     │
│                           ┌────────────────────────────────────────┐     │     │
│                           │         Audio Mixer (Browser)          │     │     │
│                           │                                        │     │     │
│                           │  ┌─────────────┐   ┌─────────────┐    │     │     │
│                           │  │ TTS Audio   │ + │  Ambient    │◀───┼─────┘     │
│                           │  │ (translated)│   │  (original) │    │           │
│                           │  └─────────────┘   └─────────────┘    │           │
│                           └───────────────────────┬────────────────┘           │
│                                                   │                             │
│                                                   ▼                             │
│                                    ┌────────────────────────┐                  │
│                                    │   Listener's Speakers  │                  │
│                                    │   (synthesized voice)  │                  │
│                                    └────────────────────────┘                  │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Audio Flow Detail

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              SERVER AUDIO PIPELINE                               │
│                                                                                  │
│   Translation Complete                                                           │
│          │                                                                       │
│          ▼                                                                       │
│   ┌──────────────────────────────────────────────────────────────┐              │
│   │                    ElevenLabs TTS Service                     │              │
│   │                                                               │              │
│   │   ┌────────────┐     ┌────────────┐     ┌────────────┐       │              │
│   │   │   Voice    │────▶│  Emotion   │────▶│  Streaming │       │              │
│   │   │  Selector  │     │  Mapping   │     │    TTS     │       │              │
│   │   └────────────┘     └────────────┘     └──────┬─────┘       │              │
│   │         │                                      │              │              │
│   │         │ voiceId                              │ audio chunks │              │
│   │         ▼                                      ▼              │              │
│   │   ┌───────────────────────────────────────────────────┐      │              │
│   │   │              ElevenLabs API                        │      │              │
│   │   │   POST /v1/text-to-speech/{voice_id}/stream       │      │              │
│   │   │                                                    │      │              │
│   │   │   Body: { text, model_id, voice_settings }        │      │              │
│   │   │   Response: audio/mpeg stream                      │      │              │
│   │   └───────────────────────────────────────────────────┘      │              │
│   │                            │                                  │              │
│   └────────────────────────────┼──────────────────────────────────┘              │
│                                │                                                 │
│                                ▼                                                 │
│                    ┌─────────────────────────┐                                  │
│                    │    WebSocket Broadcast   │                                  │
│                    │    tts:audio_chunk       │                                  │
│                    └─────────────────────────┘                                  │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────┐
│                              BROWSER AUDIO PLAYBACK                              │
│                                                                                  │
│   tts:audio_chunk received                                                       │
│          │                                                                       │
│          ▼                                                                       │
│   ┌──────────────────────────────────────────────────────────────┐              │
│   │                   Audio Playback Manager                      │              │
│   │                                                               │              │
│   │   ┌────────────┐     ┌────────────┐     ┌────────────┐       │              │
│   │   │   Buffer   │────▶│   Decode   │────▶│  AudioCtx  │       │              │
│   │   │   Queue    │     │  (MP3→PCM) │     │   Output   │       │              │
│   │   └────────────┘     └────────────┘     └────────────┘       │              │
│   │                                                               │              │
│   │   Features:                                                   │              │
│   │   - Chunk buffering for smooth playback                       │              │
│   │   - Gap detection and silence insertion                       │              │
│   │   - Volume control independent of WebRTC audio                │              │
│   │   - Playback state tracking (playing, paused, ended)          │              │
│   │                                                               │              │
│   └──────────────────────────────────────────────────────────────┘              │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Technology Decisions

### ElevenLabs Configuration

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| Model | **eleven_flash_v2_5** | Ultra-low latency (~75ms), 32 languages, optimized for real-time |
| Output Format | **mp3_44100_64** | Balance of quality and bandwidth |
| Streaming | **Chunked Transfer** | Real-time playback as audio generates |
| Voice Selection | **Preset voices per language** | Consistent experience, no clone setup time |
| Voice Cloning | **Stretch goal** | Instant Voice Cloning if time permits |
| Latency Optimization | **Level 3** | `optimize_streaming_latency=3` query parameter |
| API Endpoint | **Global Preview** | `api-global-preview.elevenlabs.io` for geographic routing |

**Why eleven_flash_v2_5:**
- ~75ms latency (vs ~300ms for eleven_turbo_v2_5, vs ~400ms for eleven_multilingual_v2)
- 32 language support covers our primary use cases
- Purpose-built for real-time conversational applications
- Slight quality tradeoff vs Turbo, but 4x faster — critical for live debate
- 50% lower cost per character than other models

### Voice Strategy

| Strategy | Complexity | Demo Quality | Implementation |
|----------|------------|--------------|----------------|
| **Preset Voices** (MVP) | Low | Good | Pre-selected voices per language from ElevenLabs library |
| **Voice Cloning** (Stretch) | Medium | Excellent | 30-second sample, instant clone during setup |

**MVP Preset Voice Selection:**
- Curate 2-3 high-quality voices per major language
- Voices selected for debate clarity and expressiveness
- User picks during pre-debate setup

### Audio Pipeline Decisions

| Component | Technology | Notes |
|-----------|------------|-------|
| Server TTS | **ElevenLabs Streaming API** | POST to `/v1/text-to-speech/{voice_id}/stream` |
| Transport | **WebSocket Binary** | Send raw audio chunks for lowest overhead |
| Browser Decode | **Web Audio API** | `AudioContext.decodeAudioData()` for MP3 → PCM |
| Playback | **AudioBufferSourceNode** | Precise timing, gapless playback |
| Mixing | **GainNode** | Independent volume control for TTS vs ambient |

### Voice Settings Best Practices

Based on [ElevenLabs Conversational Voice Design](https://elevenlabs.io/docs/agents-platform/customization/voice/best-practices/conversational-voice-design):

| Setting | Debate Recommendation | Rationale |
|---------|----------------------|-----------|
| **Stability** | 0.50-0.65 | Balance between expressiveness and reliability |
| **Similarity** | 0.70-0.80 | High clarity without distortion risk |
| **Style** | 0 (always) | ElevenLabs recommends keeping at 0 for stability |
| **Speed** | 0.95-1.05 | Natural conversation pace |
| **Speaker Boost** | true | Enhanced voice clarity for debate context |

**Testing methodology:** Test each candidate voice with the same debate text sample, comparing different stability settings (0.45, 0.55, 0.65) before finalizing.

### Voice Selection Guidelines

Per [ElevenLabs voice design best practices](https://elevenlabs.io/docs/agents-platform/customization/voice/best-practices/conversational-voice-design):

**For Debate Context:**
- Choose voices with clear articulation (debate requires clarity)
- Prefer "professional" or "authoritative" voice labels
- Test with actual debate text samples before finalizing
- Consider accent matching to target language
- Offer both male and female options per language

**Recommended Testing Process:**
1. Select 2-3 candidate voices per language from ElevenLabs library
2. Generate same 30-second debate excerpt with each voice
3. Compare clarity, naturalness, and expressiveness
4. Test at different stability settings (0.45, 0.55, 0.65)
5. Verify voice works well with SSML pause tags

**Preset Voice Criteria:**
- Clear diction (critical for translated debate arguments)
- Moderate pace (not too fast for comprehension)
- Professional tone (appropriate for formal debate)
- Good expressiveness range without instability

### Text Preprocessing for TTS

Based on [ElevenLabs Prompting Guide](https://elevenlabs.io/docs/agents-platform/best-practices/prompting-guide):

**Character Normalization:**
- `@` → "at" (for email addresses)
- `.com` → "dot com"
- Remove URL protocols (`https://`)

**SSML Support (Flash v2.5):**
- Use `<break time="0.3s"/>` for natural pauses
- Add breaks after debate transition phrases
- Note: Style exaggeration via SSML not supported — use voice settings instead

**Emphasis Techniques:**
- Capitalization adds intensity (use sparingly)
- Punctuation affects prosody (commas, ellipses, dashes)
- Em-dashes (—) create natural pauses

**Length Limits:**
- Flash/Turbo models: 40,000 characters max
- Validate and truncate before sending to API

---

## Detailed Implementation Tasks

### Phase 1: ElevenLabs Service Integration

#### 1.1 Voice Types and Configuration (shared/src/types.ts)

Add new types for voice synthesis:

```typescript
// ElevenLabs voice configuration
export interface VoiceConfig {
  voiceId: string;
  name: string;
  language: LanguageCode;
  previewUrl?: string;
  labels?: {
    accent?: string;
    age?: string;
    gender?: string;
    use_case?: string;
  };
}

// Voice settings for TTS
// Based on ElevenLabs best practices: https://elevenlabs.io/docs/agents-platform/customization/voice/best-practices/conversational-voice-design
export interface VoiceSettings {
  stability: number;         // 0-1, recommended: 0.50-0.65 for debate (balance expressiveness/reliability)
  similarity_boost: number;  // 0-1, recommended: 0.70-0.80 (high clarity without distortion)
  style: number;             // 0-1, KEEP AT 0 — ElevenLabs recommends 0 for stability
  speed: number;             // 0.7-1.2, recommended: 0.95-1.05 for natural conversation
  use_speaker_boost: boolean; // true for enhanced clarity
}

// TTS request configuration
export interface TTSRequest {
  text: string;
  voiceId: string;
  targetLanguage: LanguageCode;
  emotionHints?: EmotionMarkers;
}

// Emotion markers for voice modulation
export interface EmotionMarkers {
  dominantEmotion: 'neutral' | 'confident' | 'passionate' | 'aggressive' | 'measured' | 'uncertain';
  intensity: number;      // 0-1
  confidence: number;     // 0-1
  suggestedSettings?: VoiceSettings;
}

// WebSocket message types for TTS
export type WSMessageType =
  | ... existing types ...
  | 'tts:start'           // Server → Client: TTS generation starting
  | 'tts:audio_chunk'     // Server → Client: Audio data chunk
  | 'tts:end'             // Server → Client: TTS generation complete
  | 'tts:error'           // Server → Client: TTS error occurred
  | 'voice:select'        // Client → Server: User selected a voice
  | 'voice:list';         // Server → Client: Available voices

export interface TTSAudioChunkPayload {
  speakerId: string;
  speechId: string;
  chunkIndex: number;
  audioData: string;      // Base64 encoded MP3 chunk
  isFinal: boolean;
  timestamp: number;
}

export interface VoiceSelectPayload {
  speakingVoiceId: string;    // Voice for when I speak (others hear)
  listeningVoiceId?: string;  // Preferred voice for opponent (optional)
}
```

#### 1.2 ElevenLabs Service (server/src/tts/elevenLabsTts.ts)

```typescript
import { Readable } from 'stream';

interface ElevenLabsConfig {
  apiKey: string;
  modelId: string;
  outputFormat: string;
}

interface GenerateOptions {
  text: string;
  voiceId: string;
  voiceSettings?: VoiceSettings;
  onChunk: (chunk: Buffer) => void;
  onComplete: () => void;
  onError: (error: Error) => void;
}

class ElevenLabsTTSService {
  private config: ElevenLabsConfig;
  private presetVoices: Map<LanguageCode, VoiceConfig[]> = new Map();

  constructor() {
    this.config = {
      apiKey: process.env.ELEVENLABS_API_KEY!,
      modelId: 'eleven_flash_v2_5',  // Flash for lowest latency (~75ms)
      outputFormat: 'mp3_44100_64',
    };
    this.initializePresetVoices();
  }

  private initializePresetVoices(): void {
    // Curated preset voices per language
    // These are actual ElevenLabs voice IDs from their library
    this.presetVoices.set('en', [
      { voiceId: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', language: 'en', labels: { gender: 'female', accent: 'american' } },
      { voiceId: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam', language: 'en', labels: { gender: 'male', accent: 'american' } },
      { voiceId: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte', language: 'en', labels: { gender: 'female', accent: 'british' } },
    ]);
    this.presetVoices.set('ko', [
      { voiceId: 'jBpfuIE2acCO8z3wKNLl', name: 'Gigi', language: 'ko', labels: { gender: 'female' } },
      // Additional Korean voices...
    ]);
    // Add more languages as needed...
  }

  getPresetVoices(language: LanguageCode): VoiceConfig[] {
    return this.presetVoices.get(language) || this.presetVoices.get('en') || [];
  }

  async generateStream(options: GenerateOptions): Promise<void> {
    const { text, voiceId, voiceSettings, onChunk, onComplete, onError } = options;

    // Optimized defaults for debate context
    // Based on: https://elevenlabs.io/docs/agents-platform/customization/voice/best-practices/conversational-voice-design
    const defaultSettings: VoiceSettings = {
      stability: 0.55,          // Balance between expressive and reliable
      similarity_boost: 0.75,   // Good clarity without distortion risk
      style: 0,                 // ALWAYS 0 — ElevenLabs recommends this for stability
      speed: 1.0,               // Natural conversation pace (0.9-1.1 range is ideal)
      use_speaker_boost: true,  // Enhanced voice clarity
    };

    const settings = { ...defaultSettings, ...voiceSettings };

    // Preprocess text for natural TTS output
    const processedText = this.preprocessForTTS(text);

    try {
      // Use global endpoint for geographic routing + latency optimization
      const url = new URL(
        `https://api-global-preview.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`
      );
      url.searchParams.set('optimize_streaming_latency', '3');  // Max optimization

      const response = await fetch(url.toString(), {
          method: 'POST',
          headers: {
            'Accept': 'audio/mpeg',
            'Content-Type': 'application/json',
            'xi-api-key': this.config.apiKey,
          },
          body: JSON.stringify({
            text: processedText,
            model_id: this.config.modelId,
            output_format: this.config.outputFormat,
            voice_settings: {
              stability: settings.stability,
              similarity_boost: settings.similarity_boost,
              style: 0,  // Force to 0 regardless of input
              speed: settings.speed,
              use_speaker_boost: settings.use_speaker_boost,
            },
          }),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`ElevenLabs API error: ${response.status} - ${error}`);
      }

      if (!response.body) {
        throw new Error('No response body from ElevenLabs');
      }

      const reader = response.body.getReader();
      
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          onComplete();
          break;
        }
        
        if (value) {
          onChunk(Buffer.from(value));
        }
      }
    } catch (error) {
      onError(error as Error);
    }
  }

  // Preprocess text for natural TTS output
  // Based on: https://elevenlabs.io/docs/agents-platform/best-practices/prompting-guide
  private preprocessForTTS(text: string): string {
    let processed = text;

    // Normalize special characters for speech
    processed = processed
      .replace(/@/g, ' at ')
      .replace(/\.com\b/g, ' dot com')
      .replace(/\.org\b/g, ' dot org')
      .replace(/https?:\/\//g, '');

    // Add SSML pauses after debate transition phrases (Flash v2.5 supports <break> tags)
    const transitionPhrases = [
      'First,', 'Second,', 'Third,', 'Finally,',
      'In conclusion,', 'Furthermore,', 'Moreover,',
      'However,', 'Therefore,', 'Consequently,',
      'On the other hand,', 'In contrast,',
    ];

    for (const phrase of transitionPhrases) {
      processed = processed.replace(
        new RegExp(phrase, 'g'),
        `${phrase} <break time="0.3s"/>`
      );
    }

    // Validate length (Flash/Turbo max: 40,000 chars)
    if (processed.length > 40000) {
      console.warn('Text exceeds 40K limit, truncating');
      processed = processed.slice(0, 39900) + '...';
    }

    return processed;
  }

  // Map emotion markers to voice settings
  // SIMPLIFIED: Only adjust stability and speed, keep style at 0
  // Per ElevenLabs: "We recommend keeping style at 0 at all times"
  mapEmotionToSettings(emotion: EmotionMarkers): VoiceSettings {
    // Only adjust stability and speed based on emotion — never touch style
    const emotionMappings: Record<string, { stability: number; speed: number }> = {
      confident:   { stability: 0.60, speed: 1.0 },   // Steady, normal pace
      passionate:  { stability: 0.45, speed: 1.05 },  // More dynamic, slightly faster
      aggressive:  { stability: 0.40, speed: 1.1 },   // Most dynamic, faster
      measured:    { stability: 0.70, speed: 0.95 },  // Very stable, slightly slower
      uncertain:   { stability: 0.55, speed: 0.9 },   // Moderate stability, slower
      neutral:     { stability: 0.55, speed: 1.0 },   // Default balanced settings
    };

    const settings = emotionMappings[emotion.dominantEmotion] || emotionMappings.neutral;

    return {
      stability: settings.stability,
      similarity_boost: 0.75,
      style: 0,  // ALWAYS 0 for stability
      speed: settings.speed,
      use_speaker_boost: true,
    };
  }
}

export const elevenLabsTTS = new ElevenLabsTTSService();
```

#### 1.3 TTS Session Manager (server/src/tts/sessionManager.ts)

```typescript
interface TTSSession {
  participantId: string;
  roomId: string;
  voiceId: string;
  isGenerating: boolean;
  queue: TTSRequest[];
}

class TTSSessionManager {
  private sessions: Map<string, TTSSession> = new Map();
  private participantVoices: Map<string, string> = new Map();  // participantId → voiceId

  createSession(participantId: string, roomId: string, voiceId: string): void {
    this.sessions.set(participantId, {
      participantId,
      roomId,
      voiceId,
      isGenerating: false,
      queue: [],
    });
    this.participantVoices.set(participantId, voiceId);
  }

  getVoiceForParticipant(participantId: string): string | undefined {
    return this.participantVoices.get(participantId);
  }

  setVoiceForParticipant(participantId: string, voiceId: string): void {
    this.participantVoices.set(participantId, voiceId);
    const session = this.sessions.get(participantId);
    if (session) {
      session.voiceId = voiceId;
    }
  }

  async queueTTS(
    participantId: string,
    request: TTSRequest,
    onChunk: (chunk: Buffer, index: number) => void,
    onComplete: () => void
  ): Promise<void> {
    const session = this.sessions.get(participantId);
    if (!session) {
      console.warn(`No TTS session for participant ${participantId}`);
      return;
    }

    session.queue.push(request);
    this.processQueue(session, onChunk, onComplete);
  }

  private async processQueue(
    session: TTSSession,
    onChunk: (chunk: Buffer, index: number) => void,
    onComplete: () => void
  ): Promise<void> {
    if (session.isGenerating || session.queue.length === 0) {
      return;
    }

    session.isGenerating = true;
    const request = session.queue.shift()!;
    let chunkIndex = 0;

    await elevenLabsTTS.generateStream({
      text: request.text,
      voiceId: session.voiceId,
      voiceSettings: request.emotionHints 
        ? elevenLabsTTS.mapEmotionToSettings(request.emotionHints)
        : undefined,
      onChunk: (chunk) => {
        onChunk(chunk, chunkIndex++);
      },
      onComplete: () => {
        session.isGenerating = false;
        onComplete();
        // Process next in queue
        this.processQueue(session, onChunk, onComplete);
      },
      onError: (error) => {
        console.error('TTS generation error:', error);
        session.isGenerating = false;
        // Try next in queue
        this.processQueue(session, onChunk, onComplete);
      },
    });
  }

  endSession(participantId: string): void {
    this.sessions.delete(participantId);
  }
}

export const ttsSessionManager = new TTSSessionManager();
```

---

### Phase 2: WebSocket Integration

#### 2.1 TTS Handler (server/src/websocket/handlers.ts additions)

```typescript
// Add to handleTranslationComplete function
async function handleTranslationComplete(
  client: ExtendedWebSocket,
  speakerId: string,
  originalText: string,
  translatedText: string,
  sourceLanguage: LanguageCode,
  targetLanguage: LanguageCode,
  server: SignalingServer
): Promise<void> {
  const roomId = client.roomId;
  if (!roomId) return;

  // Broadcast translation to all participants (existing)
  server.broadcastToRoom(roomId, {
    type: 'translation:complete',
    payload: {
      speakerId,
      originalText,
      translatedText,
      originalLanguage: sourceLanguage,
      targetLanguage,
      latencyMs: Date.now() - startTime,
    },
  });

  // Generate TTS for listeners who need translation
  await generateTTSForListeners(
    roomId,
    speakerId,
    translatedText,
    targetLanguage,
    server
  );
}

async function generateTTSForListeners(
  roomId: string,
  speakerId: string,
  translatedText: string,
  targetLanguage: LanguageCode,
  server: SignalingServer
): Promise<void> {
  const room = roomManager.getRoom(roomId);
  if (!room) return;

  // Find listeners who need this translation spoken
  const listeners = Array.from(room.participants.values())
    .filter(p => p.id !== speakerId && p.listeningLanguage === targetLanguage);

  if (listeners.length === 0) return;

  // Get voice for speaker
  const voiceId = ttsSessionManager.getVoiceForParticipant(speakerId);
  if (!voiceId) {
    // Use default voice for target language
    const defaultVoice = elevenLabsTTS.getPresetVoices(targetLanguage)[0];
    if (!defaultVoice) return;
    ttsSessionManager.setVoiceForParticipant(speakerId, defaultVoice.voiceId);
  }

  const speechId = room.currentSpeech || 'unknown';

  // Notify TTS start
  server.broadcastToRoom(roomId, {
    type: 'tts:start',
    payload: { speakerId, speechId, text: translatedText },
  }, speakerId);  // Exclude speaker from hearing their own TTS

  // Generate TTS stream
  await ttsSessionManager.queueTTS(
    speakerId,
    { text: translatedText, voiceId: voiceId!, targetLanguage },
    (chunk, index) => {
      // Broadcast audio chunk to listeners
      server.broadcastToRoom(roomId, {
        type: 'tts:audio_chunk',
        payload: {
          speakerId,
          speechId,
          chunkIndex: index,
          audioData: chunk.toString('base64'),
          isFinal: false,
          timestamp: Date.now(),
        } as TTSAudioChunkPayload,
      }, speakerId);
    },
    () => {
      // TTS complete
      server.broadcastToRoom(roomId, {
        type: 'tts:end',
        payload: { speakerId, speechId },
      }, speakerId);
    }
  );
}

// Voice selection handler
function handleVoiceSelect(
  client: ExtendedWebSocket,
  payload: VoiceSelectPayload,
  server: SignalingServer
): void {
  if (!client.roomId) return;

  ttsSessionManager.setVoiceForParticipant(client.id, payload.speakingVoiceId);

  // Broadcast voice selection to room
  server.broadcastToRoom(client.roomId, {
    type: 'voice:select',
    payload: {
      participantId: client.id,
      voiceId: payload.speakingVoiceId,
    },
  });
}
```

#### 2.2 Voice List Handler

```typescript
function handleVoiceListRequest(
  client: ExtendedWebSocket,
  payload: { language: LanguageCode },
  server: SignalingServer
): void {
  const voices = elevenLabsTTS.getPresetVoices(payload.language);
  
  server.send(client.id, {
    type: 'voice:list',
    payload: { voices, language: payload.language },
  });
}
```

---

### Phase 3: Browser Audio Playback

#### 3.1 Audio Playback Manager (client/src/lib/audioPlayback.ts)

```typescript
interface AudioChunk {
  chunkIndex: number;
  audioData: ArrayBuffer;
  timestamp: number;
}

interface PlaybackState {
  isPlaying: boolean;
  currentSpeakerId: string | null;
  volume: number;
  bufferedChunks: number;
}

class AudioPlaybackManager {
  private audioContext: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private chunkQueue: Map<string, AudioChunk[]> = new Map();  // speakerId → chunks
  private isPlaying: Map<string, boolean> = new Map();
  private nextPlayTime: Map<string, number> = new Map();
  private volume: number = 1.0;

  async initialize(): Promise<void> {
    if (this.audioContext) return;

    this.audioContext = new AudioContext();
    this.gainNode = this.audioContext.createGain();
    this.gainNode.connect(this.audioContext.destination);
    this.gainNode.gain.value = this.volume;

    // Resume context on user interaction if suspended
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  async queueChunk(
    speakerId: string,
    chunkIndex: number,
    base64Audio: string,
    isFinal: boolean
  ): Promise<void> {
    await this.initialize();

    // Decode base64 to ArrayBuffer
    const binaryString = atob(base64Audio);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const audioData = bytes.buffer;

    // Add to queue
    if (!this.chunkQueue.has(speakerId)) {
      this.chunkQueue.set(speakerId, []);
      this.nextPlayTime.set(speakerId, this.audioContext!.currentTime);
    }

    this.chunkQueue.get(speakerId)!.push({
      chunkIndex,
      audioData,
      timestamp: Date.now(),
    });

    // Sort by chunk index
    this.chunkQueue.get(speakerId)!.sort((a, b) => a.chunkIndex - b.chunkIndex);

    // Start playback if not already playing
    if (!this.isPlaying.get(speakerId)) {
      this.playNext(speakerId);
    }
  }

  private async playNext(speakerId: string): Promise<void> {
    const queue = this.chunkQueue.get(speakerId);
    if (!queue || queue.length === 0) {
      this.isPlaying.set(speakerId, false);
      return;
    }

    this.isPlaying.set(speakerId, true);
    const chunk = queue.shift()!;

    try {
      const audioBuffer = await this.audioContext!.decodeAudioData(
        chunk.audioData.slice(0)  // Clone buffer as decodeAudioData detaches it
      );

      const source = this.audioContext!.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.gainNode!);

      const playTime = this.nextPlayTime.get(speakerId)!;
      source.start(playTime);

      // Schedule next chunk
      this.nextPlayTime.set(speakerId, playTime + audioBuffer.duration);

      // Queue next playback
      source.onended = () => {
        this.playNext(speakerId);
      };
    } catch (error) {
      console.error('Error decoding audio chunk:', error);
      // Try next chunk
      this.playNext(speakerId);
    }
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.gainNode) {
      this.gainNode.gain.value = this.volume;
    }
  }

  stop(speakerId: string): void {
    this.chunkQueue.set(speakerId, []);
    this.isPlaying.set(speakerId, false);
  }

  stopAll(): void {
    this.chunkQueue.clear();
    this.isPlaying.clear();
    this.nextPlayTime.clear();
  }

  getState(speakerId: string): PlaybackState {
    return {
      isPlaying: this.isPlaying.get(speakerId) || false,
      currentSpeakerId: speakerId,
      volume: this.volume,
      bufferedChunks: this.chunkQueue.get(speakerId)?.length || 0,
    };
  }
}

export const audioPlaybackManager = new AudioPlaybackManager();
```

#### 3.2 Audio Playback Hook (client/src/hooks/useAudioPlayback.ts)

```typescript
import { useEffect, useCallback, useState } from 'react';
import { audioPlaybackManager } from '../lib/audioPlayback';

interface UseAudioPlaybackOptions {
  enabled: boolean;
  onPlaybackStart?: (speakerId: string) => void;
  onPlaybackEnd?: (speakerId: string) => void;
}

interface AudioPlaybackState {
  isPlaying: boolean;
  volume: number;
  activeSpeakerId: string | null;
}

export function useAudioPlayback(options: UseAudioPlaybackOptions) {
  const { enabled, onPlaybackStart, onPlaybackEnd } = options;
  const [state, setState] = useState<AudioPlaybackState>({
    isPlaying: false,
    volume: 1.0,
    activeSpeakerId: null,
  });

  const handleAudioChunk = useCallback(
    async (speakerId: string, chunkIndex: number, audioData: string, isFinal: boolean) => {
      if (!enabled) return;

      await audioPlaybackManager.queueChunk(speakerId, chunkIndex, audioData, isFinal);

      if (!state.isPlaying) {
        setState(prev => ({ ...prev, isPlaying: true, activeSpeakerId: speakerId }));
        onPlaybackStart?.(speakerId);
      }

      if (isFinal) {
        // Wait for queue to drain, then signal end
        const checkEnd = setInterval(() => {
          const playbackState = audioPlaybackManager.getState(speakerId);
          if (!playbackState.isPlaying && playbackState.bufferedChunks === 0) {
            clearInterval(checkEnd);
            setState(prev => ({ ...prev, isPlaying: false, activeSpeakerId: null }));
            onPlaybackEnd?.(speakerId);
          }
        }, 100);
      }
    },
    [enabled, state.isPlaying, onPlaybackStart, onPlaybackEnd]
  );

  const setVolume = useCallback((volume: number) => {
    audioPlaybackManager.setVolume(volume);
    setState(prev => ({ ...prev, volume }));
  }, []);

  const stop = useCallback((speakerId?: string) => {
    if (speakerId) {
      audioPlaybackManager.stop(speakerId);
    } else {
      audioPlaybackManager.stopAll();
    }
    setState(prev => ({ ...prev, isPlaying: false, activeSpeakerId: null }));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      audioPlaybackManager.stopAll();
    };
  }, []);

  return {
    ...state,
    handleAudioChunk,
    setVolume,
    stop,
  };
}
```

---

### Phase 4: Voice Selection UI

#### 4.1 Voice Selector Component (client/src/components/VoiceSelector.tsx)

```typescript
import { useState, useEffect } from 'react';
import { VoiceConfig, LanguageCode } from '@shared/types';

interface VoiceSelectorProps {
  language: LanguageCode;
  selectedVoiceId: string | null;
  onVoiceSelect: (voiceId: string) => void;
  voices: VoiceConfig[];
  loading?: boolean;
  disabled?: boolean;
}

export function VoiceSelector({
  language,
  selectedVoiceId,
  onVoiceSelect,
  voices,
  loading,
  disabled,
}: VoiceSelectorProps) {
  const [previewPlaying, setPreviewPlaying] = useState<string | null>(null);
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);

  const playPreview = async (voice: VoiceConfig) => {
    if (previewPlaying === voice.voiceId) {
      audio?.pause();
      setPreviewPlaying(null);
      return;
    }

    if (audio) {
      audio.pause();
    }

    if (voice.previewUrl) {
      const newAudio = new Audio(voice.previewUrl);
      newAudio.onended = () => setPreviewPlaying(null);
      setAudio(newAudio);
      setPreviewPlaying(voice.voiceId);
      await newAudio.play();
    }
  };

  useEffect(() => {
    return () => {
      audio?.pause();
    };
  }, [audio]);

  if (loading) {
    return (
      <div className="voice-selector animate-pulse">
        <div className="h-24 bg-gray-700 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="voice-selector space-y-3">
      <label className="block text-sm font-medium text-gray-300">
        Select your debate voice:
      </label>
      
      <div className="grid grid-cols-1 gap-2">
        {voices.map((voice) => (
          <button
            key={voice.voiceId}
            onClick={() => onVoiceSelect(voice.voiceId)}
            disabled={disabled}
            className={`
              flex items-center justify-between p-3 rounded-lg border-2 transition-all
              ${selectedVoiceId === voice.voiceId
                ? 'border-purple-500 bg-purple-500/20'
                : 'border-gray-600 hover:border-gray-500 bg-gray-800'
              }
              ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
            `}
          >
            <div className="flex items-center gap-3">
              <div className={`
                w-10 h-10 rounded-full flex items-center justify-center
                ${voice.labels?.gender === 'female' 
                  ? 'bg-pink-500/20 text-pink-400' 
                  : 'bg-blue-500/20 text-blue-400'
                }
              `}>
                {voice.labels?.gender === 'female' ? '👩' : '👨'}
              </div>
              <div className="text-left">
                <div className="font-medium text-white">{voice.name}</div>
                <div className="text-xs text-gray-400">
                  {voice.labels?.accent && `${voice.labels.accent} accent`}
                  {voice.labels?.use_case && ` • ${voice.labels.use_case}`}
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {voice.previewUrl && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    playPreview(voice);
                  }}
                  className="p-2 rounded-full hover:bg-gray-700 transition-colors"
                  disabled={disabled}
                >
                  {previewPlaying === voice.voiceId ? (
                    <span className="text-purple-400">⏸</span>
                  ) : (
                    <span className="text-gray-400">▶️</span>
                  )}
                </button>
              )}
              
              {selectedVoiceId === voice.voiceId && (
                <span className="text-purple-400 text-xl">✓</span>
              )}
            </div>
          </button>
        ))}
      </div>
      
      {voices.length === 0 && (
        <div className="text-center text-gray-500 py-4">
          No voices available for this language
        </div>
      )}
    </div>
  );
}
```

#### 4.2 TTS Settings Panel (client/src/components/TTSSettings.tsx)

```typescript
import { useState } from 'react';

interface TTSSettingsProps {
  volume: number;
  onVolumeChange: (volume: number) => void;
  isEnabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
}

export function TTSSettings({
  volume,
  onVolumeChange,
  isEnabled,
  onEnabledChange,
}: TTSSettingsProps) {
  return (
    <div className="tts-settings bg-gray-800 rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-300">
          Voice Synthesis
        </label>
        <button
          onClick={() => onEnabledChange(!isEnabled)}
          className={`
            relative inline-flex h-6 w-11 items-center rounded-full transition-colors
            ${isEnabled ? 'bg-purple-600' : 'bg-gray-600'}
          `}
        >
          <span
            className={`
              inline-block h-4 w-4 transform rounded-full bg-white transition-transform
              ${isEnabled ? 'translate-x-6' : 'translate-x-1'}
            `}
          />
        </button>
      </div>

      {isEnabled && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm text-gray-400">Volume</label>
            <span className="text-sm text-gray-500">{Math.round(volume * 100)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={volume}
            onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
          />
        </div>
      )}

      <div className="text-xs text-gray-500">
        {isEnabled 
          ? "You'll hear your opponent's translated speech in their selected voice"
          : "Voice synthesis disabled - you'll only see text transcripts"
        }
      </div>
    </div>
  );
}
```

---

### Phase 5: Integration with Existing Flow

#### 5.1 Updated Room Component Integration

```typescript
// In client/src/pages/Room.tsx

// Add TTS-related imports
import { useAudioPlayback } from '../hooks/useAudioPlayback';
import { VoiceSelector } from '../components/VoiceSelector';
import { TTSSettings } from '../components/TTSSettings';

// In the Room component:
const [selectedVoice, setSelectedVoice] = useState<string | null>(null);
const [ttsEnabled, setTTSEnabled] = useState(true);
const [ttsVolume, setTTSVolume] = useState(1.0);
const [availableVoices, setAvailableVoices] = useState<VoiceConfig[]>([]);

const { handleAudioChunk, setVolume, isPlaying: ttsIsPlaying } = useAudioPlayback({
  enabled: ttsEnabled,
  onPlaybackStart: (speakerId) => {
    console.log(`TTS playback started for ${speakerId}`);
  },
  onPlaybackEnd: (speakerId) => {
    console.log(`TTS playback ended for ${speakerId}`);
  },
});

// Handle TTS audio chunks from WebSocket
useEffect(() => {
  if (!ws) return;

  const handleMessage = (event: MessageEvent) => {
    const message = JSON.parse(event.data);
    
    switch (message.type) {
      case 'voice:list':
        setAvailableVoices(message.payload.voices);
        break;
      case 'tts:audio_chunk':
        const { speakerId, chunkIndex, audioData, isFinal } = message.payload;
        handleAudioChunk(speakerId, chunkIndex, audioData, isFinal);
        break;
      // ... other handlers
    }
  };

  ws.addEventListener('message', handleMessage);
  return () => ws.removeEventListener('message', handleMessage);
}, [ws, handleAudioChunk]);

// Request voices when language changes
useEffect(() => {
  if (ws && listeningLanguage) {
    ws.send(JSON.stringify({
      type: 'voice:list:request',
      payload: { language: listeningLanguage },
    }));
  }
}, [ws, listeningLanguage]);

// Send voice selection
const handleVoiceSelect = (voiceId: string) => {
  setSelectedVoice(voiceId);
  if (ws) {
    ws.send(JSON.stringify({
      type: 'voice:select',
      payload: { speakingVoiceId: voiceId },
    }));
  }
};

// Update volume
useEffect(() => {
  setVolume(ttsVolume);
}, [ttsVolume, setVolume]);
```

#### 5.2 Pre-Debate Setup with Voice Selection

Add voice selection to the pre-debate setup flow:

```typescript
// In the setup phase (before debate starts)
{roomState.status === 'waiting' && (
  <div className="pre-debate-setup space-y-6">
    {/* Existing language selection */}
    <LanguageSelector
      value={speakingLanguage}
      onChange={setSpeakingLanguage}
      label="I will speak in:"
    />
    <LanguageSelector
      value={listeningLanguage}
      onChange={setListeningLanguage}
      label="I want to hear my opponent in:"
    />
    
    {/* New voice selection */}
    <div className="voice-setup">
      <h3 className="text-lg font-medium text-white mb-3">
        Choose your debate voice
      </h3>
      <p className="text-sm text-gray-400 mb-4">
        This is how your opponent will hear you when your speech is translated
      </p>
      <VoiceSelector
        language={speakingLanguage}
        selectedVoiceId={selectedVoice}
        onVoiceSelect={handleVoiceSelect}
        voices={availableVoices}
        loading={availableVoices.length === 0}
      />
    </div>
    
    {/* TTS settings */}
    <TTSSettings
      volume={ttsVolume}
      onVolumeChange={setTTSVolume}
      isEnabled={ttsEnabled}
      onEnabledChange={setTTSEnabled}
    />
    
    {/* Ready button */}
    <button
      onClick={handleReady}
      disabled={!selectedVoice}
      className={`
        w-full py-3 rounded-lg font-medium transition-colors
        ${selectedVoice 
          ? 'bg-purple-600 hover:bg-purple-700 text-white' 
          : 'bg-gray-700 text-gray-400 cursor-not-allowed'
        }
      `}
    >
      {selectedVoice ? 'Ready to Debate' : 'Select a voice to continue'}
    </button>
  </div>
)}
```

---

### Phase 6: Stretch Goal - Voice Cloning

#### 6.1 Voice Clone Service (server/src/tts/voiceClone.ts)

```typescript
interface VoiceCloneResult {
  voiceId: string;
  name: string;
  previewUrl?: string;
}

class VoiceCloneService {
  private apiKey: string;
  private clonedVoices: Map<string, VoiceCloneResult> = new Map();

  constructor() {
    this.apiKey = process.env.ELEVENLABS_API_KEY!;
  }

  async createInstantClone(
    participantId: string,
    audioSample: Buffer,
    name: string
  ): Promise<VoiceCloneResult> {
    const formData = new FormData();
    formData.append('files', new Blob([audioSample], { type: 'audio/wav' }), 'sample.wav');
    formData.append('name', `debate-${participantId}-${Date.now()}`);
    formData.append('description', `Debate voice for ${name}`);

    const response = await fetch('https://api.elevenlabs.io/v1/voices/add', {
      method: 'POST',
      headers: {
        'xi-api-key': this.apiKey,
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Voice clone failed: ${response.status}`);
    }

    const data = await response.json();
    const result: VoiceCloneResult = {
      voiceId: data.voice_id,
      name,
      previewUrl: data.preview_url,
    };

    this.clonedVoices.set(participantId, result);
    return result;
  }

  async deleteClone(participantId: string): Promise<void> {
    const clone = this.clonedVoices.get(participantId);
    if (!clone) return;

    await fetch(`https://api.elevenlabs.io/v1/voices/${clone.voiceId}`, {
      method: 'DELETE',
      headers: {
        'xi-api-key': this.apiKey,
      },
    });

    this.clonedVoices.delete(participantId);
  }

  getClone(participantId: string): VoiceCloneResult | undefined {
    return this.clonedVoices.get(participantId);
  }
}

export const voiceCloneService = new VoiceCloneService();
```

#### 6.2 Voice Sample Recorder (client/src/components/VoiceSampleRecorder.tsx)

```typescript
import { useState, useRef, useCallback } from 'react';

interface VoiceSampleRecorderProps {
  onSampleComplete: (audioBlob: Blob) => void;
  sampleDuration?: number; // in seconds
}

export function VoiceSampleRecorder({
  onSampleComplete,
  sampleDuration = 30,
}: VoiceSampleRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      // Update timer every second
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => {
          if (prev >= sampleDuration - 1) {
            stopRecording();
            return sampleDuration;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (error) {
      console.error('Failed to start recording:', error);
    }
  }, [sampleDuration]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
  }, [isRecording]);

  const submitSample = useCallback(() => {
    if (chunksRef.current.length > 0) {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      onSampleComplete(blob);
    }
  }, [onSampleComplete]);

  const resetRecording = useCallback(() => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setAudioUrl(null);
    setRecordingTime(0);
    chunksRef.current = [];
  }, [audioUrl]);

  return (
    <div className="voice-sample-recorder bg-gray-800 rounded-lg p-6 space-y-4">
      <div className="text-center">
        <h3 className="text-lg font-medium text-white mb-2">
          Clone Your Voice
        </h3>
        <p className="text-sm text-gray-400">
          Record a {sampleDuration}-second sample to create a voice clone.
          Speak naturally as if you were debating.
        </p>
      </div>

      {/* Recording visualization */}
      <div className="relative h-24 bg-gray-900 rounded-lg flex items-center justify-center">
        {isRecording ? (
          <div className="flex items-center gap-4">
            <div className="w-4 h-4 bg-red-500 rounded-full animate-pulse" />
            <span className="text-2xl font-mono text-white">
              {recordingTime}s / {sampleDuration}s
            </span>
          </div>
        ) : audioUrl ? (
          <audio src={audioUrl} controls className="w-full max-w-xs" />
        ) : (
          <span className="text-gray-500">Ready to record</span>
        )}
      </div>

      {/* Progress bar */}
      {isRecording && (
        <div className="w-full bg-gray-700 rounded-full h-2">
          <div
            className="bg-purple-500 h-2 rounded-full transition-all duration-1000"
            style={{ width: `${(recordingTime / sampleDuration) * 100}%` }}
          />
        </div>
      )}

      {/* Controls */}
      <div className="flex gap-3 justify-center">
        {!isRecording && !audioUrl && (
          <button
            onClick={startRecording}
            className="px-6 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-medium text-white"
          >
            🎤 Start Recording
          </button>
        )}

        {isRecording && (
          <button
            onClick={stopRecording}
            className="px-6 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg font-medium text-white"
          >
            ⏹ Stop
          </button>
        )}

        {audioUrl && (
          <>
            <button
              onClick={resetRecording}
              className="px-6 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg font-medium text-white"
            >
              🔄 Re-record
            </button>
            <button
              onClick={submitSample}
              className="px-6 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg font-medium text-white"
            >
              ✓ Use This Voice
            </button>
          </>
        )}
      </div>

      <div className="text-xs text-gray-500 text-center">
        Tip: Read a sample debate passage for best results
      </div>
    </div>
  );
}
```

---

## WebSocket Protocol Updates

### New Message Types

```typescript
// Client → Server
'voice:list:request'   { language: LanguageCode }
'voice:select'         { speakingVoiceId: string, listeningVoiceId?: string }
'voice:clone:start'    { audioSample: string (base64), name: string }

// Server → Client
'voice:list'           { voices: VoiceConfig[], language: LanguageCode }
'voice:clone:complete' { voiceId: string, name: string, previewUrl?: string }
'voice:clone:error'    { error: string }
'tts:start'            { speakerId: string, speechId: string, text: string }
'tts:audio_chunk'      { speakerId: string, speechId: string, chunkIndex: number, audioData: string, isFinal: boolean }
'tts:end'              { speakerId: string, speechId: string }
'tts:error'            { speakerId: string, error: string }
```

### Message Flow

```
Pre-Debate Setup
================
Client A                         Server                          Client B
    |                               |                                 |
    |-- voice:list:request -------->|                                 |
    |<-- voice:list (EN voices) ----|                                 |
    |                               |                                 |
    |-- voice:select (Sarah) ------>|                                 |
    |                               |-- voice:select broadcast ------>|
    |                               |                                 |

During Debate (Translation + TTS)
=================================
Speaker A (Korean)               Server                    Listener B (English)
    |                               |                                 |
    |-- audio:chunk --------------->|                                 |
    |                               |-- [Gemini STT] -->              |
    |                               |<-- stt:final ---|               |
    |                               |                                 |
    |                               |-- [Gemini Translation] -->      |
    |                               |<-- translation:complete ---|    |
    |                               |                                 |
    |                               |-- translation:complete -------->|
    |                               |                                 |
    |                               |-- [ElevenLabs TTS] -->          |
    |                               |-- tts:start ------------------->|
    |                               |-- tts:audio_chunk ------------->|
    |                               |-- tts:audio_chunk ------------->|
    |                               |-- ...                           |
    |                               |-- tts:end --------------------->|
    |                               |                                 |
    |                               |           [Audio plays in B's browser]
```

---

## Environment Configuration

### Required Environment Variables

Add to `server/.env`:

```bash
# server/.env

# Existing
GEMINI_API_KEY=your-gemini-api-key
PORT=3001

# New for Milestone 3
ELEVENLABS_API_KEY=your-elevenlabs-api-key
```

**Getting ElevenLabs API Key:**
1. Sign up at https://elevenlabs.io
2. Go to Profile → API Key
3. Copy and add to `.env`

**Free Tier Limits:**
- 10,000 characters/month
- ~10-15 minutes of audio
- For testing: Recommend upgrading to Starter ($5/mo) for 30,000 chars

---

## Latency Budget

| Stage | Target | Notes |
|-------|--------|-------|
| Translation complete | ~300ms | From Milestone 2 |
| Text preprocessing | ~5ms | Normalization + SSML insertion |
| ElevenLabs API call | ~75ms | eleven_flash_v2_5 + optimize_streaming_latency=3 |
| First chunk network | ~40ms | Global endpoint + WebSocket |
| Audio decode + queue | ~20ms | Web Audio API |
| **Total (first audio)** | **~440ms** | From translation to first sound |

**Optimizations applied:**
- Flash v2.5 model (75ms vs 300ms for Turbo)
- `optimize_streaming_latency=3` query parameter
- Global preview endpoint for geographic routing
- Text preprocessing happens in parallel with network setup

**Streaming advantage:** Audio begins playing while rest of sentence is still generating.

---

## Dependencies to Add

```json
// server/package.json
{
  "dependencies": {
    // ... existing
    // No new npm packages needed - using fetch for ElevenLabs API
  }
}

// client/package.json
{
  "dependencies": {
    // ... existing (no new deps - using Web Audio API)
  }
}
```

---

## Implementation Order

### Phase 1: ElevenLabs Service ✅
- [x] Create ElevenLabs TTS service
- [x] Implement preset voice configuration
- [x] Add streaming audio generation
- [x] Handle API errors and rate limits

### Phase 2: WebSocket Integration ✅
- [x] Add TTS message handlers
- [x] Implement voice list endpoint
- [x] Wire TTS generation to translation pipeline
- [x] Broadcast audio chunks to listeners

### Phase 3: Browser Audio Playback ✅
- [x] Create AudioPlaybackManager class
- [x] Implement chunk queuing and buffering
- [x] Handle audio decode with Web Audio API
- [x] Build useAudioPlayback hook

### Phase 4: Voice Selection UI ⬜
- [ ] Create VoiceSelector component
- [ ] Add voice preview functionality
- [ ] Create TTSSettings component
- [ ] Integrate into pre-debate setup

### Phase 5: Integration ✅
- [x] Wire up Room component with TTS
- [x] Handle TTS enable/disable toggle
- [x] Add volume controls
- [x] Mute original audio when TTS plays

### Phase 6: Voice Cloning (Stretch) ⬜
- [ ] Implement voice clone service
- [ ] Create VoiceSampleRecorder component
- [ ] Add clone-or-preset choice UI
- [ ] Handle clone cleanup on disconnect

### Phase 7: Polish ⬜
- [ ] Add playback status indicator
- [ ] Implement graceful degradation
- [ ] Error handling and retry logic
- [ ] Performance optimization

---

## Testing Strategy

### Unit Tests
- [ ] ElevenLabs service mock testing
- [ ] Audio chunk encoding/decoding
- [ ] Voice settings mapping
- [ ] Session management

### Integration Tests
- [ ] Translation → TTS pipeline
- [ ] WebSocket audio streaming
- [ ] Browser playback synchronization

### Manual Testing Checklist
- [ ] Voice selection works for all preset voices
- [ ] TTS audio plays clearly
- [ ] Audio syncs with transcript display
- [ ] Volume control works
- [ ] TTS can be disabled/enabled
- [ ] Multiple rapid translations don't cause audio overlap
- [ ] Playback recovers from network interruptions
- [ ] (Stretch) Voice clone produces recognizable voice

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| ElevenLabs rate limits | Implement request queue; show text fallback |
| High TTS latency | Use eleven_flash_v2_5 + optimize_streaming_latency=3; show text immediately |
| Audio playback glitches | Buffer 2-3 chunks before starting playback |
| Browser audio restrictions | Request user interaction before first playback |
| Voice quality issues | Curate preset voices; test with debate samples; offer multiple options |
| Voice instability | Keep style=0 always; use stability 0.50-0.65 range |
| API cost overruns | Track character usage; warn at thresholds; Flash is 50% cheaper |
| Network drops during streaming | Implement chunk retry; graceful audio gaps |
| Text too long | Validate against 40K char limit; truncate with warning |
| SSML compatibility | Only use `<break>` tags; avoid unsupported SSML features |

---

## Success Criteria

Milestone 3 is complete when:

1. ⬜ Users can select from preset voices per language
2. ⬜ ElevenLabs TTS generates audio from translated text
3. ⬜ Audio streams to listener's browser in real-time
4. ⬜ Audio playback is smooth without gaps
5. ⬜ Volume can be controlled independently
6. ⬜ TTS can be toggled on/off
7. ⬜ Latency from translation to first audio < 500ms (target: ~440ms with Flash v2.5)
8. ⬜ Works for English ↔ Korean demo pair
9. ⬜ Text preprocessing handles special characters and adds natural pauses
10. ⬜ (Stretch) Voice cloning from 30-second sample works

---

## ElevenLabs Voice Library Reference

### Recommended Preset Voices (MVP)

| Language | Voice Name | Voice ID | Gender | Description |
|----------|------------|----------|--------|-------------|
| English | Sarah | `EXAVITQu4vr4xnSDxMaL` | Female | Clear, professional |
| English | Liam | `TX3LPaxmHKxFdv7VOQHJ` | Male | Confident, authoritative |
| English | Charlotte | `XB0fDUnXU5powFXDhCwa` | Female | British, articulate |
| Korean | Seoyeon | (TBD - needs testing) | Female | Natural Korean |
| Japanese | Yuki | (TBD - needs testing) | Female | Clear Japanese |
| Spanish | Sofia | (TBD - needs testing) | Female | Neutral Spanish |
| Chinese | Wei | (TBD - needs testing) | Male | Mandarin |

**Note:** Actual voice IDs should be verified from ElevenLabs library during implementation.

---

## References

### ElevenLabs Documentation
- [ElevenLabs API Documentation](https://elevenlabs.io/docs/api-reference)
- [Streaming TTS API](https://elevenlabs.io/docs/api-reference/text-to-speech/stream)
- [Models Overview](https://elevenlabs.io/docs/overview/models) — Flash v2.5 vs Turbo v2.5 comparison
- [Text to Speech Capabilities](https://elevenlabs.io/docs/overview/capabilities/text-to-speech)
- [Voice Changer](https://elevenlabs.io/docs/overview/capabilities/voice-changer)
- [ElevenLabs Voice Library](https://elevenlabs.io/voice-library)

### Best Practices (Critical Reading)
- [Conversational Voice Design](https://elevenlabs.io/docs/agents-platform/customization/voice/best-practices/conversational-voice-design) — Voice settings recommendations
- [Prompting Guide](https://elevenlabs.io/docs/agents-platform/best-practices/prompting-guide) — Text normalization for TTS
- [Agents Platform Quickstart](https://elevenlabs.io/docs/agents-platform/quickstart) — Implementation patterns
- [How to Add Pauses (SSML)](https://help.elevenlabs.io/hc/en-us/articles/13416374683665-How-can-I-add-pauses)
- [SSML Phoneme Tags](https://help.elevenlabs.io/hc/en-us/articles/24352686926609-Do-pauses-and-SSML-phoneme-tags-work-with-the-API)

### Voice Cloning
- [Instant Voice Cloning](https://elevenlabs.io/docs/creative-platform/voices/voice-cloning/instant-voice-cloning)
- [Voice Cloning Sample Requirements](https://help.elevenlabs.io/hc/en-us/articles/13434364550801-How-many-voice-samples-should-I-upload-for-Instant-Voice-Cloning)

### Web Audio
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [AudioContext.decodeAudioData()](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/decodeAudioData)

### Model Specifications
- [Flash v2.5 Announcement](https://elevenlabs.io/blog/meet-flash) — 75ms latency details
- [Turbo v2.5 Announcement](https://elevenlabs.io/blog/introducing-turbo-v2-5) — 32 language support
- [Audio Format Options](https://help.elevenlabs.io/hc/en-us/articles/15754340124305-What-audio-formats-do-you-support)

