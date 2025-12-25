# Milestone 5 — AI Bot Practice Mode Implementation Plan

## Status: PLANNED

**Current Phase:** Planning Complete — Ready for Implementation

**Last Updated:** 2024-12-25

## Overview

This document details the implementation strategy for Milestone 5 of the Cross-Language Lincoln-Douglas Debate Platform. We're building a single-player practice mode where users can debate against AI bots with distinct personalities.

**The Goal:** A debater can select an AI opponent with a unique personality, choose their side, and practice full LD debates with Gemini-powered argument generation and ElevenLabs TTS voice output.

---

## Feature Summary

### Landing Page Redesign

The landing page will feature side-by-side cards:

```
+----------------------+  +------------------------+
|   DEBATE A HUMAN     |  |   PRACTICE WITH AI     |
|   ================   |  |   ================     |
|                      |  |                        |
|   Create or join a   |  |   Hone your skills     |
|   room with another  |  |   against AI debate    |
|   debater            |  |   opponents            |
|                      |  |                        |
|   [Create Room]      |  |   [Start Practice]     |
|   [Join Room]        |  |                        |
+----------------------+  +------------------------+
```

### Bot Characters (4 Archetypes)

| Character | Icon | Difficulty | Description |
|-----------|------|------------|-------------|
| **The Scholar** | 🎓 | Hard | Evidence-heavy, measured tone, focuses on warrants and logical structure |
| **The Passionate Advocate** | 🔥 | Medium | Values-focused, emotional delivery, strong impacts and moral framing |
| **The Aggressive Challenger** | ⚔️ | Hard | Direct attacks, turns, aggressive rebuttals. Pressure-heavy style |
| **The Beginner** | 🌱 | Easy | Simpler arguments, slower pace. Perfect for learning and building confidence |

### Bot Setup Flow

1. **Enter Resolution** → Text input with suggested popular topics
2. **Choose Your Opponent** → Select from 4 character cards with difficulty badges
3. **Pick Your Side** → Affirmative or Negative
4. **Start Debate** → Creates bot room, begins debate

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              BOT PRACTICE MODE FLOW                              │
│                                                                                  │
│   Landing Page (Lobby.tsx)                                                       │
│        │                                                                         │
│        ├── "Debate a Human" (existing PvP flow)                                  │
│        │                                                                         │
│        └── "Practice with AI" ──► BotSetup.tsx                                   │
│                                        │                                         │
│                                        ▼                                         │
│                    ┌──────────────────────────────────────┐                     │
│                    │       Bot Room Creation               │                     │
│                    │  • mode = 'practice'                  │                     │
│                    │  • Bot joins as virtual participant   │                     │
│                    │  • User picks AFF/NEG, bot gets other │                     │
│                    └──────────────────┬───────────────────┘                     │
│                                       │                                          │
│                                       ▼                                          │
│                    ┌──────────────────────────────────────┐                     │
│                    │         Debate Room (Room.tsx)        │                     │
│                    │  • Same UI as PvP                     │                     │
│                    │  • Bot indicator + Skip button        │                     │
│                    │  • Timer runs normally                │                     │
│                    └──────────────────┬───────────────────┘                     │
│                                       │                                          │
│                                       ▼                                          │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │                         SPEECH FLOW                                      │   │
│   │                                                                          │   │
│   │   User's Turn:                  Bot's Turn:                              │   │
│   │   ┌──────────────────┐          ┌──────────────────────────────────┐    │   │
│   │   │  User speaks     │          │  1. BotManager triggers          │    │   │
│   │   │  (mic → STT)     │          │  2. SpeechGenerator creates text │    │   │
│   │   │                  │          │  3. TTS generates audio          │    │   │
│   │   │  Arguments       │          │  4. Audio streams to user        │    │   │
│   │   │  extracted       │          │  5. Arguments extracted          │    │   │
│   │   └──────────────────┘          └──────────────────────────────────┘    │   │
│   │                                                                          │   │
│   │   Flow state tracks both user and bot arguments                          │   │
│   │   Ballot generated at end (same as PvP)                                  │   │
│   │                                                                          │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Key Design Decisions

