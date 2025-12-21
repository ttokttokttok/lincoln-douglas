# Cross-Language Lincoln-Douglas Debate — MVP Plan

## Core Concept
A **real-time cross-language debate platform** where two debaters speaking different languages can face off in Lincoln-Douglas format. The system translates speech in near real-time while **preserving emotional tone and delivery** through ElevenLabs voice synthesis.

**The magic moment:** A debater in Seoul delivers a passionate rebuttal in Korean. Their opponent in Chicago hears it in English — same intensity, same conviction, same rhetorical fire — within seconds.

---

## Why This Wins the Hackathon

### ElevenLabs Showcase
- **Voice cloning**: Each debater gets a consistent "voice identity" in every language
- **Emotional preservation**: Passion, frustration, confidence carry through translation
- **Real-time streaming TTS**: Low-latency synthesis for debate flow

### Google Cloud Showcase
- **Speech-to-Text**: Streaming transcription in multiple languages
- **Translation API / Gemini**: Context-aware translation that handles debate terminology
- **Vertex AI**: Argument structuring, flow tracking, judging (preserved from original spec)

### Unique Value Proposition
- No one else is doing "competitive debate across languages"
- Combines multiple hard problems: real-time STT → translation → emotional TTS
- Democratizes debate: language is no longer a barrier to intellectual exchange

---

## Product Scope (MVP)

### Core Loop
1. Two debaters join a room, each selects their **speaking language** and **listening language**
2. Debater A speaks in Language A (e.g., Japanese)
3. System: STT → Translation → Emotional TTS in Language B (e.g., English)
4. Debater B hears translated speech with preserved emotion, sees transcript
5. Debater B responds in Language B, Debater A hears it in Language A
6. System maintains **unified flow** (arguments tracked regardless of source language)
7. At round end: bilingual ballot + speaker points

### Supported Languages (MVP)
Start with high-quality STT/TTS language pairs:
- English ↔ Korean (primary demo)
- English ↔ Japanese
- English ↔ Spanish
- English ↔ Mandarin

(Expand based on ElevenLabs voice availability and Google STT quality)

### Round Format (Simplified for MVP)
Keep timing tight for demo purposes:

**"Quick LD" format:**
- **AC (Affirmative Constructive)**: 3:00
- **NC (Negative Constructive)**: 4:00
- **1AR (First Affirmative Rebuttal)**: 2:00
- **NR (Negative Rebuttal)**: 3:00
- **2AR (Second Affirmative Rebuttal)**: 2:00
- **Prep time**: 2:00 per side

Or offer **"Micro Debate"** for quick demos:
- Two speeches per side, 2:00 each
- No prep time

---

## UX / Screens

### 1. Lobby / Room Creation
- Create room → get shareable link/code
- Select resolution (preset list + custom)
- Host picks side (Aff/Neg) or random assignment

### 2. Pre-Debate Setup (per debater)
- **Speaking language**: "I will speak in ___"
- **Listening language**: "I want to hear my opponent in ___"
- **Voice setup** (optional MVP stretch):
  - Quick voice sample (10 seconds) for voice cloning
  - Or select from preset debate voices
- Mic/camera permissions
- Ready check

### 3. Debate Room (Main Screen)

```
┌─────────────────────────────────────────────────────────────────┐
│  [Resolution: "Resolved: Universal Basic Income is justified"]  │
├───────────────────────┬─────────────────────────────────────────┤
│                       │                                         │
│   YOUR VIDEO          │    OPPONENT VIDEO                       │
│   (camera preview)    │    (their feed)                         │
│                       │                                         │
│   [Speaking: EN]      │    [Speaking: KO → You hear: EN]        │
│                       │                                         │
├───────────────────────┴─────────────────────────────────────────┤
│                                                                 │
│   LIVE TRANSCRIPT (dual language view)                          │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ Original: "기본적 인권으로서 생존권이..."                     │   
│   │ Translation: "As a basic human right, the right to..."  │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                 │
├───────────────────────┬─────────────────────────────────────────┤
│   FLOW (Arguments)    │   TIMER + CONTROLS                      │
│   - Aff V: Justice    │   ┌─────────┐                           │
│   - Aff C1: Dignity   │   │  2:34   │  ← Current speech         │
│   - Neg V: Liberty    │   └─────────┘                           │
│   - Neg C1: Incentive │   [End Speech] [Use Prep]               │
│                       │   Prep remaining: You 1:45 | Opp 2:00   │
└───────────────────────┴─────────────────────────────────────────┘
```

