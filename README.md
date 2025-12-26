<p align="center">
  <img src="https://img.shields.io/badge/Hackathon-2024-blueviolet?style=for-the-badge" alt="Hackathon 2024"/>
  <img src="https://img.shields.io/badge/Languages-85+-green?style=for-the-badge" alt="85+ Languages"/>
  <img src="https://img.shields.io/badge/AI%20Powered-Gemini%20%2B%20ElevenLabs-orange?style=for-the-badge" alt="AI Powered"/>
</p>

<h1 align="center">Debate Globally</h1>

<h3 align="center">
  <em>Break the Language Barrier. Debate the World.</em>
</h3>

<p align="center">
  Real-time cross-language debate platform powered by AI translation and voice synthesis.<br/>
  Speak in your language. Your opponent hears theirs. Debate anyone, anywhere.
</p>

<p align="center">
  <a href="https://polis.gg"><strong>Live Demo</strong></a>
</p>

---

## Why Debate Matters

**Lincoln-Douglas debate has shaped the critical thinkers who shaped our world.**

For over a century, LD debate has trained generations of leaders to reason through complex ethical questions: *Is civil disobedience justified? Does the right to privacy outweigh national security? What do we owe each other as a society?*

These aren't abstract exercises. The skills forged in debate — **logical reasoning, evidence evaluation, understanding opposing viewpoints, articulating complex ideas under pressure** — have produced:

- Supreme Court justices who can dissect constitutional arguments
- Policymakers who understand the nuances of competing values
- Scientists who can communicate complex ideas to the public
- Business leaders who can navigate ethical dilemmas
- Citizens who can participate meaningfully in democracy

**Debate teaches us not just *what* to think, but *how* to think.**

---

## The World Has Changed

**We live in an era of unprecedented global interconnection.**

Climate change, AI governance, economic policy, human rights — the challenges we face don't respect borders. A policy decision in Beijing affects farmers in Brazil. A technological breakthrough in Silicon Valley reshapes economies in Sub-Saharan Africa.

Yet our most important conversations remain siloed by language:

- A Korean philosopher's perspective on AI ethics never reaches American policymakers
- European debates on privacy law happen in isolation from Asian discourse
- African voices on economic justice are absent from global forums

**The marketplace of ideas has gone global. But debate hasn't.**

---

## The Problem

**Lincoln-Douglas debate has always been limited to domestic competition.**

Why? **Language is the biggest barrier to international debate.** A Korean debater and an American debater can't argue philosophy when they literally can't understand each other.

This means:
- Debaters only compete against people who speak their language
- International perspectives are missing from competitive debate
- The "marketplace of ideas" is fractured into language silos
- Cross-cultural philosophical discourse remains inaccessible

**What if we could solve this?**

---

## The Solution

**Debate Globally** is a real-time cross-language debate platform that enables debaters from any country to compete against each other — in their own languages.

```
+-------------------------------------------------------------------------+
|                                                                         |
|   Korean Debater                                American Debater        |
|   Speaks: Korean                                Speaks: English         |
|                                                                         |
|   "...         <---- AI Translation ---->   "The right to life         |
|    ...                                       must be guaranteed         |
|                                              as a fundamental..."       |
|                                                                         |
|   Hears: Korean voice                        Hears: English voice       |
|   (opponent translated)                      (opponent translated)      |
|                                                                         |
+-------------------------------------------------------------------------+
```

**How it works:**
1. You speak in your native language
2. Gemini transcribes and translates in real-time
3. ElevenLabs synthesizes natural speech in opponent's language
4. Your opponent hears you in *their* language with preserved emotion
5. AI tracks arguments and generates flow sheets automatically

---

## Features

### Cross-Language Debate
- **85 languages supported** — from English to Korean to Swahili
- Real-time speech-to-text with Gemini 2.0 Flash
- Context-aware translation that understands debate terminology
- Dual transcripts showing original + translation