### 1. Room Mode Distinction

**Decision:** Add `mode: 'pvp' | 'practice'` field to RoomState.

**Rationale:** Allows the same Room/DebateManager infrastructure to handle both modes while enabling bot-specific logic branching.

### 2. Bot as Virtual Participant

**Decision:** Bot is a `Participant` with `isBot: true` flag.

**Rationale:** Reuses existing participant interface, minimal changes to room/timer logic.

### 3. Bot Voice Per Character

**Decision:** Each character has dedicated voice settings.

| Character | Stability | Speed | Effect |
|-----------|-----------|-------|--------|
| Scholar | 0.70 | 0.95 | Measured, steady |
| Passionate | 0.45 | 1.05 | Dynamic, faster |
| Aggressive | 0.40 | 1.10 | Forceful, rapid |
| Beginner | 0.65 | 0.90 | Stable, slower |

### 4. Bot Language

**Decision:** Bot speaks in user's language directly (no translation layer).

**Rationale:** Simplifies implementation, avoids translation latency, focuses on debate practice.

### 5. Bot Timing

**Decision:**
- 2-4 second "thinking" delay before bot starts speaking
- Pre-generation during opponent's speech to reduce latency

**Rationale:** Instant response feels unnatural; pre-generation improves UX.

### 6. Skip Feature

**Decision:** Add "Skip Bot Speech" button visible only in practice mode during bot speeches.

**Rationale:** Experienced debaters can skip to practice their own speeches faster.

---

## Type Definitions

### New Types (`shared/src/types.ts`)

```typescript
// Bot character archetypes
export type BotCharacter = 'scholar' | 'passionate' | 'aggressive' | 'beginner';

// Room mode
export type RoomMode = 'pvp' | 'practice';

// Bot character metadata
export interface BotCharacterInfo {
  id: BotCharacter;
  name: string;
  description: string;
  difficulty: 'easy' | 'medium' | 'hard';
  icon: string;
  voiceSettings: {
    stability: number;
    speed: number;
  };
}

// Extended Participant
export interface Participant {
  // ... existing fields ...
  isBot: boolean;
  botCharacter?: BotCharacter;
}

// Extended RoomState
export interface RoomState {
  // ... existing fields ...
  mode: RoomMode;
  botCharacter?: BotCharacter;
}

// New WebSocket message types
| 'bot:room:create'        // Client → Server: Create practice room
| 'bot:speech:skip'        // Client → Server: Skip current bot speech
| 'bot:speech:generating'  // Server → Client: Bot is generating speech
```

### Bot Character Definitions (`shared/src/botCharacters.ts`)

```typescript
export const BOT_CHARACTERS: Record<BotCharacter, BotCharacterInfo> = {
  scholar: {
    id: 'scholar',
    name: 'The Scholar',
    description: 'Evidence-heavy, measured tone, focuses on warrants and logical structure.',
    difficulty: 'hard',
    icon: '🎓',
    voiceSettings: { stability: 0.70, speed: 0.95 },
  },
  passionate: {
    id: 'passionate',
    name: 'The Passionate Advocate',
    description: 'Values-focused, emotional delivery, strong impacts and moral framing.',
    difficulty: 'medium',
    icon: '🔥',
    voiceSettings: { stability: 0.45, speed: 1.05 },
  },
  aggressive: {
    id: 'aggressive',
    name: 'The Aggressive Challenger',
    description: 'Direct attacks, turns, aggressive rebuttals. Pressure-heavy style.',
    difficulty: 'hard',
    icon: '⚔️',
    voiceSettings: { stability: 0.40, speed: 1.1 },
  },
  beginner: {
    id: 'beginner',
    name: 'The Beginner',
    description: 'Simpler arguments, slower pace. Perfect for learning and building confidence.',
    difficulty: 'easy',
    icon: '🌱',
    voiceSettings: { stability: 0.65, speed: 0.9 },
  },
};
```