Key elements:
- **Dual video feeds**: See yourself and opponent
- **Language indicators**: Clear display of who speaks what, what you're hearing
- **Dual transcript**: Original language + translated version
- **Emotion indicator** (stretch): Visual cue showing detected emotion (confident, aggressive, measured)
- **Unified flow**: Arguments extracted and displayed in user's preferred language

### 4. Results / Ballot
- Winner + RFD (in both languages)
- Speaker points breakdown
- "Communication quality" metric (how well emotion transferred)
- Highlight reel: Key moments with original + translated audio

---

## Technical Architecture

### The Latency Challenge
Debate requires quick back-and-forth. Target latency budget:

```
Speaker finishes sentence
    ↓ (~200ms) STT finalization
    ↓ (~300ms) Translation
    ↓ (~500ms) ElevenLabs TTS generation + streaming start
    ↓ (~100ms) Network to opponent
─────────────────────────────
Total: ~1.0-1.5 seconds (acceptable for debate)
```

### Pipeline Overview

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Speaker A  |───▶│   STT       │────▶│ Translation │────▶│ ElevenLabs  │
│  (Korean)   │     │  (Google)   │     │  (Gemini)   │     │    TTS      │
└─────────────┘     └─────────────┘     └─────────────┘     └──────┬──────┘
                                                                   │
                    ┌──────────────────────────────────────────────┘
                    ▼
              ┌─────────────┐
              │  Speaker B  │  Hears English with A's emotional tone
              │  (English)  │
              └─────────────┘
```

### Frontend (React)
- React + TypeScript
- WebRTC for peer video (or media server relay)
- WebSocket for real-time transcript/audio streaming
- Audio worklet for mixing translated TTS with ambient audio

### Backend (Google Cloud Run)
Primary responsibilities:
- WebSocket hub for room coordination
- STT streaming orchestration (Google Cloud Speech-to-Text)
- Translation calls (Gemini for context-aware debate translation)
- ElevenLabs API orchestration
- Flow state management
- Session/room management

### Google Cloud Services
- **Speech-to-Text (Streaming)**: Real-time transcription with language detection
- **Vertex AI (Gemini)**: 
  - Translation with debate context (preserves terminology)
  - Argument structuring (CWI extraction)
  - Emotion analysis from transcript
  - Judging + ballot generation
- **Cloud Run**: Stateless backend scaling
- **Cloud Storage** (later): Recording storage for review

### ElevenLabs Integration

**Voice Strategy (MVP options):**

1. **Preset voices per language** (simplest)
   - Curated set of debate-appropriate voices
   - User picks from dropdown

2. **Instant voice clone** (better demo)
   - 10-30 second voice sample during setup
   - Create temporary clone for the session
   - Each debater sounds like "themselves" in every language

3. **Voice + emotion preservation** (ideal)
   - Analyze source audio for emotion markers
   - Apply emotion parameters to TTS output
   - ElevenLabs voice settings: `stability`, `similarity_boost`, `style`

**API Usage:**
- Streaming TTS for low latency
- Chunk audio as sentences complete
- Pre-warm voice models during setup

---

## Real-Time Communication Protocol

### WebSocket Events

**Room lifecycle:**
```
client.room.join         { roomId, userId, speakingLang, listeningLang }
client.room.ready        { }
server.room.state        { participants[], status, currentSpeaker }
server.room.start        { firstSpeaker, speechRole }
```

**Speech flow:**
```
client.speech.start      { role: "AC" | "NC" | ... }
client.audio.chunk       { audioBase64, timestamp }
client.speech.end        { }