### Emotion Preservation
- AI detects emotional tone (passionate, aggressive, measured, etc.)
- Voice synthesis preserves speaker's conviction and intensity
- Your rebuttal sounds like a rebuttal, not a Wikipedia article

### Natural Voice Synthesis
- ElevenLabs Flash v2.5 for ultra-low latency (~75ms)
- Multiple voice options per language
- Streaming audio for real-time playback

### Automatic Flow Sheet
- AI extracts arguments using Claim-Warrant-Impact structure
- Tracks responses, turns, and extensions
- 5-column flow (AC -> NC -> 1AR -> NR -> 2AR)
- Auto-generated ballot with RFD at debate end

### AI Practice Mode
- Practice against 4 distinct AI personalities:
  - **The Scholar** — Evidence-heavy, logical (Hard)
  - **The Passionate Advocate** — Values-focused, emotional (Medium)
  - **The Aggressive Challenger** — Direct attacks, pressure (Hard)
  - **The Beginner** — Perfect for learning (Easy)
- Gemini-powered contextual argument generation

### Full LD Format
- Server-authoritative timer system
- Speech transitions: AC (3:00) -> NC (4:00) -> 1AR (2:00) -> NR (3:00) -> 2AR (2:00)
- Prep time tracking per side (2:00 each)

---

## Architecture

### System Overview

```
+-----------------------------------------------------------------------------+
|                         DEBATE GLOBALLY ARCHITECTURE                         |
+-----------------------------------------------------------------------------+
|                                                                              |
|  +-----------------------------------------------------------------------+  |
|  |                         FRONTEND (React + Vite)                        |  |
|  |                                                                        |  |
|  |   +-------+   +---------+   +--------+   +-------+   +--------+       |  |
|  |   | Lobby | > |PreDebate| > | Debate | > | Flow  | > | Ballot |       |  |
|  |   |       |   | Setup   |   |  Room  |   | Sheet |   | Results|       |  |
|  |   +-------+   +---------+   +--------+   +-------+   +--------+       |  |
|  |        |            |            |                                     |  |
|  |        +------------+------------+                                     |  |
|  |                     |                                                  |  |
|  |          +----------+----------+                                       |  |
|  |          | WebSocket + WebRTC  |                                       |  |
|  |          +----------+----------+                                       |  |
|  +---------------------|------------------------------------------------------+
|                        |                                                     |
|                        v                                                     |
|  +-----------------------------------------------------------------------+  |
|  |                        BACKEND (Node.js + Express)                     |  |
|  |                                                                        |  |
|  |   +----------+  +----------+  +----------+  +----------+              |  |
|  |   |   Room   |  |  Debate  |  |  Timer   |  | Signaling|              |  |
|  |   | Manager  |  |Controller|  |Controller|  |  Relay   |              |  |
|  |   +----------+  +----------+  +----------+  +----------+              |  |
|  |                                                                        |  |
|  |   +----------------------------------------------------------------+  |  |
|  |   |                        AI PIPELINE                             |  |  |
|  |   |                                                                |  |  |
|  |   |  Audio -> [Gemini STT] -> [Gemini Translation] -> [Emotion]   |  |  |
|  |   |                                  |                             |  |  |
|  |   |          [Argument Extractor] <- [ElevenLabs TTS] <-----------+  |  |
|  |   |                                                                |  |  |
|  |   +----------------------------------------------------------------+  |  |
|  |                                                                        |  |
|  +-----------------------------------------------------------------------+  |
|                                                                              |
+-----------------------------------------------------------------------------+
```

### Translation Pipeline

