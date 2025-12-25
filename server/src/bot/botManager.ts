/**
 * Milestone 5: Bot Manager
 *
 * Orchestrates bot behavior including:
 * - Speech generation timing
 * - TTS playback coordination
 * - State management during debates
 */

import type { SpeechRole, BotCharacter, Side, LanguageCode } from '@shared/types';
import { botSpeechGenerator } from './speechGenerator.js';
import {
  getBotState,
  setBotGenerating,
  storeBotSpeech,
  getBotThinkingDelay,
  isBotTurn,
  updateBotContext,
} from './botParticipant.js';
import { roomManager } from '../rooms/manager.js';
import { flowStateManager } from '../flow/flowStateManager.js';
import { elevenLabsTTS } from '../tts/elevenLabsTts.js';
import { ttsSessionManager } from '../tts/sessionManager.js';
import { getBotCharacter } from '@shared/types';

// Type for WebSocket server broadcast function
type BroadcastFunction = (roomId: string, message: unknown) => void;

// Callback for TTS chunk handling
type TTSChunkCallback = (chunk: Buffer, index: number) => void;
type TTSCompleteCallback = () => void;
type TTSErrorCallback = (error: Error) => void;

interface BotManagerCallbacks {
  broadcastToRoom: BroadcastFunction;
  onSpeechStart: (roomId: string, speech: SpeechRole, botId: string) => void;
  onSpeechEnd: (roomId: string, speech: SpeechRole) => void;
}

class BotManager {
  private callbacks: BotManagerCallbacks | null = null;
  private activeSpeechTimers: Map<string, NodeJS.Timeout> = new Map();
  private preGeneratedSpeeches: Map<string, string> = new Map();

  /**
   * Initialize the bot manager with callbacks
   */
  initialize(callbacks: BotManagerCallbacks): void {
    this.callbacks = callbacks;
    console.log('[BotManager] Initialized');
  }

  /**
   * Check if bot manager is ready
   */
  isReady(): boolean {
    return this.callbacks !== null && botSpeechGenerator.isReady();
  }

  /**
   * Trigger the bot to give its speech
   * Called when it's the bot's turn
   */
  async triggerBotSpeech(
    roomId: string,
    speech: SpeechRole,
    onChunk: TTSChunkCallback,
    onComplete: TTSCompleteCallback,
    onError: TTSErrorCallback
  ): Promise<void> {
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
    } else {
      // Clear the pre-generated speech
      this.preGeneratedSpeeches.delete(preGenKey);
      console.log(`[BotManager] Using pre-generated ${speech} speech`);
    }

    // Store the generated speech
    storeBotSpeech(roomId, speech, speechText);

    // Add speech to flow transcripts (for argument extraction)
    flowStateManager.addTranscript(roomId, speech, speechText);

    // Notify clients that speech is ready
    this.callbacks.broadcastToRoom(roomId, {
      type: 'bot:speech:ready',
      payload: {
        speechRole: speech,
        speechText,
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

    // Queue TTS with bot's voice settings
    ttsSessionManager.queueTTS(
      botId,
      roomId,
      speech,
      {
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
      },
      onChunk,
      () => {
        setBotGenerating(roomId, false);
        onComplete();
      },
      (error) => {
        setBotGenerating(roomId, false);
        onError(error);
      }
    );
  }

  /**
   * Pre-generate the next bot speech during opponent's turn
   */
  async preGenerateNextSpeech(roomId: string, nextSpeech: SpeechRole): Promise<void> {
    const botState = getBotState(roomId);
    if (!botState) return;

    // Only pre-generate if this is the bot's speech
    if (!isBotTurn(nextSpeech, botState.side)) return;

    const room = roomManager.getRoom(roomId);
    if (!room) return;

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
   * Stop current bot speech (when user skips)
   */
  stopBotSpeech(roomId: string): void {
    const timer = this.activeSpeechTimers.get(roomId);
    if (timer) {
      clearTimeout(timer);
      this.activeSpeechTimers.delete(roomId);
    }

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
  cleanupRoom(roomId: string): void {
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
  private getBotVoice(character: BotCharacter, language: LanguageCode): string {
    // Use default voices mapped by character type
    // These will be customized per character in elevenLabsTts.ts
    const defaultVoice = elevenLabsTTS.getDefaultVoice(language);
    return defaultVoice?.voiceId || 'default';
  }

  /**
   * Get dominant emotion for character's speaking style
   */
  private getCharacterEmotion(character: BotCharacter): 'neutral' | 'confident' | 'passionate' | 'aggressive' | 'measured' | 'uncertain' {
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
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const botManager = new BotManager();
