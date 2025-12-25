# Milestone 2 — Real-Time Translation + Flow Sheet Implementation Plan

## Status: IN PROGRESS 🔄

**Current Phase:** Phases 1-4 Complete ✅ → Phase 5 (Argument Extraction) or Phase 6 (Flow Sheet UI) next

**Last Updated:** 2024-12-24 - Phases 1-4 complete: Audio, STT, Translation, Dual Transcripts

## Overview

This document details the implementation strategy for Milestone 2 of the Cross-Language Lincoln-Douglas Debate Platform. We're building the core translation pipeline: speech-to-text, Gemini translation, dual transcripts, argument extraction, and the debate flow sheet.

**The Goal:** When a debater speaks in Korean, their opponent sees a real-time dual transcript (original + English translation) and a structured flow sheet tracking all arguments.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              BROWSER (Speaker)                                   │
│  ┌─────────────────┐                                                            │
│  │  MediaRecorder  │──────────┐                                                 │
│  │   (audio/webm)  │          │                                                 │
│  └─────────────────┘          │                                                 │
│                               ▼                                                 │
│                    ┌─────────────────────┐                                      │
│                    │  AudioWorklet       │                                      │
│                    │  (PCM conversion)   │                                      │
│                    └──────────┬──────────┘                                      │
│                               │ audio chunks (base64 LINEAR16)                  │
│                               ▼                                                 │
│                    ┌─────────────────────┐                                      │
│                    │  WebSocket          │                                      │
│                    │  (audio:chunk)      │                                      │
│                    └──────────┬──────────┘                                      │
└───────────────────────────────┼─────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              SERVER (Node.js)                                    │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                        Audio Processing Pipeline                         │    │
│  │                                                                          │    │
│  │   ┌──────────────┐     ┌──────────────┐     ┌──────────────────────┐   │    │
│  │   │  Receive     │────▶│  Google STT  │────▶│  Gemini Translation  │   │    │
│  │   │  Audio Chunk │     │  (streaming) │     │  (context-aware)     │   │    │
│  │   └──────────────┘     └──────┬───────┘     └──────────┬───────────┘   │    │
│  │                               │                        │               │    │
│  │                               │ interim/final          │ translated    │    │
│  │                               │ transcripts            │ text          │    │
│  │                               ▼                        ▼               │    │
│  │                    ┌────────────────────────────────────────┐          │    │
│  │                    │         Argument Extractor (CWI)       │          │    │
│  │                    │         (Gemini - batch on final)      │          │    │
│  │                    └────────────────────┬───────────────────┘          │    │
│  │                                         │                              │    │
│  │                                         ▼                              │    │
│  │                    ┌────────────────────────────────────────┐          │    │
│  │                    │           Flow State Manager           │          │    │
│  │                    │    (tracks arguments, responses)       │          │    │
│  │                    └────────────────────┬───────────────────┘          │    │
│  │                                         │                              │    │
│  └─────────────────────────────────────────┼────────────────────────────────┘    │
│                                            │                                     │
│                    ┌───────────────────────┴───────────────────────┐            │
│                    │                 WebSocket Broadcast            │            │
│                    │  - stt:interim (partial transcript)           │            │
│                    │  - stt:final (complete sentence)              │            │
│                    │  - translation:complete                       │            │
│                    │  - flow:argument (new/updated argument)       │            │
│                    │  - flow:state (full flow update)              │            │
│                    └───────────────────────┬───────────────────────┘            │
└─────────────────────────────────────────────┼───────────────────────────────────┘
                                              │
                                              ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              BROWSER (Both Debaters)                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                           Transcript Display                             │    │
│  │  ┌─────────────────────────────────────────────────────────────────┐   │    │
│  │  │  Original: "기본적 인권으로서 생존권이..."                         │   │    │
│  │  │  Translation: "As a basic human right, the right to..."         │   │    │
│  │  │  ▊ (typing indicator for interim text)                          │   │    │
│  │  └─────────────────────────────────────────────────────────────────┘   │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                             Flow Sheet                                   │    │
│  │  ┌──────────┬──────────┬──────────┬──────────┬──────────┐              │    │
│  │  │   AC     │   NC     │   1AR    │   NR     │   2AR    │              │    │
│  │  ├──────────┼──────────┼──────────┼──────────┼──────────┤              │    │
│  │  │ V: Justice│         │          │          │          │              │    │
│  │  │ C1: ...  │ Turn: ...│ Extend   │ ...      │ ...      │              │    │
│  │  └──────────┴──────────┴──────────┴──────────┴──────────┘              │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Technology Decisions

### Gemini 2.0 Flash for Speech-to-Text

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| API | **Gemini 2.0 Flash** | Single API key for both STT and translation; simpler setup |
| Audio Format | **WAV (16-bit PCM with header)** | Gemini requires proper audio format, not raw PCM |
| Sample Rate | **16000 Hz** | Standard for speech recognition |
| Buffering | **5 seconds** | Balance between latency and API call frequency |
| Languages | **en, ko, ja, es, zh** | Multimodal model supports all target languages |

**Why Gemini instead of Google Cloud STT:**
- Single API key (no GCP project, service accounts, or JSON credentials)
- Simpler setup for hackathon judges
- Good transcription quality for debate use case
- Same model handles both STT and translation