server.stt.partial       { speakerId, originalText, lang }
server.stt.final         { speakerId, originalText, lang, emotionHints }
server.translation       { speakerId, translatedText, targetLang }
server.tts.audio         { speakerId, audioChunk, isFinal }
server.flow.updated      { flow }
```

**Control:**
```
client.prep.start        { }
client.prep.end          { }
server.timer.update      { speechTimeRemaining, prepTime }
server.turn.change       { nextSpeaker, speechRole }
```

### Latency Optimizations

1. **Streaming everything**: Don't wait for complete sentences when possible
2. **Predictive TTS**: Start generating TTS on partial translations for common patterns
3. **Sentence chunking**: Process and translate sentence-by-sentence, not full speeches
4. **Audio prioritization**: TTS audio gets priority over video in bandwidth constraints
5. **Fallback**: If TTS latency spikes, show translated text immediately with audio following

---

## Emotion Preservation System

### Emotion Detection (from source audio/transcript)
Analyze via Gemini or specialized model:
- **Confidence level**: Assertive vs. uncertain
- **Intensity**: Calm vs. passionate
- **Tone**: Friendly vs. aggressive
- **Pacing**: Measured vs. rapid

### Emotion Application (to TTS)
Map detected emotions to ElevenLabs parameters:

| Emotion     | stability | similarity_boost | style | speed |
|-------------|-----------|------------------|-------|-------|
| Confident   | 0.7       | 0.8              | 0.4   | 1.0   |
| Passionate  | 0.5       | 0.7              | 0.7   | 1.1   |
| Aggressive  | 0.4       | 0.8              | 0.8   | 1.15  |
| Measured    | 0.8       | 0.7              | 0.2   | 0.95  |
| Uncertain   | 0.6       | 0.6              | 0.3   | 0.9   |

### Emotion Continuity
- Track emotion across sentences for natural flow
- Avoid jarring switches (smooth transitions)
- Preserve rhetorical builds (gradual intensity increase)

---

## Domain Model (adapted for cross-language)

### Participant
```typescript
interface Participant {
  id: string;
  displayName: string;
  speakingLanguage: LanguageCode;
  listeningLanguage: LanguageCode;
  side: "AFF" | "NEG";
  voiceId: string; // ElevenLabs voice ID (cloned or preset)
  prepTimeRemaining: number;
}
```

### Utterance (replaces simple transcript)
```typescript
interface Utterance {
  id: string;
  speakerId: string;
  speechId: string;
  timestamp: number;
  original: {
    text: string;
    language: LanguageCode;
    audioUrl?: string;
    emotionAnalysis: EmotionMarkers;
  };
  translations: {
    [targetLang: LanguageCode]: {
      text: string;
      audioUrl?: string;
      latencyMs: number;
    };
  };
}
```

### Argument (CWI, language-agnostic)
```typescript
interface Argument {
  id: string;
  speechId: string;
  side: "AFF" | "NEG";
  sourceLanguage: LanguageCode;
  
  // Stored in canonical form (English) for consistent flow
  title: string;
  claim: string;
  warrant: string;
  impact: string;
  
  // Translations for display
  localizedVersions: {
    [lang: LanguageCode]: {
      title: string;
      claim: string;
      warrant: string;
      impact: string;
    };
  };
  
  status: "introduced" | "extended" | "answered" | "dropped";
  respondedToBy: string[];
}
```

---

## AI Behaviors

### A. Translation (Gemini)
Not just word-for-word — debate-aware translation:

**System prompt:**
```
You are a real-time debate translator. Translate the following speech segment 
from {source_lang} to {target_lang}.

Requirements:
- Preserve rhetorical force and argumentation structure
- Maintain debate terminology (e.g., "impact", "turn", "link")
- Keep emotional intensity markers (emphatic phrases, rhetorical questions)
- Translate idioms to culturally equivalent expressions
- Be concise — this is real-time, latency matters

