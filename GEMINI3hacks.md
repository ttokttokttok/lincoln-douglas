The Gemini 3 API represents a significant shift toward advanced reasoning and agentic workflows. If you are building for the hackathon, you'll want to focus on these four core pillars that define the new API:

1. Deep Think & Reasoning Control
The defining feature of Gemini 3 is its ability to "think" before it speaks.

thinking_level Parameter: You can now programmatically adjust the model's internal reasoning depth. Use high for complex scientific/coding tasks and minimal (on Gemini 3 Flash) for low-latency chat.

Thought Signatures: The API now returns encrypted "thought signatures" (e.g., <Sig_A>). To maintain a consistent chain of reasoning in multi-turn agentic workflows, you must pass these signatures back to the model in subsequent calls.

2. High-Fidelity Multimodality
Gemini 3 moves from simple object recognition to temporal and spatial reasoning.

Media Resolution Control: Use the media_resolution parameter (low, medium, high) to manage the trade-off between detail (like reading small text in a 4K image) and token cost/latency.

Native Video & Audio: The model treats video as a temporal stream, allowing it to understand "why" something happened over time (e.g., analyzing a golf swing or tracking objects across frames) rather than just identifying a still image.

3. Agentic Development Tools
The API is designed for "vibe coding" and autonomous agents that do more than just chat.

Grounding with URL & Search: You can now combine Grounding with Google Search or specific URL Context with Structured Outputs (JSON) in a single call. This is perfect for agents that need to fetch live web data and immediately parse it into a database-ready format.

Advanced Tool Use: Improved foundation for function calling and tool use, designed to handle simultaneous, multi-step tasks (e.g., checking a flight and booking a taxi in one logical sequence).

Gemini CLI & Bash Tools: New client-side and server-side bash tools allow the model to propose and execute shell commands to navigate filesystems and automate system operations.

4. New Model Family Members
Gemini 3 Pro: The "frontier" model optimized for complex reasoning, advanced math, and large-scale agentic coding.

Gemini 3 Flash: Offers Pro-level intelligence with significantly lower latency and cost. It is the go-to for responsive, real-time applications.

Nano Banana: A state-of-the-art native image generation and editing model (available on Android and via API) that supports 4K output and iterative editing through "thinking."

Veo 3: The latest video generation model with native audio, capable of creating cinematic 8-second clips with synchronized sound.