**Trade-offs:**
- Batch transcription (5-second chunks) vs true streaming (word-by-word)
- Free tier has strict rate limits; billing recommended for production
- No interim results (only final transcripts)

### Gemini API for Translation

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| Model | **Gemini 2.0 Flash** | Fast inference (~300ms), good quality, cost-effective |
| API | **generateContentStream** | Streaming response for progressive translation display |
| Context Window | Full debate context | Include resolution, current speech, prior arguments |

**Why Gemini over Google Translate API:**
- Context-aware translation (understands debate structure)
- Can preserve debate terminology ("impact", "turn", "link")
- Handles rhetorical devices and idiomatic expressions
- Single API for both translation and argument extraction

### Audio Pipeline

| Component | Technology | Notes |
|-----------|------------|-------|
| Browser Capture | **MediaRecorder + AudioWorklet** | Web Audio API for precise PCM extraction |
| Audio Format | **LINEAR16 PCM, 16-bit, mono** | Google STT optimal format |
| Transport | **WebSocket binary frames** | Lower overhead than base64 |
| Buffering | **100ms chunks** | Balance between latency and overhead |

---

## Detailed Implementation Tasks

### Phase 1: Audio Capture Pipeline

#### 1.1 Browser Audio Worklet (client/src/lib/audioProcessor.ts)

```typescript
// AudioWorkletProcessor for real-time PCM extraction
class PCMAudioProcessor extends AudioWorkletProcessor {
  private buffer: Float32Array[] = [];
  private bufferSize = 1600; // 100ms at 16kHz

  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean {
    const input = inputs[0];
    if (input.length > 0) {
      // Downsample from 48kHz to 16kHz
      const downsampled = this.downsample(input[0], sampleRate, 16000);
      
      // Convert to 16-bit PCM
      const pcm = this.floatTo16BitPCM(downsampled);
      
      // Buffer and send when ready
      this.accumulateAndSend(pcm);
    }
    return true;
  }

  private floatTo16BitPCM(float32: Float32Array): Int16Array {
    const pcm = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      pcm[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return pcm;
  }
}
```

#### 1.2 Audio Stream Hook (client/src/hooks/useAudioStream.ts)

```typescript
interface UseAudioStreamOptions {
  onAudioChunk: (chunk: ArrayBuffer) => void;
  enabled: boolean;
}

export function useAudioStream(options: UseAudioStreamOptions) {
  // Initialize AudioContext and Worklet
  // Connect to MediaStream
  // Send PCM chunks via callback
}
```

#### 1.3 WebSocket Audio Messages

New message types to add to `shared/src/types.ts`:

```typescript
// Audio streaming messages
export type WSMessageType =
  | ... existing types ...
  | 'audio:chunk'           // Client → Server: audio data
  | 'audio:start'           // Client → Server: begin streaming
  | 'audio:stop'            // Client → Server: end streaming
  | 'stt:interim'           // Server → Client: partial transcript
  | 'stt:final'             // Server → Client: finalized transcript
  | 'translation:interim'   // Server → Client: partial translation
  | 'translation:complete'  // Server → Client: complete translation
  | 'flow:argument'         // Server → Client: extracted argument
  | 'flow:state';           // Server → Client: full flow state

export interface AudioChunkPayload {
  audioData: string;        // Base64 encoded PCM
  timestamp: number;
  speechId: string;         // Which speech this belongs to
}

export interface STTResultPayload {
  speakerId: string;
  speechId: string;
  text: string;
  language: LanguageCode;
  isFinal: boolean;
  confidence: number;
  wordTimestamps?: Array<{
    word: string;
    startTime: number;
    endTime: number;
  }>;
}

export interface TranslationPayload {
  speakerId: string;
  speechId: string;
  originalText: string;
  originalLanguage: LanguageCode;
  translatedText: string;
  targetLanguage: LanguageCode;
  latencyMs: number;
}
```

---

### Phase 2: Google Cloud STT Integration

#### 2.1 STT Service (server/src/stt/googleStt.ts)

```typescript
import { SpeechClient, protos } from '@google-cloud/speech';

interface StreamingSession {
  stream: ReturnType<SpeechClient['streamingRecognize']>;
  speechId: string;
  language: LanguageCode;
  onInterim: (text: string, isFinal: boolean) => void;
  onError: (error: Error) => void;
}

class GoogleSTTService {
  private client: SpeechClient;
  private sessions: Map<string, StreamingSession> = new Map();

  constructor() {
    this.client = new SpeechClient();
  }

  startSession(
    sessionId: string,
    speechId: string,
    language: LanguageCode,
    onInterim: (text: string, isFinal: boolean) => void,
    onError: (error: Error) => void
  ): void {
    const config: protos.google.cloud.speech.v2.IStreamingRecognitionConfig = {
      config: {
        // Use V2 API with Chirp model
        autoDecodingConfig: {},
        languageCodes: [this.getLanguageCode(language)],
        model: 'chirp_2',
        features: {
          enableAutomaticPunctuation: true,
          enableWordTimeOffsets: true,
        },
      },
      streamingFeatures: {
        interimResults: true,
      },
    };

    const stream = this.client.streamingRecognize({
      recognizer: `projects/${process.env.GCP_PROJECT_ID}/locations/global/recognizers/_`,
      streamingConfig: config,
    });

    stream.on('data', (response) => {
      const result = response.results?.[0];
      if (result?.alternatives?.[0]) {
        onInterim(
          result.alternatives[0].transcript || '',
          result.isFinal || false
        );
      }
    });

    stream.on('error', onError);

    this.sessions.set(sessionId, {
      stream,
      speechId,
      language,
      onInterim,
      onError,
    });
  }

  sendAudio(sessionId: string, audioData: Buffer): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.stream.write({
        audio: audioData,
      });
    }
  }

  endSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.stream.end();
      this.sessions.delete(sessionId);
    }
  }

  private getLanguageCode(lang: LanguageCode): string {
    const mapping: Record<LanguageCode, string> = {
      en: 'en-US',
      ko: 'ko-KR',
      ja: 'ja-JP',
      es: 'es-ES',
      zh: 'zh-CN',
    };
    return mapping[lang];
  }
}

export const sttService = new GoogleSTTService();
```

