## Inspiration

In 1858, Abraham Lincoln and Stephen Douglas stood on stages across Illinois and argued about slavery—the most consequential moral question of their time. Lincoln lost that Senate race, but the debates made him a national figure. Two years later, he was President. The arguments forged in those debates laid the intellectual groundwork for abolition.

**The Lincoln-Douglas format didn't just discuss history. It made history.**

That debate format evolved into modern Lincoln-Douglas debate—a one-on-one format focused on values, ethics, and philosophical reasoning. For over a century, it has trained Supreme Court justices, policymakers, scientists, and citizens who can think critically under pressure.

But there's always been one barrier we couldn't argue our way around: **language.**

Today's challenges—climate change, AI governance, human rights—don't stop at borders. Yet a philosophy student in Seoul has never debated a philosophy student in São Paulo. African perspectives on justice are absent from global discourse. The marketplace of ideas went global, but debate remained domestic.

**We built Debate Globally to change that.**

## What it does

Debate Globally enables real-time cross-language Lincoln-Douglas debate. Speak Korean—your opponent hears English. Speak Swahili—they hear Mandarin. 85 languages, under 1.5 seconds of latency, with emotional tone preserved.

**Core features:**
- **Real-time translation** with dual transcripts showing original and translated text
- **Emotion preservation** so rebuttals sound like rebuttals, not monotone readings
- **Automatic flow sheets** that extract arguments using Claim-Warrant-Impact structure
- **AI practice mode** with 4 distinct debate personalities (Scholar, Passionate Advocate, Aggressive Challenger, Beginner)
- **Full LD format** with timed speeches, prep time, and structured rounds
- **Auto-generated ballots** with Reason for Decision at debate end

For the first time in the 166-year history of Lincoln-Douglas debate, anyone can debate anyone—regardless of what language they speak.

## How we built it

We architected a pipeline optimized for the speed that debate demands:

1. **Audio capture** — WebRTC with AudioWorklet processing for low-latency streaming
2. **Speech-to-text** — Gemini 2.0 Flash with 5-second buffered streaming
3. **Translation** — Context-aware Gemini translation that understands debate terminology
4. **Emotion detection** — Analysis of linguistic markers, emphasis, and intensity
5. **Voice synthesis** — ElevenLabs Flash v2.5 with dynamic voice parameters based on detected emotion
6. **Argument extraction** — Structured prompting to identify claims, warrants, and impacts for the flow sheet

**Tech stack:**
- Frontend: React 18, TypeScript, Vite, Zustand, Tailwind CSS
- Backend: Node.js, Express, WebSocket (ws)
- Real-time: WebRTC for P2P video/audio, STUN/TURN for NAT traversal
- AI: Gemini 2.0 Flash (STT, translation, emotion, arguments), ElevenLabs Flash v2.5 (TTS)

## Challenges we ran into

**Latency was our biggest enemy.** In debate, a 3-second delay kills the rhythm of argumentation. We achieved ~1.0-1.5s end-to-end latency by parallelizing translation and emotion detection, using streaming TTS with chunked audio delivery, and strategic buffering.

**Emotion preservation was harder than translation.** Early versions produced flat, robotic readings of passionate rebuttals. We solved this by mapping detected emotions to ElevenLabs voice parameters—passionate speech gets lower stability and faster speed; measured arguments get higher stability and deliberate pacing.

**Debate terminology doesn't translate literally.** Phrases like "turn their argument" or "extend across the flow" needed context-aware handling. We engineered prompts that preserve debate-specific meaning across languages.

**State synchronization across distributed clients.** Coordinating timers, flow sheets, transcripts, and audio streams required careful WebSocket architecture with server-authoritative timing to keep both debaters in sync.

## Accomplishments that we're proud of

- **Sub-1.5 second latency** for the full pipeline: speech → transcription → translation → emotion detection → voice synthesis → playback
- **Emotion preservation that actually works** — a passionate rebuttal in Korean sounds passionate in English
- **85 language support** spanning every inhabited continent
- **AI practice mode** with distinct personalities that adapt to your arguments and the flow state
- **Automatic argument extraction** that builds a structured flow sheet in real-time
- **The first cross-language Lincoln-Douglas debate platform ever built**

We took a 166-year-old debate format and made it work across language barriers that have existed since the format began.

## What we learned

**Every millisecond matters in real-time communication.** We obsessed over latency at every stage of the pipeline—parallelizing where possible, streaming instead of waiting, buffering strategically.

**Emotion is half the argument.** Translation without tone preservation loses the persuasive power of speech. A rebuttal that sounds like a Wikipedia article isn't a rebuttal.

**Debate has its own language.** Technical terms, argument structures, and rhetorical patterns required specialized handling that generic translation couldn't provide.

**The technology finally exists.** Five years ago, this wasn't possible. The combination of fast LLMs, streaming TTS, and WebRTC infrastructure made real-time cross-language debate achievable for the first time.

## What's next for Debate Globally

- **Cross-Examination periods** — Adding CX for traditional LD format
- **Spectator mode** — Watch debates with translated commentary
- **Tournament system** — Brackets, rankings, and judge panels for international competition
- **Voice cloning** — Translate speech using the debater's own voice
- **Mobile apps** — iOS and Android for debate anywhere
- **Recording & replay** — Save debates for review and coaching
- **Educational partnerships** — Bringing cross-language debate to schools worldwide

The debates that shaped abolition can now address the challenges facing all of humanity. We're just getting started.