Context: This is a Lincoln-Douglas debate on "{resolution}". 
Current speech: {speech_role} by {side}.
```

### B. Argument Structuring (same as original spec)
- Extract CWI from transcripts (works on canonical English translation)
- Link responses to prior arguments
- Update flow state

### C. Emotion Analysis
**Input:** Audio features + transcript
**Output:** Emotion markers for TTS

```json
{
  "dominantEmotion": "passionate",
  "confidence": 0.85,
  "intensity": 0.7,
  "suggestedTTSParams": {
    "stability": 0.5,
    "style": 0.7,
    "speed": 1.1
  }
}
```

### D. Judging (adapted)
Judge evaluates based on:
- Argument quality (from unified flow)
- Clash and extension
- Weighing
- **Communication effectiveness**: Did emotional intent transfer?
- **Translation handling**: Did debater adapt to cross-language context?

---

## API Surface

### Room Management
```
POST   /api/rooms                    Create room
GET    /api/rooms/:roomId            Get room state
POST   /api/rooms/:roomId/join       Join room
DELETE /api/rooms/:roomId/leave      Leave room
```

### Voice Setup
```
POST   /api/voice/clone              Upload voice sample, get voiceId
GET    /api/voice/presets            List available preset voices by language
```

### WebSocket
```
GET    /api/rooms/:roomId/ws         Real-time connection for debate
```

### Post-Debate
```
GET    /api/rooms/:roomId/ballot     Get judge ballot
GET    /api/rooms/:roomId/recording  Get recording with all audio tracks
```

---

## Implementation Roadmap

### Milestone 1 — Room + Video Infrastructure
- [ ] Room creation/joining flow
- [ ] WebRTC video connection between two participants
- [ ] Basic timer system
- [ ] Language selection UI

### Milestone 2 — Real-Time Translation Pipeline
- [ ] Google STT streaming integration (multi-language)
- [ ] Gemini translation with debate context
- [ ] Dual transcript display (original + translated)
- [ ] Latency measurement and display

### Milestone 3 — ElevenLabs Voice Synthesis
- [ ] Preset voice selection per language
- [ ] Streaming TTS integration
- [ ] Audio playback synchronization
- [ ] (Stretch) Voice cloning from sample

### Milestone 4 — Emotion Preservation
- [ ] Emotion detection from source audio/text
- [ ] Emotion → TTS parameter mapping
- [ ] A/B comparison: with/without emotion preservation

### Milestone 5 — Flow + Judging
- [ ] Argument extraction (CWI) from translated transcripts
- [ ] Unified flow view (language-agnostic)
- [ ] Ballot generation
- [ ] Speaker points with "translation quality" dimension

---

## Demo Script (Hackathon Presentation)

1. **Setup** (30 sec): Two presenters join, one selects Korean, one English
2. **Voice clone** (30 sec): Quick voice sample from each
3. **Debate start** (2 min): 
   - English speaker gives AC
   - Korean speaker hears it in Korean with similar voice/emotion
4. **Response** (2 min):
   - Korean speaker responds with NC
   - English speaker hears passionate Korean argument in English
5. **Highlight moment**: Show side-by-side original vs. translated with emotion preserved
6. **Ballot** (30 sec): Show bilingual judgment

**Key demo talking points:**
- "Same passion, different language"
- Latency numbers (show ~1.5 second delay)
- Emotion preservation comparison
- "Debate is now borderless"

---

## Open Questions

1. **Voice cloning legality**: Need consent flow, temporary storage only?
2. **Latency tolerance**: Is 1.5s acceptable? Need user testing
3. **Emotion accuracy**: How good is detection? Need calibration
4. **Language pairs**: Which pairs have best STT + TTS quality?
5. **Fallback UX**: What if translation fails mid-speech?

---

## MVP Decisions (Locked)

- **Translation**: Gemini (context-aware) over Google Translate API
- **STT**: Google Cloud Speech-to-Text (streaming)
- **TTS**: ElevenLabs with streaming playback
- **Voice**: Start with presets, stretch goal = instant clone
- **Video**: Simple WebRTC peer connection (no SFU for MVP)
- **Storage**: No persistent storage (session only)
- **Languages**: English ↔ Korean for primary demo

---

## Future Expansion

- **Tournament mode**: Multi-round brackets across languages
- **Spectator mode**: Watch debates with language selection
- **AI opponent**: Single-player with cross-language AI (combine both specs)
- **Debate coaching**: Post-round analysis of translation challenges
- **More languages**: Japanese, Arabic, Hindi, Portuguese, French
- **Mobile app**: React Native version