#### 2.2 STT Handler Integration (server/src/websocket/handlers.ts)

Add handlers for audio streaming:

```typescript
case 'audio:start':
  handleAudioStart(client, message.payload, server);
  break;

case 'audio:chunk':
  handleAudioChunk(client, message.payload, server);
  break;

case 'audio:stop':
  handleAudioStop(client, server);
  break;
```

---

### Phase 3: Gemini Translation Service

#### 3.1 Translation Service (server/src/translation/geminiTranslation.ts)

```typescript
import { GoogleGenerativeAI } from '@google/generative-ai';

interface TranslationContext {
  resolution: string;
  currentSpeech: SpeechRole;
  speakerSide: Side;
  priorArguments: Argument[];
}

class GeminiTranslationService {
  private genAI: GoogleGenerativeAI;
  private model: ReturnType<GoogleGenerativeAI['getGenerativeModel']>;

  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    this.model = this.genAI.getGenerativeModel({ 
      model: 'gemini-2.0-flash',
      generationConfig: {
        temperature: 0.3,  // Lower for consistent translations
        maxOutputTokens: 1024,
      }
    });
  }

  async translate(
    text: string,
    sourceLanguage: LanguageCode,
    targetLanguage: LanguageCode,
    context: TranslationContext
  ): Promise<{ translation: string; latencyMs: number }> {
    const startTime = Date.now();

    const prompt = this.buildTranslationPrompt(
      text, 
      sourceLanguage, 
      targetLanguage, 
      context
    );

    const result = await this.model.generateContent(prompt);
    const translation = result.response.text();

    return {
      translation: this.cleanTranslation(translation),
      latencyMs: Date.now() - startTime,
    };
  }

  async translateStream(
    text: string,
    sourceLanguage: LanguageCode,
    targetLanguage: LanguageCode,
    context: TranslationContext,
    onChunk: (chunk: string) => void
  ): Promise<{ latencyMs: number }> {
    const startTime = Date.now();

    const prompt = this.buildTranslationPrompt(
      text, 
      sourceLanguage, 
      targetLanguage, 
      context
    );

    const result = await this.model.generateContentStream(prompt);
    
    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      if (chunkText) {
        onChunk(chunkText);
      }
    }

    return { latencyMs: Date.now() - startTime };
  }

  private buildTranslationPrompt(
    text: string,
    sourceLanguage: LanguageCode,
    targetLanguage: LanguageCode,
    context: TranslationContext
  ): string {
    return `You are a real-time debate translator. Translate the following speech segment from ${this.getLanguageName(sourceLanguage)} to ${this.getLanguageName(targetLanguage)}.

CONTEXT:
- Debate Resolution: "${context.resolution}"
- Current Speech: ${context.currentSpeech} (${context.speakerSide} side)
- Prior arguments in this debate: ${context.priorArguments.map(a => a.title).join(', ') || 'None yet'}

REQUIREMENTS:
- Preserve rhetorical force and argumentation structure
- Maintain debate terminology (e.g., "impact", "turn", "link", "warrant", "contention")
- Keep emotional intensity markers (emphatic phrases, rhetorical questions)
- Translate idioms to culturally equivalent expressions
- Be concise — this is real-time, latency matters
- Output ONLY the translation, no explanations or notes

TEXT TO TRANSLATE:
${text}

TRANSLATION:`;
  }

  private getLanguageName(code: LanguageCode): string {
    const names: Record<LanguageCode, string> = {
      en: 'English',
      ko: 'Korean',
      ja: 'Japanese',
      es: 'Spanish',
      zh: 'Chinese (Mandarin)',
    };
    return names[code];
  }

  private cleanTranslation(text: string): string {
    // Remove any prefix like "TRANSLATION:" that might leak through
    return text.replace(/^(TRANSLATION:|Translation:)\s*/i, '').trim();
  }
}

export const translationService = new GeminiTranslationService();
```

---

### Phase 4: Argument Extraction (CWI)

#### 4.1 Argument Types (shared/src/types.ts)

