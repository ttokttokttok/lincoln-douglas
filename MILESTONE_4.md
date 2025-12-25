# Milestone 4 — Emotion Preservation Implementation Plan

## Status: COMPLETE

**Current Phase:** Implementation Complete

**Last Updated:** 2024-12-25 - Core implementation complete

## Overview

This document details the implementation strategy for Milestone 4 of the Cross-Language Lincoln-Douglas Debate Platform. We're building the emotion preservation system: detecting emotional tone from transcript text, mapping emotions to ElevenLabs TTS voice settings, and preserving the speaker's emotional delivery through translation.

**The Goal:** When a debater delivers a passionate rebuttal in Korean, their opponent hears it in English with the same intensity — not just the words, but the conviction and rhetorical fire.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              CURRENT PIPELINE (M3)                               │
│                                                                                  │
│   Speaker Audio → Gemini STT → Gemini Translation → ElevenLabs TTS (neutral)    │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       │ + Milestone 4
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              NEW PIPELINE (M4)                                   │
│                                                                                  │
│   Speaker Audio ──────────────────────────────────────────────────────────┐     │
│        │                                                                  │     │
│        ▼                                                                  │     │
│   ┌──────────┐     ┌──────────────┐     ┌──────────────┐                 │     │
│   │  Gemini  │────▶│    Gemini    │────▶│   Emotion    │                 │     │
│   │   STT    │     │  Translation │     │   Detector   │                 │     │
│   └──────────┘     └──────────────┘     └──────┬───────┘                 │     │
│                                                │                          │     │
│                           ┌────────────────────┘                          │     │
│                           │ emotionHints                                  │     │
│                           ▼                                               │     │
│                    ┌──────────────┐                                       │     │
│                    │  ElevenLabs  │                                       │     │
│                    │  TTS Stream  │                                       │     │
│                    │  (emotional) │                                       │     │
│                    └──────┬───────┘                                       │     │
│                           │                                               │     │
│                           ▼                                               │     │
│              ┌────────────────────────────────────────┐                  │     │
│              │         Audio Mixer (Browser)          │◀─────────────────┘     │
│              │  TTS with emotional delivery           │                        │
│              └────────────────────────────────────────┘                        │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Emotion Detection Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           EMOTION DETECTION PIPELINE                             │
│                                                                                  │
│   Original Text (any language)                                                   │
│          │                                                                       │
│          ▼                                                                       │
│   ┌──────────────────────────────────────────────────────────────┐              │
│   │                    Gemini Emotion Detector                    │              │
│   │                                                               │              │
│   │   Input:                                                      │              │
│   │   - Original transcript (source language)                     │              │
│   │   - Translated text (target language)                         │              │
│   │   - Debate context (speech role, side, resolution)            │              │
│   │                                                               │              │
│   │   Analysis:                                                   │              │
│   │   - Rhetorical markers (emphatic phrases, questions)          │              │
│   │   - Punctuation patterns (! ? ...)                            │              │
│   │   - Debate-specific intensity signals                         │              │
│   │   - Word choice and phrasing                                  │              │
│   │                                                               │              │
│   │   Output:                                                     │              │
│   │   - dominantEmotion: confident|passionate|aggressive|etc.     │              │
│   │   - intensity: 0.0-1.0                                        │              │
│   │   - confidence: 0.0-1.0                                       │              │
│   │                                                               │              │
│   └───────────────────────────────┬──────────────────────────────┘              │
│                                   │                                              │
│                                   ▼                                              │
│   ┌──────────────────────────────────────────────────────────────┐              │
│   │                    Emotion → TTS Mapping                      │              │
│   │                                                               │              │
│   │   ┌─────────────┬────────────┬───────────┐                   │              │
│   │   │  Emotion    │  Stability │   Speed   │                   │              │
│   │   ├─────────────┼────────────┼───────────┤                   │              │
│   │   │  confident  │    0.60    │   1.00    │                   │              │
│   │   │  passionate │    0.45    │   1.05    │                   │              │
│   │   │  aggressive │    0.40    │   1.10    │                   │              │
│   │   │  measured   │    0.70    │   0.95    │                   │              │
│   │   │  uncertain  │    0.55    │   0.90    │                   │              │
│   │   │  neutral    │    0.55    │   1.00    │                   │              │
│   │   └─────────────┴────────────┴───────────┘                   │              │
│   │                                                               │              │
│   │   Note: style always 0 per ElevenLabs recommendation         │              │
│   │                                                               │              │
│   └───────────────────────────────┬──────────────────────────────┘              │
│                                   │                                              │
│                                   ▼                                              │
│                          VoiceSettings for TTS                                   │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Technology Decisions

