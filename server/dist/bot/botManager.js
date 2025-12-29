/**
 * Milestone 5: Bot Manager
 *
 * Orchestrates bot behavior including:
 * - Speech generation timing
 * - TTS playback coordination
 * - State management during debates
 */
import { botSpeechGenerator } from './speechGenerator.js';
import { getBotState, setBotGenerating, storeBotSpeech, getBotThinkingDelay, isBotTurn, } from './botParticipant.js';
import { roomManager } from '../rooms/manager.js';
import { flowStateManager } from '../flow/flowStateManager.js';
import { elevenLabsTTS } from '../tts/elevenLabsTts.js';
import { ttsSessionManager } from '../tts/sessionManager.js';
import { getBotCharacter } from '@shared/types';
class BotManager {
    callbacks = null;
    activeSpeechTimers = new Map();
    preGeneratedSpeeches = new Map();
    transcriptStates = new Map();
    /**
     * Initialize the bot manager with callbacks
     */
    initialize(callbacks) {
        this.callbacks = callbacks;
        console.log('[BotManager] Initialized');
    }
    /**
     * Check if bot manager is ready
     */
    isReady() {
        return this.callbacks !== null && botSpeechGenerator.isReady();
    }
    /**
     * Trigger the bot to give its speech
     * Called when it's the bot's turn
     */
    async triggerBotSpeech(roomId, speech, onChunk, onComplete, onError) {
        if (!this.isReady() || !this.callbacks) {
            console.warn('[BotManager] Not ready to trigger bot speech');
            return;
        }
        const botState = getBotState(roomId);
        if (!botState) {
            console.warn(`[BotManager] No bot state for room ${roomId}`);
            return;
        }
        const room = roomManager.getRoom(roomId);
        if (!room) {
            console.warn(`[BotManager] Room ${roomId} not found`);
            return;
        }
        // Mark bot as generating
        setBotGenerating(roomId, true, speech);
        // Notify clients that bot is generating
        this.callbacks.broadcastToRoom(roomId, {
            type: 'bot:speech:generating',
            payload: {
                speechRole: speech,
                botCharacter: botState.character,
            },
        });
        // Add thinking delay for naturalness
        const thinkingDelay = getBotThinkingDelay(botState.character);
        await this.delay(thinkingDelay);
        // Check if we have a pre-generated speech
        const preGenKey = `${roomId}:${speech}`;
        let speechText = this.preGeneratedSpeeches.get(preGenKey);
        if (!speechText) {
            // Generate the speech
            const flowState = flowStateManager.getFlowState(roomId);
            const opponentArgs = flowState?.arguments.filter(a => a.side !== botState.side) || [];
            const ownArgs = flowState?.arguments.filter(a => a.side === botState.side) || [];
            const result = await botSpeechGenerator.generateSpeech({
                resolution: room.resolution,
                speech,
                side: botState.side,
                character: botState.character,
                language: botState.language,
                opponentArguments: opponentArgs,
                ownArguments: ownArgs,
                flowTranscripts: flowState?.speechTranscripts || {},
            });
            if (!result) {
                console.error(`[BotManager] Failed to generate speech for ${speech}`);
                setBotGenerating(roomId, false);
                onError(new Error('Failed to generate bot speech'));
                return;
            }
            speechText = result.text;
        }
        else {
            // Clear the pre-generated speech
            this.preGeneratedSpeeches.delete(preGenKey);
            console.log(`[BotManager] Using pre-generated ${speech} speech`);
        }
        // Store the generated speech
        storeBotSpeech(roomId, speech, speechText);
        // Add speech to flow transcripts (for argument extraction)
        flowStateManager.addTranscript(roomId, speech, speechText);
        // Split speech into sentences for progressive transcript
        const sentences = this.splitIntoSentences(speechText);
        // Estimate playback duration: ~150 words per minute = 2.5 words per second
        const wordCount = speechText.split(/\s+/).length;
        const estimatedDurationMs = (wordCount / 2.5) * 1000; // Convert to ms
        // Initialize transcript state for progressive display
        const transcriptState = {
            sentences,
            currentIndex: 0,
            startTime: Date.now(),
            totalDurationMs: estimatedDurationMs,
            intervalId: null,
        };
        this.transcriptStates.set(roomId, transcriptState);
        // Set up time-based sentence sending
        const msPerSentence = estimatedDurationMs / sentences.length;
        console.log(`[BotManager] Transcript: ${sentences.length} sentences over ~${Math.round(estimatedDurationMs / 1000)}s (${Math.round(msPerSentence)}ms each)`);
        // Start sending sentences at timed intervals
        transcriptState.intervalId = setInterval(() => {
            const state = this.transcriptStates.get(roomId);
            if (!state || !this.callbacks) {
                if (state?.intervalId)
                    clearInterval(state.intervalId);
                return;
            }
            if (state.currentIndex < state.sentences.length) {
                this.callbacks.broadcastToRoom(roomId, {
                    type: 'bot:transcript:chunk',
                    payload: {
                        sentence: state.sentences[state.currentIndex],
                        index: state.currentIndex,
                        total: state.sentences.length,
                        isFinal: state.currentIndex === state.sentences.length - 1,
                    },
                });
                state.currentIndex++;
            }
            // Stop interval when all sentences sent
            if (state.currentIndex >= state.sentences.length && state.intervalId) {
                clearInterval(state.intervalId);
                state.intervalId = null;
            }
        }, msPerSentence);
        // Send first sentence immediately
        if (sentences.length > 0 && this.callbacks) {
            this.callbacks.broadcastToRoom(roomId, {
                type: 'bot:transcript:chunk',
                payload: {
                    sentence: sentences[0],
                    index: 0,
                    total: sentences.length,
                    isFinal: sentences.length === 1,
                },
            });
            transcriptState.currentIndex = 1;
        }
        // Notify clients that speech is ready (but don't send full text - we'll stream it)
        this.callbacks.broadcastToRoom(roomId, {
            type: 'bot:speech:ready',
            payload: {
                speechRole: speech,
                speechText: '', // Empty - will stream progressively
                totalSentences: sentences.length,
            },
        });
        // Get TTS voice for bot character
        const voiceId = this.getBotVoice(botState.character, botState.language);
        const characterInfo = getBotCharacter(botState.character);
        // Start TTS generation and playback
        console.log(`[BotManager] Starting TTS for ${speech} (${speechText.length} chars)`);
        const botId = roomManager.getBotParticipantId(roomId);
        if (!botId) {
            onError(new Error('Bot participant not found'));
            return;
        }
        // Notify clients that TTS is starting (required for audio playback initialization)
        this.callbacks.broadcastToRoom(roomId, {
            type: 'tts:start',
            payload: {
                speakerId: botId,
                speechId: speech,
                text: speechText,
            },
        });
        // Signal that TTS is ready - this starts the speech timer
        this.callbacks.onTTSReady(roomId);
        // Queue TTS with bot's voice settings
        // Note: Progressive transcript is now sent via time-based intervals, not chunk-based
        ttsSessionManager.queueTTS(botId, roomId, speech, {
            text: speechText,
            voiceId,
            targetLanguage: botState.language,
            emotionHints: {
                dominantEmotion: this.getCharacterEmotion(botState.character),
                intensity: 0.7,
                confidence: 0.8,
                suggestedSettings: {
                    stability: characterInfo.voiceSettings.stability,
                    similarity_boost: 0.75,
                    style: 0,
                    speed: characterInfo.voiceSettings.speed,
                    use_speaker_boost: true,
                },
            },
        }, onChunk, // Just forward audio chunks
        () => {
            // TTS generation complete - but transcript is time-based, don't stop it here
            // The transcript interval will continue until all sentences sent or speech ends
            setBotGenerating(roomId, false);
            onComplete();
        }, (error) => {
            // On error, clean up the transcript interval
            this.cleanupTranscriptState(roomId);
            setBotGenerating(roomId, false);
            onError(error);
        });
    }
    /**
     * Pre-generate the next bot speech during opponent's turn
     */
    async preGenerateNextSpeech(roomId, nextSpeech) {
        const botState = getBotState(roomId);
        if (!botState)
            return;
        // Only pre-generate if this is the bot's speech
        if (!isBotTurn(nextSpeech, botState.side))
            return;
        const room = roomManager.getRoom(roomId);
        if (!room)
            return;
        console.log(`[BotManager] Pre-generating ${nextSpeech} for room ${roomId}`);
        const flowState = flowStateManager.getFlowState(roomId);
        const opponentArgs = flowState?.arguments.filter(a => a.side !== botState.side) || [];
        const ownArgs = flowState?.arguments.filter(a => a.side === botState.side) || [];
        const result = await botSpeechGenerator.generateSpeech({
            resolution: room.resolution,
            speech: nextSpeech,
            side: botState.side,
            character: botState.character,
            language: botState.language,
            opponentArguments: opponentArgs,
            ownArguments: ownArgs,
            flowTranscripts: flowState?.speechTranscripts || {},
        });
        if (result) {
            const preGenKey = `${roomId}:${nextSpeech}`;
            this.preGeneratedSpeeches.set(preGenKey, result.text);
            console.log(`[BotManager] Pre-generated ${nextSpeech} (${result.wordCount} words)`);
        }
    }
    /**
     * Clean up transcript interval and state
     */
    cleanupTranscriptState(roomId) {
        const state = this.transcriptStates.get(roomId);
        if (state) {
            if (state.intervalId) {
                clearInterval(state.intervalId);
                state.intervalId = null;
            }
            this.transcriptStates.delete(roomId);
        }
    }
    /**
     * Stop current bot speech (when timer ends or user skips)
     */
    stopBotSpeech(roomId) {
        const timer = this.activeSpeechTimers.get(roomId);
        if (timer) {
            clearTimeout(timer);
            this.activeSpeechTimers.delete(roomId);
        }
        // Clean up transcript interval
        this.cleanupTranscriptState(roomId);
        const botId = roomManager.getBotParticipantId(roomId);
        if (botId) {
            ttsSessionManager.clearQueue(botId);
        }
        setBotGenerating(roomId, false);
        console.log(`[BotManager] Stopped bot speech in room ${roomId}`);
    }
    /**
     * Clean up when a bot room ends
     */
    cleanupRoom(roomId) {
        this.stopBotSpeech(roomId);
        // Clear any pre-generated speeches for this room
        for (const key of this.preGeneratedSpeeches.keys()) {
            if (key.startsWith(roomId)) {
                this.preGeneratedSpeeches.delete(key);
            }
        }
        console.log(`[BotManager] Cleaned up room ${roomId}`);
    }
    /**
     * Get appropriate TTS voice for bot character
     */
    getBotVoice(character, language) {
        // Use default voices mapped by character type
        // These will be customized per character in elevenLabsTts.ts
        const defaultVoice = elevenLabsTTS.getDefaultVoice(language);
        return defaultVoice?.voiceId || 'default';
    }
    /**
     * Get dominant emotion for character's speaking style
     */
    getCharacterEmotion(character) {
        switch (character) {
            case 'scholar': return 'measured';
            case 'passionate': return 'passionate';
            case 'aggressive': return 'aggressive';
            case 'beginner': return 'uncertain';
            default: return 'neutral';
        }
    }
    /**
     * Helper to create a delay
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    /**
     * Split text into sentences for progressive display
     */
    splitIntoSentences(text) {
        // Split on sentence boundaries (. ! ?)
        // Keep the punctuation with the sentence
        const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0);
        // If we have very few sentences (long compound sentences), split on commas/semicolons too
        if (sentences.length < 10) {
            const result = [];
            for (const sentence of sentences) {
                // Split long sentences on commas/semicolons if > 100 chars
                if (sentence.length > 100) {
                    const parts = sentence.split(/(?<=[,;])\s+/).filter(s => s.trim().length > 0);
                    result.push(...parts);
                }
                else {
                    result.push(sentence);
                }
            }
            return result;
        }
        return sentences;
    }
}
// Export singleton instance
export const botManager = new BotManager();
//# sourceMappingURL=botManager.js.map