```typescript
// Claim-Warrant-Impact structure
export interface Argument {
  id: string;
  speechId: string;
  speech: SpeechRole;
  side: Side;
  
  // Argument content (stored in English for consistency)
  title: string;          // Short label (e.g., "Contention 1: Dignity")
  claim: string;          // The assertion being made
  warrant: string;        // Evidence/reasoning supporting the claim
  impact: string;         // Why this matters / consequence
  
  // Debate tracking
  type: 'value' | 'criterion' | 'contention' | 'response' | 'rebuttal' | 'extension';
  status: 'introduced' | 'extended' | 'answered' | 'dropped' | 'turned';
  respondedToBy: string[];  // IDs of arguments responding to this
  respondsTo: string[];     // IDs of arguments this responds to
  
  // Localized versions for display
  localizedVersions: Record<LanguageCode, {
    title: string;
    claim: string;
    warrant: string;
    impact: string;
  }>;
  
  createdAt: number;
  updatedAt: number;
}

export interface FlowState {
  roomId: string;
  arguments: Argument[];
  
  // Organized by column (speech)
  columns: {
    AC: string[];   // argument IDs
    NC: string[];
    '1AR': string[];
    NR: string[];
    '2AR': string[];
  };
}
```

#### 4.2 Argument Extractor Service (server/src/flow/argumentExtractor.ts)

```typescript
import { GoogleGenerativeAI } from '@google/generative-ai';

interface ExtractionContext {
  resolution: string;
  speech: SpeechRole;
  side: Side;
  priorArguments: Argument[];
  fullSpeechTranscript: string;
}

class ArgumentExtractorService {
  private genAI: GoogleGenerativeAI;
  private model: ReturnType<GoogleGenerativeAI['getGenerativeModel']>;

  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    this.model = this.genAI.getGenerativeModel({ 
      model: 'gemini-2.0-flash',
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
      }
    });
  }

  async extractArguments(context: ExtractionContext): Promise<Argument[]> {
    const prompt = this.buildExtractionPrompt(context);
    
    const result = await this.model.generateContent(prompt);
    const jsonText = result.response.text();
    
    try {
      const extracted = JSON.parse(jsonText);
      return this.processExtracted(extracted, context);
    } catch (e) {
      console.error('Failed to parse argument extraction:', e);
      return [];
    }
  }

  private buildExtractionPrompt(context: ExtractionContext): string {
    return `You are analyzing a ${context.speech} speech in a Lincoln-Douglas debate.

RESOLUTION: "${context.resolution}"
SIDE: ${context.side}
PRIOR ARGUMENTS IN THIS DEBATE:
${context.priorArguments.map(a => `- [${a.id}] ${a.title}: ${a.claim}`).join('\n') || 'None yet'}

SPEECH TRANSCRIPT:
${context.fullSpeechTranscript}

TASK: Extract all distinct arguments from this speech. For each argument, identify:
1. Type: Is this a value, criterion, contention, response to opponent, rebuttal, or extension of a prior argument?
2. Structure: What is the claim, warrant, and impact?
3. Relationships: Does this respond to any prior arguments? (reference by ID)

Return a JSON array of arguments:
[
  {
    "title": "Short descriptive label",
    "type": "value|criterion|contention|response|rebuttal|extension",
    "claim": "The main assertion",
    "warrant": "The evidence or reasoning",
    "impact": "Why this matters",
    "respondsTo": ["id1", "id2"],  // IDs of prior arguments this addresses, or empty
    "updates": ["id3"]  // IDs of own prior arguments this extends, or empty
  }
]

Only return the JSON array, no other text.`;
  }

  private processExtracted(
    extracted: any[], 
    context: ExtractionContext
  ): Argument[] {
    return extracted.map((raw, index) => ({
      id: `${context.speech}-${index}-${Date.now()}`,
      speechId: context.speech,
      speech: context.speech,
      side: context.side,
      title: raw.title,
      claim: raw.claim,
      warrant: raw.warrant,
      impact: raw.impact,
      type: raw.type,
      status: raw.respondsTo?.length ? 'answered' : 'introduced',
      respondedToBy: [],
      respondsTo: raw.respondsTo || [],
      localizedVersions: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }));
  }
}

export const argumentExtractor = new ArgumentExtractorService();
```

---

### Phase 5: Flow Sheet UI

#### 5.1 Flow Sheet Component (client/src/components/FlowSheet.tsx)