---

## File Changes

### New Files to Create

| File | Purpose |
|------|---------|
| `server/src/bot/botManager.ts` | Orchestrates bot behavior, state machine, timing |
| `server/src/bot/speechGenerator.ts` | Gemini-powered argument/speech generation |
| `server/src/bot/characterPrompts.ts` | System prompts per character persona |
| `server/src/bot/botParticipant.ts` | Virtual participant implementation |
| `shared/src/botCharacters.ts` | Character definitions and metadata |
| `client/src/components/BotSetup.tsx` | Bot selection wizard component |
| `client/src/components/BotCharacterCard.tsx` | Character selection card UI |

### Existing Files to Modify

| File | Changes |
|------|---------|
| `shared/src/types.ts` | Add `BotCharacter`, `RoomMode`, extend `Participant` with `isBot` |
| `server/src/rooms/manager.ts` | Add `createBotRoom()` method |
| `server/src/timer/debateController.ts` | Trigger bot speech generation on transitions |
| `server/src/websocket/handlers.ts` | Bot room creation, skip speech handlers |
| `server/src/tts/elevenLabsTts.ts` | Bot character voice mappings |
| `client/src/pages/Lobby.tsx` | Redesign with side-by-side mode cards |
| `client/src/pages/Room.tsx` | Bot status indicators, skip button |
| `client/src/hooks/useWebSocket.ts` | Bot message handlers |
| `client/src/stores/roomStore.ts` | Bot-related state |

---

## Bot Speech Generation

### Base System Prompt

```text
You are a Lincoln-Douglas debate competitor. Generate debate speeches.

RESOLUTION: {resolution}
YOUR SIDE: {AFF/NEG}
CURRENT SPEECH: {AC/NC/1AR/NR/2AR}
OPPONENT'S ARGUMENTS: {from flow state}
YOUR PRIOR ARGUMENTS: {from flow state}

Generate content appropriate for the speech type:
- AC: Value, criterion, 2-3 contentions with claims, warrants, impacts
- NC: Value, criterion, contentions + responses to AC
- 1AR: Rebuild AC, respond to NC attacks
- NR: Extend NC, respond to 1AR, crystallize
- 2AR: Final defense, voting issues, impact comparison

Output: Natural speech text for TTS. Include rhetorical transitions.
```

### Character-Specific Prompts

**The Scholar:**
```text
CHARACTER: You are "The Scholar" - methodical, evidence-focused.

STYLE:
- Emphasize logical structure and analytical precision
- Use phrases like "The evidence demonstrates...", "Logically..."
- Focus heavily on warrants - explain WHY claims are true
- Cite studies, philosophers, historical examples
- Measured, professorial tone
- Avoid emotional appeals; rely on logic
- Use signposting: "First...", "Second...", "Therefore..."
```

**The Passionate Advocate:**
```text
CHARACTER: You are "The Passionate Advocate" - values-driven, compelling.

STYLE:
- Lead with moral and ethical framing
- Use phrases like "We have a moral obligation...", "Justice demands..."
- Paint vivid pictures of impacts - who is helped or harmed
- Appeal to dignity, fairness, compassion
- Rhetorical questions: "How can we stand by while...?"
- Express genuine conviction and urgency
- Build to emotional crescendos in impact calculus
```

**The Aggressive Challenger:**
```text
CHARACTER: You are "The Aggressive Challenger" - direct, confrontational.

STYLE:
- Attack opponent's arguments directly and forcefully
- Use turns: "Their argument actually supports MY position"
- Identify and exploit logical weaknesses
- "My opponent fails to address...", "This argument crumbles..."
- Maintain constant pressure
- Don't just defend - constantly attack
- Identify "dropped arguments" aggressively
```

**The Beginner:**
```text
CHARACTER: You are "The Beginner" - new debater, still learning.

STYLE:
- Keep arguments simple and straightforward
- Basic value/criterion structure, not overcomplicated
- Make some minor logical gaps (nothing absurd)
- Occasionally miss response opportunities
- Simpler vocabulary, shorter sentences
- Show earnest effort but not expert-level analysis
- Don't use advanced techniques like turns
```