```
+-----------------------------------------------------------------------------+
|                         REAL-TIME TRANSLATION FLOW                           |
+-----------------------------------------------------------------------------+
|                                                                              |
|   SPEAKER                       SERVER                        LISTENER       |
|   (Korean)                                                    (English)      |
|                                                                              |
|   +------+                                                    +--------+    |
|   | Mic  |                                                    | Speaker|    |
|   +--+---+                                                    +----^---+    |
|      |                                                             |         |
|      |  Audio Chunks (16kHz PCM)                                   |         |
|      v                                                             |         |
|   +----------------------------------------------------------------+         |
|   |                                                                |         |
|   |   +--------+    +----------+    +--------+    +---------+     |         |
|   |   | Gemini |--->|  Gemini  |--->| Emotion|--->| Eleven- |-----+         |
|   |   |  STT   |    | Translate|    | Detect |    | Labs TTS|               |
|   |   |        |    |          |    |        |    |         |               |
|   |   | ~500ms |    |  ~300ms  |    | ~150ms |    |  ~75ms  |               |
|   |   +--------+    +----------+    +--------+    +---------+               |
|   |                                                                |         |
|   +----------------------------------------------------------------+         |
|                                                                              |
|   Total Latency: ~1.0-1.5 seconds from speech to translated audio           |
|                                                                              |
+-----------------------------------------------------------------------------+
```

### Emotion Preservation System

```
+-----------------------------------------------------------------------------+
|                           EMOTION PRESERVATION                               |
+-----------------------------------------------------------------------------+
|                                                                              |
|   DETECTED EMOTION          TTS VOICE SETTINGS              RESULT          |
|                                                                              |
|   Confident            ->   Stability: 0.60, Speed: 1.0  -> Steady, assured |
|   Passionate           ->   Stability: 0.45, Speed: 1.05 -> Dynamic, faster |
|   Aggressive           ->   Stability: 0.40, Speed: 1.1  -> Forceful, rapid |
|   Measured             ->   Stability: 0.70, Speed: 0.95 -> Calm, deliberate|
|   Uncertain            ->   Stability: 0.55, Speed: 0.9  -> Tentative       |
|   Neutral              ->   Stability: 0.55, Speed: 1.0  -> Default         |
|                                                                              |
|   +---------------------------------------------------------------------+   |
|   |  "This argument DESTROYS their case!"                               |   |
|   |                                                                     |   |
|   |   Gemini Analysis:                                                  |   |
|   |   - Emphatic language ("DESTROYS")                                  |   |
|   |   - Direct attack phrasing                                          |   |
|   |   - Exclamation marks                                               |   |
|   |                                                                     |   |
|   |   Result: Passionate (0.85 intensity)                               |   |
|   |   TTS: Faster, more dynamic voice delivery                          |   |
|   +---------------------------------------------------------------------+   |
|                                                                              |
+-----------------------------------------------------------------------------+
```

### AI Bot Practice Mode

```
+-----------------------------------------------------------------------------+
|                              AI BOT PERSONALITIES                            |
+-----------------------------------------------------------------------------+
|                                                                              |
|   +-------------------+   +-------------------+                              |
|   | THE SCHOLAR       |   | THE PASSIONATE    |                              |
|   |                   |   |     ADVOCATE      |                              |
|   | Difficulty: HARD  |   | Difficulty: MEDIUM|                              |
|   |                   |   |                   |                              |
|   | * Evidence-heavy  |   | * Values-focused  |                              |
|   | * Logical flow    |   | * Moral framing   |                              |
|   | * Citations       |   | * Emotional       |                              |
|   | * Professorial    |   | * Vivid impacts   |                              |
|   +-------------------+   +-------------------+                              |
|                                                                              |
|   +-------------------+   +-------------------+                              |
|   | THE AGGRESSIVE    |   | THE BEGINNER      |                              |
|   |     CHALLENGER    |   |                   |                              |
|   |                   |   | Difficulty: EASY  |                              |
|   | Difficulty: HARD  |   |                   |                              |
|   |                   |   | * Simple args     |                              |
|   | * Direct attacks  |   | * Slower pace     |                              |
|   | * Turns & takes   |   | * Learning mode   |                              |
|   | * Pressure-heavy  |   | * Confidence      |                              |
|   | * Aggressive      |   |   building        |                              |
|   +-------------------+   +-------------------+                              |
|                                                                              |
|   Each bot uses Gemini to generate contextual arguments based on:           |
|   - Current resolution                                                       |
|   - Flow state (your arguments + their prior arguments)                      |
|   - Character-specific prompting for distinct debate styles                  |
|                                                                              |
+-----------------------------------------------------------------------------+
```

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Frontend** | React 18 + TypeScript | UI framework |
| | Vite | Build tool, fast HMR |
| | Tailwind CSS | Styling |
| | Zustand | State management |
| **Backend** | Node.js 20+ | Runtime |
| | Express | HTTP server |
| | ws | WebSocket server |
| **Real-time** | WebRTC (native) | P2P video/audio |
| | WebSocket | Signaling + events |
| **AI** | Gemini 2.0 Flash | STT, Translation, Emotion |
| | ElevenLabs Flash v2.5 | Text-to-Speech |
| **Infrastructure** | Google STUN | NAT traversal |
| | Metered.ca TURN | Relay fallback |