```typescript
import { Argument, FlowState, SpeechRole } from '@shared/types';

interface FlowSheetProps {
  flowState: FlowState;
  currentSpeech: SpeechRole | null;
  userLanguage: LanguageCode;
}

const COLUMN_LABELS: Record<SpeechRole, { short: string; full: string; side: Side }> = {
  AC: { short: 'AC', full: 'Affirmative Constructive', side: 'AFF' },
  NC: { short: 'NC', full: 'Negative Constructive', side: 'NEG' },
  '1AR': { short: '1AR', full: '1st Aff Rebuttal', side: 'AFF' },
  NR: { short: 'NR', full: 'Negative Rebuttal', side: 'NEG' },
  '2AR': { short: '2AR', full: '2nd Aff Rebuttal', side: 'AFF' },
};

export function FlowSheet({ flowState, currentSpeech, userLanguage }: FlowSheetProps) {
  const getArgumentDisplay = (arg: Argument) => {
    // Use localized version if available, otherwise use English
    const localized = arg.localizedVersions[userLanguage];
    return localized || { title: arg.title, claim: arg.claim, warrant: arg.warrant, impact: arg.impact };
  };

  return (
    <div className="flow-sheet grid grid-cols-5 gap-2 h-full">
      {(['AC', 'NC', '1AR', 'NR', '2AR'] as SpeechRole[]).map((speech) => (
        <FlowColumn
          key={speech}
          speech={speech}
          label={COLUMN_LABELS[speech]}
          arguments={flowState.columns[speech].map(
            id => flowState.arguments.find(a => a.id === id)!
          ).filter(Boolean)}
          isActive={currentSpeech === speech}
          getDisplay={getArgumentDisplay}
        />
      ))}
    </div>
  );
}

interface FlowColumnProps {
  speech: SpeechRole;
  label: { short: string; full: string; side: Side };
  arguments: Argument[];
  isActive: boolean;
  getDisplay: (arg: Argument) => { title: string; claim: string; warrant: string; impact: string };
}

function FlowColumn({ speech, label, arguments: args, isActive, getDisplay }: FlowColumnProps) {
  return (
    <div className={`
      flow-column rounded-lg p-2
      ${isActive ? 'ring-2 ring-yellow-400 bg-gray-800' : 'bg-gray-900'}
      ${label.side === 'AFF' ? 'border-t-2 border-t-blue-500' : 'border-t-2 border-t-red-500'}
    `}>
      <div className="text-center mb-2">
        <div className="font-bold text-sm">{label.short}</div>
        <div className="text-xs text-gray-500">{label.full}</div>
      </div>
      
      <div className="space-y-2 overflow-y-auto max-h-64">
        {args.map((arg) => {
          const display = getDisplay(arg);
          return (
            <ArgumentCard
              key={arg.id}
              argument={arg}
              display={display}
            />
          );
        })}
      </div>
    </div>
  );
}

interface ArgumentCardProps {
  argument: Argument;
  display: { title: string; claim: string; warrant: string; impact: string };
}

function ArgumentCard({ argument, display }: ArgumentCardProps) {
  const statusColors = {
    introduced: 'border-l-green-500',
    extended: 'border-l-blue-500',
    answered: 'border-l-yellow-500',
    dropped: 'border-l-gray-500',
    turned: 'border-l-red-500',
  };

  return (
    <div className={`
      argument-card bg-gray-800 rounded p-2 text-xs
      border-l-2 ${statusColors[argument.status]}
    `}>
      <div className="font-medium text-white mb-1">{display.title}</div>
      <div className="text-gray-400 space-y-1">
        <p><span className="text-blue-400">C:</span> {display.claim}</p>
        {display.warrant && (
          <p><span className="text-green-400">W:</span> {display.warrant}</p>
        )}
        {display.impact && (
          <p><span className="text-red-400">I:</span> {display.impact}</p>
        )}
      </div>
      {argument.respondsTo.length > 0 && (
        <div className="mt-1 text-gray-500 italic">
          ↪ responds to prior arg
        </div>
      )}
    </div>
  );
}
```

---

### Phase 6: Dual Transcript Display

#### 6.1 Transcript Component (client/src/components/TranscriptPanel.tsx)

```typescript
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
}

interface TranscriptPanelProps {
  utterances: Utterance[];
  currentSpeakerId: string | null;
  myLanguage: LanguageCode;
  opponentLanguage: LanguageCode;
}

export function TranscriptPanel({ 
  utterances, 
  currentSpeakerId, 
  myLanguage, 
  opponentLanguage 
}: TranscriptPanelProps) {
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to latest
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [utterances]);

  return (
    <div className="transcript-panel bg-gray-900 rounded-lg p-4 h-64 overflow-y-auto">
      <div className="space-y-3">
        {utterances.map((utterance) => (
          <UtteranceDisplay
            key={utterance.id}
            utterance={utterance}
            showTranslation={utterance.original.language !== myLanguage}
            isActive={utterance.original.isInterim}
          />
        ))}
        <div ref={transcriptEndRef} />
      </div>
      
      {currentSpeakerId && (
        <div className="mt-2 flex items-center gap-2 text-gray-500">
          <span className="inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span className="text-sm">Speaking...</span>
        </div>
      )}
    </div>
  );
}

interface UtteranceDisplayProps {
  utterance: Utterance;
  showTranslation: boolean;
  isActive: boolean;
}

function UtteranceDisplay({ utterance, showTranslation, isActive }: UtteranceDisplayProps) {
  const langFlag = LANGUAGES.find(l => l.code === utterance.original.language)?.flag;
  
  return (
    <div className={`utterance ${isActive ? 'opacity-70' : ''}`}>
      <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
        <span className="font-medium">{utterance.speakerName}</span>
        <span>•</span>
        <span>{langFlag}</span>
        <span>•</span>
        <span>{utterance.speechId}</span>
      </div>
      
      {/* Original text */}
      <div className="original-text text-gray-300">
        {utterance.original.text}
        {isActive && <span className="animate-pulse">▊</span>}
      </div>
      
      {/* Translation (if different language) */}
      {showTranslation && utterance.translation && (
        <div className="translation-text text-blue-300 mt-1 pl-3 border-l-2 border-blue-500">
          {utterance.translation.text}
          <span className="text-xs text-gray-500 ml-2">
            ({utterance.translation.latencyMs}ms)
          </span>
        </div>
      )}
    </div>
  );
}
```