### Emotion Detection Approach

| Approach | Complexity | Latency Impact | Quality | Decision |
|----------|------------|----------------|---------|----------|
| **Text-based (Gemini)** | Low | +100-200ms | Good | **Selected** |
| Audio-based (spectral) | High | +300-500ms | Best | Future enhancement |
| Hybrid (text + audio) | Medium | +200-300ms | Better | v2 consideration |

**Why Text-Based with Gemini:**
- Already using Gemini for STT and translation — no new dependencies
- Can analyze both original and translated text for consistency
- Low latency addition (~100-200ms)
- Good accuracy for debate-specific emotional markers
- Understands rhetorical devices and debate terminology

### ElevenLabs Voice Settings Strategy

Based on [ElevenLabs Conversational Voice Design Best Practices](https://elevenlabs.io/docs/agents-platform/customization/voice/best-practices/conversational-voice-design):

| Setting | Range | Emotion Impact | Notes |
|---------|-------|----------------|-------|
| **stability** | 0.40-0.70 | Primary control | Lower = more expressive, Higher = more consistent |
| **speed** | 0.90-1.10 | Secondary control | Faster = urgent/excited, Slower = measured/uncertain |
| **style** | 0 (always) | None | ElevenLabs recommends keeping at 0 for stability |
| **similarity_boost** | 0.75 (fixed) | None | Optimized for clarity |
| **use_speaker_boost** | true (fixed) | None | Enhanced voice clarity |

**Key Insight:** We only modulate `stability` and `speed` based on detected emotion. This follows ElevenLabs' recommendation to keep `style` at 0 for reliable output.

### Emotion Categories

| Emotion | Description | Debate Context | TTS Effect |
|---------|-------------|----------------|------------|
| **confident** | Assertive, certain | Strong claims, clear warrants | Steady pace, moderate stability |
| **passionate** | Intense, emphatic | Impact statements, value advocacy | Faster pace, more dynamic |
| **aggressive** | Forceful, attacking | Rebuttals, turns, cross-applications | Fastest pace, most dynamic |
| **measured** | Calm, deliberate | Framework arguments, definitions | Slower pace, high stability |
| **uncertain** | Tentative, questioning | Concessions, hedged claims | Slower pace, moderate stability |
| **neutral** | Balanced, informational | Evidence reading, roadmaps | Default settings |

---

## Existing Infrastructure

### Already Implemented (Milestone 3)

The following emotion-related code already exists and is ready to use:

**1. EmotionMarkers Type** (`shared/src/types.ts:469-474`)
```typescript
export interface EmotionMarkers {
  dominantEmotion: 'neutral' | 'confident' | 'passionate' | 'aggressive' | 'measured' | 'uncertain';
  intensity: number;      // 0-1
  confidence: number;     // 0-1
  suggestedSettings?: VoiceSettings;
}
```

**2. Emotion-to-Settings Mapping** (`server/src/tts/elevenLabsTts.ts:337-357`)
```typescript
mapEmotionToSettings(emotion: EmotionMarkers): VoiceSettings {
  const emotionMappings: Record<string, { stability: number; speed: number }> = {
    confident:   { stability: 0.60, speed: 1.0 },
    passionate:  { stability: 0.45, speed: 1.05 },
    aggressive:  { stability: 0.40, speed: 1.1 },
    measured:    { stability: 0.70, speed: 0.95 },
    uncertain:   { stability: 0.55, speed: 0.9 },
    neutral:     { stability: 0.55, speed: 1.0 },
  };
  // ... returns VoiceSettings
}
```

**3. TTSRequest with emotionHints** (`shared/src/types.ts:465`)
```typescript
export interface TTSRequest {
  text: string;
  voiceId: string;
  targetLanguage: LanguageCode;
  emotionHints?: EmotionMarkers;  // <-- Optional, not currently populated
}
```

**4. Session Manager Integration** (`server/src/tts/sessionManager.ts:161-163`)
```typescript
// In processQueue():
voiceSettings: request.emotionHints
  ? elevenLabsTTS.mapEmotionToSettings(request.emotionHints)
  : undefined,
```

### What's Missing

1. **Emotion Detection Service** — Analyze text to produce EmotionMarkers
2. **Pipeline Integration** — Call emotion detection after translation, before TTS
3. **Emotion Continuity** — Track emotion across utterances for smooth transitions
4. **UI Indicators** — Show detected emotion in transcript panel (optional)

---

## Detailed Implementation Tasks

### Phase 1: Emotion Detection Service

#### 1.1 Emotion Detector Service (server/src/emotion/emotionDetector.ts)

```typescript
import { GoogleGenerativeAI } from '@google/generative-ai';
import { EmotionMarkers, LanguageCode, SpeechRole, Side } from '@shared/types';

interface EmotionContext {
  resolution: string;
  speechRole: SpeechRole;
  speakerSide: Side;
  speakerName: string;
  previousEmotion?: EmotionMarkers;  // For continuity
}

interface EmotionDetectionResult {
  emotion: EmotionMarkers;
  latencyMs: number;
}

class EmotionDetectorService {
  private genAI: GoogleGenerativeAI;
  private model: ReturnType<GoogleGenerativeAI['getGenerativeModel']>;
  private emotionHistory: Map<string, EmotionMarkers[]> = new Map();  // speakerId → history

  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    this.model = this.genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      generationConfig: {
        temperature: 0.2,  // Low for consistent emotion detection
        maxOutputTokens: 256,
        responseMimeType: 'application/json',
      }
    });
  }

  async detectEmotion(
    originalText: string,
    translatedText: string,
    sourceLanguage: LanguageCode,
    targetLanguage: LanguageCode,
    context: EmotionContext
  ): Promise<EmotionDetectionResult> {
    const startTime = Date.now();

    // Skip emotion detection for very short text
    if (originalText.length < 20) {
      return {
        emotion: this.getDefaultEmotion(),
        latencyMs: Date.now() - startTime,
      };
    }

    const prompt = this.buildDetectionPrompt(
      originalText,
      translatedText,
      sourceLanguage,
      targetLanguage,
      context
    );

    try {
      const result = await this.model.generateContent(prompt);
      const jsonText = result.response.text();
      const parsed = JSON.parse(jsonText);

      const emotion: EmotionMarkers = {
        dominantEmotion: this.validateEmotion(parsed.dominantEmotion),
        intensity: this.clamp(parsed.intensity, 0, 1),
        confidence: this.clamp(parsed.confidence, 0, 1),
      };

      // Apply continuity smoothing
      const smoothedEmotion = this.applyContinuity(
        emotion,
        context.previousEmotion
      );

      return {
        emotion: smoothedEmotion,
        latencyMs: Date.now() - startTime,
      };
    } catch (error) {
      console.error('Emotion detection failed:', error);
      return {
        emotion: context.previousEmotion || this.getDefaultEmotion(),
        latencyMs: Date.now() - startTime,
      };
    }
  }

  private buildDetectionPrompt(
    originalText: string,
    translatedText: string,
    sourceLanguage: LanguageCode,
    targetLanguage: LanguageCode,
    context: EmotionContext
  ): string {
    return `You are analyzing the emotional tone of a debate speech segment.

CONTEXT:
- Debate Resolution: "${context.resolution}"
- Current Speech: ${context.speechRole} (${context.speakerSide} side)
- Speaker: ${context.speakerName}
${context.previousEmotion ? `- Previous emotional tone: ${context.previousEmotion.dominantEmotion}` : ''}

ORIGINAL TEXT (${sourceLanguage}):
${originalText}

TRANSLATED TEXT (${targetLanguage}):
${translatedText}

TASK: Analyze the emotional delivery and rhetorical intensity of this speech segment.

Consider these markers:
- Emphatic language and intensifiers ("absolutely", "must", "crucial")
- Rhetorical questions and exclamations
- Repetition for emphasis
- Attack language vs. defensive language
- Confident assertions vs. hedged statements
- Debate-specific signals (impacts, turns, extensions)

Return a JSON object:
{
  "dominantEmotion": "confident" | "passionate" | "aggressive" | "measured" | "uncertain" | "neutral",
  "intensity": 0.0-1.0,
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation (for debugging, not used in output)"
}

GUIDELINES:
- "confident": Clear, assertive statements with strong claims
- "passionate": Emphatic delivery about values/impacts, emotional appeals
- "aggressive": Direct attacks on opponent's arguments, strong rebuttals
- "measured": Calm, analytical, framework/definitional work
- "uncertain": Hedged language, concessions, tentative claims
- "neutral": Informational, evidence reading, roadmaps

Only return the JSON, no other text.`;
  }

  private validateEmotion(emotion: string): EmotionMarkers['dominantEmotion'] {
    const validEmotions = ['confident', 'passionate', 'aggressive', 'measured', 'uncertain', 'neutral'];
    return validEmotions.includes(emotion)
      ? emotion as EmotionMarkers['dominantEmotion']
      : 'neutral';
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  private getDefaultEmotion(): EmotionMarkers {
    return {
      dominantEmotion: 'neutral',
      intensity: 0.5,
      confidence: 0.5,
    };
  }

  // Smooth emotion transitions to avoid jarring voice changes
  private applyContinuity(
    current: EmotionMarkers,
    previous?: EmotionMarkers
  ): EmotionMarkers {
    if (!previous) return current;

    // If confidence is low, blend with previous emotion
    if (current.confidence < 0.6) {
      return {
        dominantEmotion: previous.dominantEmotion,
        intensity: (current.intensity + previous.intensity) / 2,
        confidence: current.confidence,
      };
    }

    // Smooth intensity transitions (max 0.3 change per utterance)
    const smoothedIntensity = previous.intensity +
      this.clamp(current.intensity - previous.intensity, -0.3, 0.3);

    return {
      ...current,
      intensity: smoothedIntensity,
    };
  }

  // Track emotion history for a speaker (for continuity)
  updateHistory(speakerId: string, emotion: EmotionMarkers): void {
    if (!this.emotionHistory.has(speakerId)) {
      this.emotionHistory.set(speakerId, []);
    }
    const history = this.emotionHistory.get(speakerId)!;
    history.push(emotion);
    // Keep only last 10 emotions
    if (history.length > 10) {
      history.shift();
    }
  }

  getLastEmotion(speakerId: string): EmotionMarkers | undefined {
    const history = this.emotionHistory.get(speakerId);
    return history?.[history.length - 1];
  }

  clearHistory(speakerId: string): void {
    this.emotionHistory.delete(speakerId);
  }
}

export const emotionDetector = new EmotionDetectorService();
```

#### 1.2 Update Types (shared/src/types.ts additions)

```typescript
// Add to existing WSMessageType
export type WSMessageType =
  | ... existing types ...
  | 'emotion:detected';  // Server → Client: emotion analysis result

// New payload type
export interface EmotionDetectedPayload {
  speakerId: string;
  speechId: string;
  emotion: EmotionMarkers;
  latencyMs: number;
}

// Update TranslationCompletePayload to include emotion
export interface TranslationCompletePayload {
  speakerId: string;
  speechId: string;
  originalText: string;
  originalLanguage: LanguageCode;
  translatedText: string;
  targetLanguage: LanguageCode;
  latencyMs: number;
  speakerName: string;
  emotion?: EmotionMarkers;  // NEW: detected emotion
}
```

---

### Phase 2: Pipeline Integration

#### 2.1 Update Translation Handler (server/src/websocket/handlers.ts)

Modify the translation completion flow to include emotion detection:

```typescript
import { emotionDetector } from '../emotion/emotionDetector';

// In handleSTTComplete or wherever translation is triggered:
async function handleTranslationWithEmotion(
  client: ExtendedWebSocket,
  sttResult: STTFinalPayload,
  room: Room,
  server: SignalingServer
): Promise<void> {
  const participant = room.participants.get(client.id);
  if (!participant) return;

  // Step 1: Translate (existing)
  const translationResult = await translationService.translate(
    sttResult.text,
    sttResult.language,
    targetLanguage,
    translationContext
  );

  // Step 2: Detect Emotion (NEW)
  const emotionContext: EmotionContext = {
    resolution: room.resolution,
    speechRole: room.currentSpeech!,
    speakerSide: participant.side,
    speakerName: participant.displayName,
    previousEmotion: emotionDetector.getLastEmotion(client.id),
  };

  const emotionResult = await emotionDetector.detectEmotion(
    sttResult.text,
    translationResult.translation,
    sttResult.language,
    targetLanguage,
    emotionContext
  );

  // Update emotion history
  emotionDetector.updateHistory(client.id, emotionResult.emotion);

  // Step 3: Broadcast translation with emotion
  server.broadcastToRoom(room.id, {
    type: 'translation:complete',
    payload: {
      speakerId: client.id,
      speechId: room.currentSpeech,
      originalText: sttResult.text,
      originalLanguage: sttResult.language,
      translatedText: translationResult.translation,
      targetLanguage,
      latencyMs: translationResult.latencyMs,
      speakerName: participant.displayName,
      emotion: emotionResult.emotion,  // Include emotion
    },
  });

  // Step 4: Generate TTS with emotion (existing flow, now with emotionHints)
  await generateTTSForListeners(
    room.id,
    client.id,
    translationResult.translation,
    targetLanguage,
    emotionResult.emotion,  // Pass emotion hints
    server
  );
}

// Update TTS generation to use emotion
async function generateTTSForListeners(
  roomId: string,
  speakerId: string,
  translatedText: string,
  targetLanguage: LanguageCode,
  emotionHints: EmotionMarkers,  // NEW parameter
  server: SignalingServer
): Promise<void> {
  const room = roomManager.getRoom(roomId);
  if (!room) return;

  // Find listeners (excluding current speaker)
  const listeners = Array.from(room.participants.values())
    .filter(p => p.id !== speakerId && p.listeningLanguage === targetLanguage);

  if (listeners.length === 0) return;

  const voiceId = ttsSessionManager.getVoiceForParticipant(speakerId)
    || elevenLabsTTS.getPresetVoices(targetLanguage)[0]?.voiceId;

  if (!voiceId) return;

  const speechId = room.currentSpeech || 'unknown';

  // Notify TTS start
  server.broadcastToRoom(roomId, {
    type: 'tts:start',
    payload: { speakerId, speechId, text: translatedText },
  }, speakerId);

  // Generate TTS with emotion hints
  await ttsSessionManager.queueTTS(
    speakerId,
    {
      text: translatedText,
      voiceId,
      targetLanguage,
      emotionHints,  // Pass emotion to TTS request
    },
    (chunk, index) => {
      server.broadcastToRoom(roomId, {
        type: 'tts:audio_chunk',
        payload: {
          speakerId,
          speechId,
          chunkIndex: index,
          audioData: chunk.toString('base64'),
          isFinal: false,
          timestamp: Date.now(),
        },
      }, speakerId);
    },
    () => {
      server.broadcastToRoom(roomId, {
        type: 'tts:end',
        payload: { speakerId, speechId },
      }, speakerId);
    }
  );
}
```

---

### Phase 3: Emotion UI Indicators (Optional)

#### 3.1 Update Transcript Panel (client/src/components/TranscriptPanel.tsx)

Add emotion indicator to utterance display:

```typescript
import { EmotionMarkers } from '@shared/types';

interface Utterance {
  id: string;
  speakerId: string;
  speakerName: string;
  speechId: SpeechRole;
  timestamp: number;
  original: {
    text: string;
    language: LanguageCode;
    isInterim: boolean;
  };
  translation?: {
    text: string;
    language: LanguageCode;
    latencyMs: number;
  };
  emotion?: EmotionMarkers;  // NEW
}

// Emotion indicator component
function EmotionIndicator({ emotion }: { emotion: EmotionMarkers }) {
  const emotionConfig = {
    confident: { emoji: '💪', color: 'text-blue-400', label: 'Confident' },
    passionate: { emoji: '🔥', color: 'text-orange-400', label: 'Passionate' },
    aggressive: { emoji: '⚔️', color: 'text-red-400', label: 'Aggressive' },
    measured: { emoji: '📐', color: 'text-green-400', label: 'Measured' },
    uncertain: { emoji: '🤔', color: 'text-yellow-400', label: 'Uncertain' },
    neutral: { emoji: '😐', color: 'text-gray-400', label: 'Neutral' },
  };

  const config = emotionConfig[emotion.dominantEmotion];

  return (
    <div className="emotion-indicator flex items-center gap-1 text-xs">
      <span>{config.emoji}</span>
      <span className={config.color}>{config.label}</span>
      <span className="text-gray-500">
        ({Math.round(emotion.intensity * 100)}%)
      </span>
    </div>
  );
}

// Update UtteranceDisplay to include emotion
function UtteranceDisplay({ utterance, showTranslation, isActive }: UtteranceDisplayProps) {
  return (
    <div className={`utterance ${isActive ? 'opacity-70' : ''}`}>
      <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
        <span className="font-medium">{utterance.speakerName}</span>
        <span>•</span>
        <span>{langFlag}</span>
        <span>•</span>
        <span>{utterance.speechId}</span>
        {utterance.emotion && (
          <>
            <span>•</span>
            <EmotionIndicator emotion={utterance.emotion} />
          </>
        )}
      </div>

      {/* ... rest of component */}
    </div>
  );
}
```

#### 3.2 Update Transcript Store (client/src/stores/transcriptStore.ts)

```typescript
// Update to store emotion with utterances
interface TranscriptState {
  utterances: Utterance[];
  addUtterance: (utterance: Partial<Utterance>) => void;
  updateUtteranceTranslation: (
    id: string,
    translation: Utterance['translation'],
    emotion?: EmotionMarkers
  ) => void;
}
```

---

### Phase 4: A/B Comparison Mode (Stretch Goal)

#### 4.1 Emotion Toggle Component (client/src/components/EmotionToggle.tsx)

```typescript
interface EmotionToggleProps {
  emotionEnabled: boolean;
  onToggle: (enabled: boolean) => void;
}

export function EmotionToggle({ emotionEnabled, onToggle }: EmotionToggleProps) {
  return (
    <div className="emotion-toggle bg-gray-800 rounded-lg p-3">
      <div className="flex items-center justify-between">
        <div>
          <label className="text-sm font-medium text-gray-300">
            Emotion Preservation
          </label>
          <p className="text-xs text-gray-500 mt-1">
            {emotionEnabled
              ? "Voice reflects speaker's emotional tone"
              : "Voice uses neutral delivery"
            }
          </p>
        </div>
        <button
          onClick={() => onToggle(!emotionEnabled)}
          className={`
            relative inline-flex h-6 w-11 items-center rounded-full transition-colors
            ${emotionEnabled ? 'bg-purple-600' : 'bg-gray-600'}
          `}
        >
          <span
            className={`
              inline-block h-4 w-4 transform rounded-full bg-white transition-transform
              ${emotionEnabled ? 'translate-x-6' : 'translate-x-1'}
            `}
          />
        </button>
      </div>
    </div>
  );
}
```

#### 4.2 Server-Side Toggle Support

```typescript
// Add to room settings
interface RoomSettings {
  // ... existing
  emotionPreservation: boolean;  // Default: true
}

// In handlers, check setting before emotion detection
if (room.settings.emotionPreservation) {
  const emotionResult = await emotionDetector.detectEmotion(...);
  // Use emotion
} else {
  // Use neutral emotion
  emotionHints = { dominantEmotion: 'neutral', intensity: 0.5, confidence: 1.0 };
}
```

---

## WebSocket Protocol Updates

### New Message Types

```typescript
// Server → Client
'emotion:detected'    { speakerId, speechId, emotion: EmotionMarkers, latencyMs }

// Client → Server (for A/B toggle)
'emotion:toggle'      { enabled: boolean }
```

### Updated Message Payloads

```typescript
// translation:complete now includes emotion
'translation:complete' {
  speakerId: string;
  speechId: string;
  originalText: string;
  originalLanguage: LanguageCode;
  translatedText: string;
  targetLanguage: LanguageCode;
  latencyMs: number;
  speakerName: string;
  emotion?: EmotionMarkers;  // NEW
}
```

---

## Latency Budget

| Stage | Target | Notes |
|-------|--------|-------|
| STT (from M2) | ~500ms | 5-second buffer |
| Translation (from M2) | ~300ms | Gemini Flash |
| **Emotion Detection** | **~100-150ms** | **NEW: Gemini Flash, short prompt** |
| TTS (from M3) | ~75ms | ElevenLabs Flash |
| Network | ~50ms | WebSocket |
| **Total** | **~1.0-1.1s** | Within acceptable range |

**Optimization Notes:**
- Emotion detection runs in parallel with translation (not sequential)
- Short, focused prompt minimizes token processing
- JSON response format reduces parsing overhead
- Caching could reduce latency for repeated patterns (future optimization)

---

## Implementation Order

### Phase 1: Emotion Detection Service ✅
- [x] Create `emotionDetector.ts` service
- [x] Add emotion detection prompt
- [x] Implement emotion continuity (history tracking)
- [ ] Add unit tests for emotion parsing (future)

### Phase 2: Pipeline Integration ✅
- [x] Update `handlers.ts` to call emotion detection
- [x] Pass emotionHints to TTS generation
- [x] Update translation payload to include emotion
- [x] Test end-to-end emotion flow

### Phase 3: UI Indicators ✅
- [x] Create EmotionIndicator in TranscriptPanel
- [x] Update TranscriptPanel to show emotion
- [x] Update transcript store for emotion data
- [x] Style emotion indicators with emoji + color

### Phase 4: A/B Comparison ⬜ (Stretch Goal)
- [ ] Create EmotionToggle component
- [ ] Add emotion toggle to room settings
- [ ] Update server to respect toggle
- [ ] Add comparison UI for demo

### Phase 5: Polish ⬜
- [ ] Tune emotion detection prompts based on testing
- [ ] Adjust emotion-to-settings mapping if needed
- [ ] Test with various debate scenarios
- [ ] Performance optimization

---

## Testing Strategy

### Unit Tests
- [ ] Emotion detection prompt produces valid JSON
- [ ] Invalid emotions fall back to 'neutral'
- [ ] Continuity smoothing works correctly
- [ ] History tracking limits work

### Integration Tests
- [ ] Translation → Emotion → TTS pipeline
- [ ] Emotion broadcast to all clients
- [ ] TTS settings change based on emotion

### Manual Testing Checklist
- [ ] Passionate speech produces faster, more dynamic TTS
- [ ] Measured arguments produce slower, stable TTS
- [ ] Aggressive rebuttals sound appropriately forceful
- [ ] Emotion indicators show in transcript panel
- [ ] A/B toggle disables emotion (uses neutral)
- [ ] Emotion continuity prevents jarring voice changes
- [ ] Latency stays under 1.5s total

### Demo Scenarios
1. **Passionate Value Debate**: Test with strongly worded value claims
2. **Aggressive Rebuttal**: Test with direct attacks on opponent arguments
3. **Measured Framework**: Test with calm definitional work
4. **Mixed Emotions**: Test speech with varying emotional intensity

---

## Risk Mitigation

| Risk | Mitigation | Status |
|------|------------|--------|
| Emotion detection latency | Run parallel with translation, not sequential | Planned |
| Incorrect emotion detection | Use continuity to smooth transitions; fallback to previous | Planned |
| Jarring voice changes | Apply smoothing (max 0.3 intensity change per utterance) | Planned |
| API rate limits | Emotion detection adds ~1 call per utterance; within limits | Acceptable |
| TTS quality with extreme settings | Keep stability in 0.40-0.70 range; speed in 0.90-1.10 | Planned |
| Emotion not matching content | Low confidence triggers fallback to previous emotion | Planned |

---

## Success Criteria

Milestone 4 is complete when:

1. ✅ Emotion is detected from transcript text using Gemini
2. ✅ Detected emotion maps to TTS voice settings
3. ✅ TTS delivery changes based on emotional tone
4. ✅ Passionate speech sounds more dynamic/faster
5. ✅ Measured speech sounds more stable/slower
6. ✅ Aggressive rebuttals sound forceful
7. ✅ Emotion continuity prevents jarring voice changes
8. ⬜ Total latency stays under 1.5s (needs real-world testing)
9. ✅ UI shows detected emotion (optional but nice-to-have)
10. ⬜ A/B toggle allows comparison (stretch goal)

---

## Files to Create/Modify

### New Files
| File | Purpose |
|------|---------|
| `server/src/emotion/emotionDetector.ts` | Core emotion detection service |
| `client/src/components/EmotionIndicator.tsx` | Emotion badge component (optional) |
| `client/src/components/EmotionToggle.tsx` | A/B toggle component (stretch) |

### Modified Files
| File | Changes |
|------|---------|
| `server/src/index.ts` | Initialize emotion detector on startup |
| `server/src/websocket/handlers.ts` | Call emotion detection, pass to TTS |
| `shared/src/types.ts` | Add emotion payload types, update translation payload |
| `client/src/hooks/useWebSocket.ts` | Handle emotion in translation callback |
| `client/src/stores/transcriptStore.ts` | Store emotion with utterances |
| `client/src/components/TranscriptPanel.tsx` | Display emotion indicators |
| `client/src/pages/Room.tsx` | Wire emotion toggle (stretch) |

---

## References

### ElevenLabs Documentation
- [Conversational Voice Design Best Practices](https://elevenlabs.io/docs/agents-platform/customization/voice/best-practices/conversational-voice-design)
- [Voice Settings Reference](https://elevenlabs.io/docs/api-reference/text-to-speech)

### Gemini Documentation
- [Gemini API Reference](https://ai.google.dev/gemini-api/docs)
- [JSON Response Mode](https://ai.google.dev/gemini-api/docs/json-mode)

### Emotion in Speech
- [Prosodic Features of Emotion](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4141622/)
- [Debate Rhetoric and Persuasion](https://www.speechanddebate.org/lincoln-douglas-debate/)