---

## Getting Started

### Prerequisites

- Node.js 20+
- npm or yarn
- API Keys:
  - [Gemini API Key](https://aistudio.google.com/apikey)
  - [ElevenLabs API Key](https://elevenlabs.io)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/lincoln-douglas.git
cd lincoln-douglas

# Install dependencies
npm install

# Set up environment variables
cp server/.env.example server/.env
```

### Environment Variables

Create `server/.env`:

```env
# Required
GEMINI_API_KEY=your-gemini-api-key
ELEVENLABS_API_KEY=your-elevenlabs-api-key

# Optional
PORT=3001
```

### Running the Application

```bash
# Start both client and server in development mode
npm run dev

# Or start separately:
npm run dev:client    # Frontend at http://localhost:5173
npm run dev:server    # Backend at http://localhost:3001
```

### Quick Start Guide

1. **Create a Room** — Click "Create Room" and share the 6-character code
2. **Join** — Your opponent enters the code to join
3. **Setup** — Both select side (AFF/NEG) and languages
4. **Ready** — Both click ready when prepared
5. **Debate!** — Timer starts, speeches flow automatically

---

## Project Structure

```
lincoln-douglas/
|-- client/                     # React frontend
|   |-- src/
|   |   |-- components/         # UI components
|   |   |   |-- BotSetup.tsx
|   |   |   |-- FlowSheet.tsx
|   |   |   |-- TranscriptPanel.tsx
|   |   |   +-- ...
|   |   |-- hooks/              # Custom React hooks
|   |   |   |-- useWebSocket.ts
|   |   |   |-- usePeer.ts
|   |   |   |-- useAudioStream.ts
|   |   |   +-- ...
|   |   |-- pages/              # Page components
|   |   |   |-- Lobby.tsx
|   |   |   +-- Room.tsx
|   |   +-- stores/             # Zustand stores
|   |       |-- roomStore.ts
|   |       +-- transcriptStore.ts
|   +-- public/
|       +-- audio-worklet-processor.js
|
|-- server/                     # Node.js backend
|   +-- src/
|       |-- websocket/          # WebSocket handlers
|       |-- rooms/              # Room management
|       |-- timer/              # Debate timer logic
|       |-- stt/                # Gemini STT service
|       |-- translation/        # Gemini translation
|       |-- emotion/            # Emotion detection
|       |-- tts/                # ElevenLabs TTS
|       |-- flow/               # Flow state + ballot
|       +-- bot/                # AI bot logic
|
|-- shared/                     # Shared types
|   +-- src/
|       |-- types.ts
|       +-- botCharacters.ts
|
+-- MILESTONE_*.md              # Implementation docs
```

---

## Debate Flow

### Lincoln-Douglas Format (Simplified)

```
+----------------------------------------------------------------+
|                     DEBATE STRUCTURE                            |
+----------------------------------------------------------------+
|                                                                 |
|   +-----+  +-----+  +-----+  +-----+  +-----+                  |
|   | AC  |  | NC  |  | 1AR |  | NR  |  | 2AR |  + 2:00 prep/side|
|   | 3:00|  | 4:00|  | 2:00|  | 3:00|  | 2:00|                  |
|   +-----+  +-----+  +-----+  +-----+  +-----+                  |
|      |       |        |        |        |                       |
|      v       v        v        v        v                       |
|     AFF     NEG      AFF      NEG      AFF                      |
|                                                                 |
|   AC  = Affirmative Constructive (builds case)                 |
|   NC  = Negative Constructive (builds case + responds)         |
|   1AR = 1st Affirmative Rebuttal (responds + rebuilds)         |
|   NR  = Negative Rebuttal (extends + crystallizes)             |
|   2AR = 2nd Affirmative Rebuttal (final defense)               |
|                                                                 |
+----------------------------------------------------------------+
```

### Flow Sheet Structure

The flow sheet automatically tracks arguments using AI extraction:

```
+--------+--------+--------+--------+--------+
|   AC   |   NC   |  1AR   |   NR   |  2AR   |
+--------+--------+--------+--------+--------+
|V: Life |        |        |        |        |
|        |        |        |        |        |
|C: Util | Turn:  | Answer | Extend | Impact |
|        | Rights |        |        | calc   |
|C1: Econ| are... | ...    | ...    | ...    |
|impact  |        |        |        |        |
|        |C1: Gov |        |        |        |
|        |failure |        |        |        |
+--------+--------+--------+--------+--------+

V = Value premise
C = Criterion
C1, C2 = Contentions
```

---

## Supported Languages

Debate Globally supports **85 languages** including:

| Region | Languages |
|--------|-----------|
| **Americas** | English, Spanish, Portuguese, French |
| **Europe** | German, Italian, Dutch, Polish, Ukrainian, Swedish, Norwegian, Finnish, Greek, Czech, Romanian, Hungarian |
| **East Asia** | Chinese (Mandarin), Japanese, Korean |
| **South Asia** | Hindi, Bengali, Tamil, Telugu, Marathi, Gujarati, Punjabi, Urdu |
| **Southeast Asia** | Vietnamese, Thai, Indonesian, Malay, Filipino |
| **Middle East** | Arabic, Hebrew, Persian, Turkish |
| **Africa** | Swahili, Amharic, Hausa, Yoruba, Zulu |

---

## Performance

| Metric | Target | Achieved |
|--------|--------|----------|
| STT Latency | <1s | ~500ms (5s buffer) |
| Translation | <500ms | ~300ms |
| Emotion Detection | <200ms | ~150ms |
| TTS First Audio | <500ms | ~75ms |
| **Total Pipeline** | <2s | **~1.0-1.5s** |

---

## Milestones

| Milestone | Description | Status |
|-----------|-------------|--------|
| **M1** | Room + Video Infrastructure | Complete |
| **M2** | Real-Time Translation + Flow Sheet | Complete |
| **M3** | ElevenLabs Voice Synthesis | Complete |
| **M4** | Emotion Preservation | Complete |
| **M5** | AI Bot Practice Mode | Complete |

---

## Future Roadmap

- [ ] **Cross-Examination Mode** — Add CX periods for traditional LD
- [ ] **Spectator Mode** — Watch debates with translated commentary
- [ ] **Tournament System** — Brackets, rankings, judge panels
- [ ] **Voice Cloning** — Clone debater's voice for translated output
- [ ] **Mobile Apps** — iOS and Android native apps
- [ ] **Recording & Replay** — Save debates for later review

---

## Acknowledgments

- **Gemini API** — For powerful STT, translation, and reasoning
- **ElevenLabs** — For natural voice synthesis
- **The Debate Community** — For inspiring this project

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

<p align="center">
  <strong>Built for debaters who believe ideas should have no borders.</strong>
</p>

<p align="center">
  <a href="https://polis.gg">polis.gg</a>
</p>