---

### Phase 7: Ballot Generation

#### 7.1 Ballot Types (shared/src/types.ts)

```typescript
export interface Ballot {
  roomId: string;
  resolution: string;
  generatedAt: number;
  
  // Decision
  winner: Side;
  winnerName: string;
  loserName: string;
  
  // Reason for Decision
  rfdSummary: string;
  rfdDetails: string;
  
  // Speaker Points (scale: 25-30)
  speakerPoints: {
    AFF: number;
    NEG: number;
  };
  
  // Detailed Analysis
  keyVotingIssues: Array<{
    issue: string;
    analysis: string;
    favoredSide: Side;
  }>;
  
  // Localized versions
  localizedRFD: Record<LanguageCode, string>;
}
```

#### 7.2 Ballot Generator (server/src/flow/ballotGenerator.ts)

```typescript
class BallotGeneratorService {
  private genAI: GoogleGenerativeAI;
  private model: ReturnType<GoogleGenerativeAI['getGenerativeModel']>;

  async generateBallot(
    flowState: FlowState,
    transcripts: Utterance[],
    participants: Participant[],
    resolution: string
  ): Promise<Ballot> {
    const prompt = this.buildBallotPrompt(flowState, transcripts, participants, resolution);
    
    const result = await this.model.generateContent(prompt);
    const ballotData = JSON.parse(result.response.text());
    
    return this.formatBallot(ballotData, flowState, participants, resolution);
  }

  private buildBallotPrompt(
    flowState: FlowState,
    transcripts: Utterance[],
    participants: Participant[],
    resolution: string
  ): string {
    const affParticipant = participants.find(p => p.side === 'AFF');
    const negParticipant = participants.find(p => p.side === 'NEG');

    return `You are an experienced Lincoln-Douglas debate judge. Evaluate this debate and provide a ballot.

RESOLUTION: "${resolution}"

AFFIRMATIVE: ${affParticipant?.displayName}
NEGATIVE: ${negParticipant?.displayName}

FLOW (Arguments by Speech):
${this.formatFlowForPrompt(flowState)}

TASK: Evaluate the debate and return a JSON object with:
{
  "winner": "AFF" or "NEG",
  "rfdSummary": "One sentence summary of why this side won",
  "rfdDetails": "2-3 paragraph detailed reason for decision",
  "speakerPoints": {
    "AFF": number between 25-30,
    "NEG": number between 25-30
  },
  "keyVotingIssues": [
    {
      "issue": "Name of the key clash point",
      "analysis": "How each side handled it and who won",
      "favoredSide": "AFF" or "NEG"
    }
  ]
}

Evaluate based on:
1. Clash: Did arguments engage with each other?
2. Warrant analysis: Whose reasoning was stronger?
3. Impact comparison: Whose impacts were more significant?
4. Extensions: Did debaters extend their arguments effectively?
5. Drops: Were important arguments left unanswered?

Only return the JSON, no other text.`;
  }
}

export const ballotGenerator = new BallotGeneratorService();
```

---

### Phase 8: Latency Measurement

#### 8.1 Latency Tracker (server/src/metrics/latencyTracker.ts)

```typescript
interface LatencyMetric {
  component: 'stt' | 'translation' | 'total';
  durationMs: number;
  timestamp: number;
}

class LatencyTracker {
  private metrics: Map<string, LatencyMetric[]> = new Map();

  recordSTTLatency(roomId: string, durationMs: number): void {
    this.record(roomId, { component: 'stt', durationMs, timestamp: Date.now() });
  }

  recordTranslationLatency(roomId: string, durationMs: number): void {
    this.record(roomId, { component: 'translation', durationMs, timestamp: Date.now() });
  }

  private record(roomId: string, metric: LatencyMetric): void {
    if (!this.metrics.has(roomId)) {
      this.metrics.set(roomId, []);
    }
    this.metrics.get(roomId)!.push(metric);
    
    // Keep only last 100 metrics
    const metrics = this.metrics.get(roomId)!;
    if (metrics.length > 100) {
      metrics.shift();
    }
  }

  getAverages(roomId: string): { stt: number; translation: number } {
    const metrics = this.metrics.get(roomId) || [];
    
    const sttMetrics = metrics.filter(m => m.component === 'stt');
    const translationMetrics = metrics.filter(m => m.component === 'translation');
    
    return {
      stt: sttMetrics.length > 0 
        ? sttMetrics.reduce((sum, m) => sum + m.durationMs, 0) / sttMetrics.length 
        : 0,
      translation: translationMetrics.length > 0
        ? translationMetrics.reduce((sum, m) => sum + m.durationMs, 0) / translationMetrics.length
        : 0,
    };
  }
}

export const latencyTracker = new LatencyTracker();
```

#### 8.2 Latency Display Component