---

## WebSocket Message Flow

### Bot Room Creation

```
User                           Server
  |                              |
  |-- bot:room:create ---------> |  { resolution, displayName, botCharacter, userSide, language }
  |                              |
  |                              |  1. Create room with mode='practice'
  |                              |  2. Add user as participant
  |                              |  3. Add bot as virtual participant (opposite side)
  |                              |  4. Set room status to 'ready'
  |                              |
  |<------- room:state --------- |  { room with bot, mode='practice' }
```

### Debate Flow (User is AFF)

```
User                           Server                        Bot Logic
  |                              |                              |
  |-- room:start --------------> |                              |
  |<-- speech:start (AC) ------- |                              |
  |                              |                              |
  |   [User speaks AC]           |                              |
  |-- audio:chunk --------------> |                              |
  |<-- stt:final --------------- |                              |
  |                              |   [Pre-generate NC content]  |
  |                              |                              |
  |-- speech:end (AC) ---------> |                              |
  |                              |                              |
  |<-- speech:start (NC) ------- |-- trigger bot speech ------> |
  |<-- bot:speech:generating --- |                              |
  |                              |   [Generate/use cached NC]   |
  |<-- tts:start --------------- |<-- speech text ------------- |
  |<-- tts:audio_chunk --------- |<-- audio chunks ------------ |
  |<-- tts:end ----------------- |                              |
  |<-- speech:end (NC) --------- |                              |
  |                              |                              |
  |<-- speech:start (1AR) ------ |                              |
  |   [User's turn again]        |                              |
  |                              |                              |
  ... continues through 2AR ...
```

### Skip Bot Speech

```
User                           Server
  |                              |
  |   [During bot speech]        |
  |-- bot:speech:skip ---------> |
  |                              |  1. Stop TTS generation
  |                              |  2. Save partial transcript
  |                              |  3. Extract arguments
  |                              |  4. End speech early
  |<-- speech:end --------------- |
  |<-- speech:start (next) ------ |
```

---

## UI Components

### Bot Setup Wizard (`BotSetup.tsx`)

```
┌────────────────────────────────────────────────────────────┐
│  Step 1: Resolution                                        │
│  ─────────────────────                                     │
│  Enter the resolution you want to debate:                  │
│  [_______________________________________________]         │
│                                                            │
│  Popular topics:                                           │
│  [UBI is justified] [Capital punishment] [NATO expansion]  │
│                                                            │
│                                          [Next →]          │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│  Step 2: Choose Your Opponent                              │
│  ────────────────────────────                              │
│                                                            │
│  ┌────────────────┐  ┌────────────────┐                   │
│  │ 🎓             │  │ 🔥             │                   │
│  │ The Scholar    │  │ The Passionate │                   │
│  │                │  │ Advocate       │                   │
│  │ [HARD]         │  │ [MEDIUM]       │                   │
│  │ Evidence-heavy │  │ Values-focused │                   │
│  └────────────────┘  └────────────────┘                   │
│                                                            │
│  ┌────────────────┐  ┌────────────────┐                   │
│  │ ⚔️             │  │ 🌱             │                   │
│  │ The Aggressive │  │ The Beginner   │                   │
│  │ Challenger     │  │                │                   │
│  │ [HARD]         │  │ [EASY]         │                   │
│  │ Attack-focused │  │ Good for       │                   │
│  │                │  │ learning       │                   │
│  └────────────────┘  └────────────────┘                   │
│                                          [Next →]          │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│  Step 3: Pick Your Side                                    │
│  ──────────────────────                                    │
│                                                            │
│  ┌──────────────────────┐  ┌──────────────────────┐       │
│  │                      │  │                      │       │
│  │    AFFIRMATIVE       │  │     NEGATIVE         │       │
│  │                      │  │                      │       │
│  │  Defend the          │  │  Oppose the          │       │
│  │  resolution          │  │  resolution          │       │
│  │                      │  │                      │       │
│  │  You speak first     │  │  Bot speaks first    │       │
│  │  (AC → 1AR → 2AR)    │  │  (NC → NR)           │       │
│  │                      │  │                      │       │
│  └──────────────────────┘  └──────────────────────┘       │
│                                                            │
│                    [Start Debate! 🎤]                      │
└────────────────────────────────────────────────────────────┘
```

