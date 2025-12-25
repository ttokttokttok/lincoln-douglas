/**
 * Milestone 5: Bot Speech Generator
 *
 * Uses Gemini to generate debate speeches based on
 * character persona and debate context.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import type { BotCharacter, SpeechRole, Side, Argument, LanguageCode } from '@shared/types';
import {
  generateSystemPrompt,
  generateUserPrompt,
  getTargetWordCount,
} from './characterPrompts.js';

interface SpeechGenerationContext {
  resolution: string;
  speech: SpeechRole;
  side: Side;
  character: BotCharacter;
  language: LanguageCode;
  opponentArguments: Argument[];
  ownArguments: Argument[];
  flowTranscripts: Record<string, string>;
}

interface SpeechGenerationResult {
  text: string;
  generationTimeMs: number;
  wordCount: number;
}

class BotSpeechGenerator {
  private genAI: GoogleGenerativeAI | null = null;
  private model: ReturnType<GoogleGenerativeAI['getGenerativeModel']> | null = null;
  private isInitialized = false;

  /**
   * Initialize the speech generator
   */
  initialize(): boolean {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.warn('[BotSpeech] GEMINI_API_KEY not set - bot speech generation disabled');
      return false;
    }

    try {
      this.genAI = new GoogleGenerativeAI(apiKey);
      this.model = this.genAI.getGenerativeModel({
        model: 'gemini-2.0-flash',
        generationConfig: {
          temperature: 0.8,  // Higher for creative, natural speech
          maxOutputTokens: 4096,  // Allow for longer speeches
          topP: 0.95,
          topK: 40,
        },
      });
      this.isInitialized = true;
      console.log('[BotSpeech] Initialized successfully');
      return true;
    } catch (error) {
      console.error('[BotSpeech] Failed to initialize:', error);
      return false;
    }
  }

  /**
   * Check if service is ready
   */
  isReady(): boolean {
    return this.isInitialized && this.model !== null;
  }

  /**
   * Generate a debate speech for the bot
   */
  async generateSpeech(context: SpeechGenerationContext): Promise<SpeechGenerationResult | null> {
    if (!this.isReady() || !this.model) {
      console.warn('[BotSpeech] Not initialized, cannot generate speech');
      return null;
    }

    const startTime = Date.now();

    try {
      // Build the prompts
      const systemPrompt = generateSystemPrompt(
        context.character,
        context.speech,
        context.side
      );

      const userPrompt = generateUserPrompt(
        context.resolution,
        context.speech,
        context.opponentArguments,
        context.ownArguments,
        context.flowTranscripts
      );

      // Add language instruction if not English
      let languageInstruction = '';
      if (context.language !== 'en') {
        languageInstruction = `\n\nIMPORTANT: Generate the speech in ${getLanguageName(context.language)}. Do not use English.`;
      }

      // Get target word count for calibration
      const targetWords = getTargetWordCount(context.speech);
      const wordCountInstruction = `\n\nTarget approximately ${targetWords.min}-${targetWords.max} words for this speech.`;

      const fullPrompt = `${systemPrompt}${languageInstruction}${wordCountInstruction}\n\n${userPrompt}`;

      console.log(`[BotSpeech] Generating ${context.speech} for ${context.character} (${context.side})...`);

      // Generate the speech
      const result = await this.model.generateContent(fullPrompt);
      const response = result.response;
      const text = response.text();

      if (!text) {
        console.error('[BotSpeech] Empty response from Gemini');
        return null;
      }

      const generationTimeMs = Date.now() - startTime;
      const wordCount = text.split(/\s+/).length;

      console.log(`[BotSpeech] Generated ${wordCount} words in ${generationTimeMs}ms`);

      return {
        text: cleanSpeechText(text),
        generationTimeMs,
        wordCount,
      };
    } catch (error) {
      console.error('[BotSpeech] Generation error:', error);
      return null;
    }
  }

  /**
   * Generate a simple opening statement (for AC/NC without prior context)
   */
  async generateOpeningSpeech(
    resolution: string,
    speech: 'AC' | 'NC',
    side: Side,
    character: BotCharacter,
    language: LanguageCode
  ): Promise<SpeechGenerationResult | null> {
    return this.generateSpeech({
      resolution,
      speech,
      side,
      character,
      language,
      opponentArguments: [],
      ownArguments: [],
      flowTranscripts: {},
    });
  }

  /**
   * Pre-generate the next bot speech during opponent's turn
   * This reduces latency when it's the bot's turn to speak
   */
  async preGenerateSpeech(
    roomId: string,
    context: SpeechGenerationContext
  ): Promise<SpeechGenerationResult | null> {
    console.log(`[BotSpeech] Pre-generating ${context.speech} for room ${roomId}`);
    return this.generateSpeech(context);
  }
}

/**
 * Clean up generated speech text
 * Removes any unwanted formatting or artifacts
 */
function cleanSpeechText(text: string): string {
  return text
    // Remove any markdown formatting
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/_/g, '')
    .replace(/#{1,6}\s/g, '')
    // Remove any stage directions in brackets
    .replace(/\[.*?\]/g, '')
    .replace(/\(.*?\)/g, '')
    // Remove extra whitespace
    .replace(/\n{3,}/g, '\n\n')
    .replace(/  +/g, ' ')
    .trim();
}

/**
 * Get language name for prompting
 */
function getLanguageName(code: LanguageCode): string {
  const languageNames: Record<string, string> = {
    en: 'English',
    es: 'Spanish',
    fr: 'French',
    de: 'German',
    it: 'Italian',
    pt: 'Portuguese',
    ru: 'Russian',
    zh: 'Chinese',
    ja: 'Japanese',
    ko: 'Korean',
    ar: 'Arabic',
    hi: 'Hindi',
    // Add more as needed
  };
  return languageNames[code] || 'English';
}

// Export singleton instance
export const botSpeechGenerator = new BotSpeechGenerator();