```typescript
interface LatencyDisplayProps {
  sttLatency: number;
  translationLatency: number;
}

export function LatencyDisplay({ sttLatency, translationLatency }: LatencyDisplayProps) {
  const total = sttLatency + translationLatency;
  const getColor = (ms: number) => {
    if (ms < 500) return 'text-green-400';
    if (ms < 1000) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <div className="latency-display flex items-center gap-4 text-xs text-gray-500">
      <div>
        STT: <span className={getColor(sttLatency)}>{Math.round(sttLatency)}ms</span>
      </div>
      <div>
        Translation: <span className={getColor(translationLatency)}>{Math.round(translationLatency)}ms</span>
      </div>
      <div>
        Total: <span className={getColor(total)}>{Math.round(total)}ms</span>
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
'audio:start'     { speechId: string, language: LanguageCode }
'audio:chunk'     { audioData: string (base64), timestamp: number }
'audio:stop'      { speechId: string }

// Server → Client
'stt:interim'     { speakerId, text, language, speechId }
'stt:final'       { speakerId, text, language, speechId, confidence, wordTimestamps }
'translation:interim'  { speakerId, originalText, translatedText, targetLanguage }
'translation:complete' { speakerId, originalText, translatedText, targetLanguage, latencyMs }
'flow:argument'   { argument: Argument }
'flow:state'      { flowState: FlowState }
'ballot:ready'    { ballot: Ballot }
'latency:update'  { stt: number, translation: number }
```

### Message Flow Example

```
Speaker (Korean)                Server                    Listener (English)
     |                            |                             |
     |-- audio:start ------------->|                             |
     |-- audio:chunk (100ms) ----->|                             |
     |                            |-- [STT processing] ------->  |
     |                            |                             |
     |                            |<-- stt:interim (partial) ---|
     |                            |-- stt:interim ------------->|
     |                            |                             |
     |-- audio:chunk (100ms) ----->|                             |
     |                            |<-- stt:final (sentence) ---|
     |                            |                             |
     |                            |-- [Gemini translation] --->  |
     |                            |                             |
     |                            |-- stt:final --------------->|
     |                            |-- translation:complete ---->|
     |                            |                             |
     |-- audio:stop -------------->|                             |
     |                            |                             |
     |                            |-- [Argument extraction] -->  |
     |                            |                             |
     |                            |-- flow:argument ----------->|
     |                            |<-- flow:argument -----------|
```

---

## Environment Configuration

### Required Environment Variables

Create a `.env` file in the `server/` directory:

```bash
# server/.env

# Gemini API Key (required for STT and translation)
# Get your key at: https://aistudio.google.com/apikey
GEMINI_API_KEY=your-gemini-api-key

# Server port (optional, default: 3001)
PORT=3001
```

**That's it!** Just one API key for both STT and translation.

---

## Implementation Order

### Phase 1: Audio Pipeline Foundation ✅ COMPLETE
- [x] Create AudioWorklet for PCM conversion
- [x] Implement useAudioStream hook
- [x] Add audio WebSocket message handlers
- [x] Test audio streaming to server

**Files Created:**
- `client/public/audio-worklet-processor.js` - AudioWorklet for PCM conversion (48kHz→16kHz, 16-bit)
- `client/src/hooks/useAudioStream.ts` - Hook for managing audio capture
- `server/src/audio/sessionManager.ts` - Server-side audio session tracking

**Files Modified:**
- `shared/src/types.ts` - Added audio/STT/translation message types
- `server/src/websocket/handlers.ts` - Added audio streaming handlers
- `client/src/hooks/useWebSocket.ts` - Added audio streaming functions
- `client/src/pages/Room.tsx` - Integrated auto audio streaming when speaking

### Phase 2: Gemini STT Integration ✅ COMPLETE
- [x] Install @google/generative-ai package
- [x] Implement GeminiSTTService with audio buffering
- [x] Handle streaming sessions per speaker
- [x] Broadcast final transcripts to all participants
- [x] Display live transcripts in UI
- [x] Fix audio format (PCM → WAV with header for Gemini compatibility)
- [x] Fix speaker name display in transcripts
- [x] Increase buffer time to 5 seconds to reduce API rate limit issues

**Note:** Using Gemini instead of Google Cloud STT for simpler setup (single API key).

**Technical Details:**
- Gemini API requires WAV format, not raw PCM. Added `createWavHeader()` function to wrap PCM data.
- Buffer duration: 5 seconds (160KB @ 16kHz, 16-bit mono) to reduce API calls and avoid rate limits.
- Minimum audio length: 0.5 seconds to skip silent/short clips.
- Free tier has strict limits (~15 req/min, 1500 req/day). **Recommend enabling billing for testing.**

**Files Created:**
- `server/src/stt/geminiStt.ts` - Gemini-based STT with 5-second audio buffering + WAV conversion
- `client/src/stores/transcriptStore.ts` - Zustand store for transcripts
- `client/src/components/TranscriptPanel.tsx` - Live transcript display component
- `server/.env` - Environment variables (GEMINI_API_KEY, PORT)

**Files Modified:**
- `server/src/index.ts` - Initialize Gemini STT on startup, load dotenv
- `server/src/websocket/server.ts` - Added `getClientRoomId` method
- `server/src/websocket/handlers.ts` - Integrated STT with audio handlers, include speakerName in broadcasts
- `client/src/hooks/useWebSocket.ts` - Added `onTranscript` callback with speakerName support
- `client/src/pages/Room.tsx` - Added TranscriptPanel during debates
- `shared/src/types.ts` - Added `speakerName` to `STTFinalPayload`