### Room.tsx Bot Indicators

```
┌────────────────────────────────────────────────────────────┐
│  Resolution: "Universal Basic Income is justified"         │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  ┌────────────────┐          ┌────────────────┐           │
│  │  YOUR VIDEO    │          │  🎓 The Scholar │           │
│  │                │          │    (BOT)        │           │
│  │                │          │                 │           │
│  │  [AFF]         │          │  [NEG]          │           │
│  └────────────────┘          └────────────────┘           │
│                                                            │
├────────────────────────────────────────────────────────────┤
│  🤖 The Scholar is speaking...                             │
│  [═══════════▶        ] 2:34 remaining                     │
│                                                            │
│  [Skip Bot Speech ⏭️]                                       │
├────────────────────────────────────────────────────────────┤
│  TRANSCRIPT                                                │
│  ──────────                                                │
│  🎓 Scholar: "The fundamental principle at stake here..."  │
└────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Foundation (COMPLETE)
**Files:** `shared/src/types.ts`, `shared/src/botCharacters.ts`, `server/src/rooms/manager.ts`, `server/src/bot/botParticipant.ts`, `server/src/websocket/handlers.ts`

- [x] Add type definitions (BotCharacter, RoomMode, extended Participant)
- [x] Create botCharacters.ts with character metadata
- [x] Add `createBotRoom()` to RoomManager
- [x] Create BotParticipant virtual participant class
- [x] Add `bot:room:create` handler in WebSocket handlers

### Phase 2: Speech Generation (COMPLETE)
**Files:** `server/src/bot/characterPrompts.ts`, `server/src/bot/speechGenerator.ts`, `server/src/bot/botManager.ts`, `server/src/timer/debateController.ts`

- [x] Create character prompt templates
- [x] Implement Gemini-powered SpeechGenerator service
- [x] Create BotManager with state machine (IDLE → LISTENING → GENERATING → SPEAKING)
- [x] Add bot trigger hooks in DebateController on speech transitions
- [ ] Test with single character (Scholar)

### Phase 3: TTS Integration (COMPLETE)
**Files:** `server/src/tts/elevenLabsTts.ts`, `server/src/bot/botManager.ts`, `server/src/websocket/handlers.ts`

- [x] Add bot character voice mappings to ElevenLabs service
- [x] Wire bot speech output through existing TTS pipeline
- [x] Add `bot:speech:generating` message broadcast
- [x] Implement skip functionality with partial argument extraction
- [x] Add pre-generation cache (start generating during opponent's speech)

### Phase 4: Frontend (COMPLETE)
**Files:** `client/src/pages/Lobby.tsx`, `client/src/components/BotSetup.tsx`, `client/src/components/BotCharacterCard.tsx`, `client/src/pages/Room.tsx`, `client/src/hooks/useWebSocket.ts`, `client/src/stores/roomStore.ts`

- [x] Redesign Lobby.tsx with side-by-side mode cards
- [x] Create BotSetup wizard (3-step flow)
- [x] Create BotCharacterCard selection component
- [x] Add bot mode indicators to Room.tsx
- [x] Add Skip Bot Speech button
- [x] Update useWebSocket for bot messages
- [x] Update roomStore for bot state

### Phase 5: Polish & Testing (PENDING)
- [ ] Test all 4 bot characters with various resolutions
- [ ] Tune character prompts for quality and distinctiveness
- [ ] Add loading states and error handling
- [ ] Performance optimization (pre-generation timing)
- [ ] End-to-end flow testing
- [ ] Mobile responsiveness for bot setup

---

## Critical Implementation Notes

### 1. Reuse Existing Infrastructure

The following components work unchanged with bot rooms:
- `DebateManager` and `TimerController` - same speech flow
- `FlowStateManager` - bot arguments tracked normally
- `ArgumentExtractor` - extracts from bot speech text
- `BallotGenerator` - generates winner as usual
- TTS pipeline - streams bot audio via `tts:audio_chunk`

### 2. Bot Arguments in Flow

Bot-generated speeches are processed through ArgumentExtractor:
- Speech text → Extract CWI structure
- Arguments added to FlowState with `speakerId = botId`
- Flow sheet displays bot arguments same as human
- Ballot considers all arguments from both sides

### 3. Pre-Generation Strategy

To minimize perceived latency:
1. After 30% of opponent's speech time elapsed, begin pre-generating bot's next speech
2. Use partial transcript + current flow state as context
3. Cache generated content
4. When bot's turn starts, use cache or regenerate if transcript changed significantly (>30% different)

### 4. Skip Handling

When user clicks "Skip Bot Speech":
1. Stop TTS audio immediately
2. Mark current bot transcript as complete (partial)
3. Run ArgumentExtractor on partial transcript
4. Add extracted arguments to flow state
5. Send `speech:end` to transition to next speech

### 5. Language Support

Bot generates speech in user's chosen language:
- No translation layer (unlike PvP cross-language mode)
- Gemini prompt specifies output language
- TTS uses language-appropriate model/voice

---

## Testing Strategy

### Unit Tests
- [ ] BotManager state machine transitions
- [ ] SpeechGenerator prompt construction
- [ ] Character-specific voice settings
- [ ] Bot participant creation

### Integration Tests
- [ ] Bot room creation flow
- [ ] Full debate cycle with bot
- [ ] Skip speech functionality
- [ ] Flow state tracking with bot arguments

### Manual Testing Checklist
- [ ] Scholar generates evidence-heavy arguments
- [ ] Passionate Advocate uses emotional appeals
- [ ] Aggressive Challenger attacks directly
- [ ] Beginner uses simpler arguments
- [ ] TTS voice matches character personality
- [ ] Skip button works mid-speech
- [ ] Flow sheet shows bot arguments
- [ ] Ballot generates correctly
- [ ] Pre-generation reduces latency

---

## Success Criteria

Milestone 5 is complete when:

1. [ ] Landing page has side-by-side "Human" vs "AI" mode selection
2. [ ] Users can select from 4 bot characters
3. [ ] Bot room creation works (resolution + character + side)
4. [ ] Bot generates contextually appropriate arguments via Gemini
5. [ ] Bot speaks using ElevenLabs TTS with character-appropriate voice
6. [ ] Each character has distinct debate style
7. [ ] Flow sheet tracks bot arguments
8. [ ] Ballot generation works for bot matches
9. [ ] Skip button ends bot speech early
10. [ ] Pre-generation keeps latency acceptable (<3s thinking time)

---

## References

### Existing Milestone Docs
- [MILESTONE_1.md](./MILESTONE_1.md) - Room + Video Infrastructure
- [MILESTONE_2.md](./MILESTONE_2.md) - Translation + Flow Sheet
- [MILESTONE_3.md](./MILESTONE_3.md) - ElevenLabs TTS
- [MILESTONE_4.md](./MILESTONE_4.md) - Emotion Preservation

### Gemini Documentation
- [Gemini API Reference](https://ai.google.dev/gemini-api/docs)
- [Prompt Engineering Guide](https://ai.google.dev/gemini-api/docs/prompting-intro)

### ElevenLabs Documentation
- [Voice Settings Best Practices](https://elevenlabs.io/docs/agents-platform/customization/voice/best-practices/conversational-voice-design)
- [Streaming TTS API](https://elevenlabs.io/docs/api-reference/text-to-speech/stream)

### Lincoln-Douglas Debate
- [NSDA LD Format](https://www.speechanddebate.org/lincoln-douglas-debate/)