### Phase 3: Gemini Translation ✅ COMPLETE
- [x] Implement GeminiTranslationService
- [x] Add debate context to translation prompts
- [x] Handle translation on final transcripts
- [x] Broadcast translations to listeners
- [x] Display dual transcripts (original + translation) in UI

**Files Created:**
- `server/src/translation/geminiTranslation.ts` - Debate-aware translation with context (resolution, speech, side)

**Files Modified:**
- `server/src/index.ts` - Initialize translation service on startup
- `server/src/websocket/handlers.ts` - Trigger translation after STT, broadcast to room
- `shared/src/types.ts` - Added `speakerName` to `TranslationCompletePayload`
- `client/src/hooks/useWebSocket.ts` - Handle `translation:complete` messages
- `client/src/stores/transcriptStore.ts` - Store translations with original transcripts
- `client/src/pages/Room.tsx` - Handle translation callbacks, pass language to panel
- `client/src/components/TranscriptPanel.tsx` - Dual transcript display with translation latency

### Phase 4: Dual Transcript UI ✅ COMPLETE
- [x] Create TranscriptPanel component (completed in Phase 2)
- [x] Implement utterance store (Zustand) (completed in Phase 2)
- [x] Display dual language view (original + translation stacked)
- [x] Add language indicator badges (flags: 🇺🇸, 🇰🇷, etc.)
- [x] Show translation latency metrics (+XXXms display)

**Note:** All Phase 4 tasks were completed as part of Phase 3 implementation.

### Phase 5: Argument Extraction ⬜
- [ ] Implement ArgumentExtractorService
- [ ] Create FlowState manager
- [ ] Extract arguments at end of each speech
- [ ] Link responses to prior arguments

### Phase 6: Flow Sheet UI ⬜
- [ ] Create FlowSheet component
- [ ] Implement FlowColumn component
- [ ] Create ArgumentCard component
- [ ] Add real-time flow updates

### Phase 7: Ballot Generation ⬜
- [ ] Implement BallotGeneratorService
- [ ] Create ballot display component
- [ ] Generate ballot at debate end
- [ ] Support bilingual RFD

### Phase 8: Latency + Polish ⬜
- [ ] Implement latency tracking
- [ ] Add latency display component
- [ ] Optimize translation batching
- [ ] Error handling and recovery

---

## Dependencies to Add

```json
// server/package.json
{
  "dependencies": {
    "@google-cloud/speech": "^6.0.0",
    "@google/generative-ai": "^0.21.0",
    // ... existing
  }
}

// client/package.json  
{
  "dependencies": {
    // ... existing (no new deps needed for M2)
  }
}
```

---

## Testing Strategy

### Unit Tests
- [ ] STT service mock testing
- [ ] Translation service mock testing
- [ ] Argument extractor output validation
- [ ] Flow state management

### Integration Tests
- [ ] Audio → STT → Translation pipeline
- [ ] Full debate flow extraction
- [ ] Ballot generation accuracy

### Manual Testing Checklist
- [ ] Audio captures correctly in browser
- [ ] STT produces accurate interim/final transcripts
- [ ] Translation preserves debate terminology
- [ ] Flow sheet updates in real-time
- [ ] Arguments correctly linked across speeches
- [ ] Ballot reflects actual debate outcome
- [ ] Latency stays under 1.5s target

---

## Latency Budget

| Stage | Target | Notes |
|-------|--------|-------|
| Audio capture + send | <50ms | Local processing |
| Google STT interim | ~200ms | Streaming mode |
| Google STT final | ~500ms | End of utterance |
| Gemini translation | ~300ms | Flash model |
| WebSocket broadcast | ~50ms | Local network |
| **Total (final)** | **~1.0-1.5s** | Acceptable for debate |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| STT accuracy issues | Fallback to Whisper API; allow manual correction |
| Translation quality | Review/tune prompts; add terminology glossary |
| High latency spikes | Show original text immediately, translation follows |
| API rate limits | Batch translations; queue management |
| Audio capture fails | Clear error messaging; retry logic |
| Large transcript state | Pagination; virtualized lists |

---

## Success Criteria

Milestone 2 is complete when:

1. ✅ Speaker's audio is captured and streamed to server
2. ✅ Google STT produces real-time transcripts (interim + final)
3. ✅ Gemini translates with debate context
4. ✅ Dual transcript shows original + translation
5. ✅ Arguments are extracted with CWI structure
6. ✅ Flow sheet displays arguments by speech column
7. ✅ Arguments link (responses to prior args)
8. ✅ Ballot generates at debate end
9. ✅ Latency under 1.5s for translation pipeline
10. ✅ Works for English ↔ Korean demo pair

---

## References

- [Google Cloud Speech-to-Text V2](https://cloud.google.com/speech-to-text/v2/docs)
- [Gemini API Documentation](https://ai.google.dev/gemini-api/docs)
- [Web Audio API AudioWorklet](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet)
- [Lincoln-Douglas Debate Format](https://www.speechanddebate.org/lincoln-douglas-debate/)

