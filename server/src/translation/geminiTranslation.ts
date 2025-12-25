/**
 * Gemini Translation Service
 * 
 * Provides debate-aware translation using Gemini 2.0 Flash.
 * Includes context about the debate to improve translation quality.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import type { LanguageCode, SpeechRole, Side } from '@shared/types';
import { LANGUAGES } from '@shared/types';

interface TranslationContext {
  resolution: string;
  currentSpeech: SpeechRole;
  speakerSide: Side;
  speakerName: string;
}

interface TranslationResult {
  translatedText: string;
  latencyMs: number;
}

class GeminiTranslationService {
  private genAI: GoogleGenerativeAI | null = null;
  private model: ReturnType<GoogleGenerativeAI['getGenerativeModel']> | null = null;
  private isInitialized = false;

  /**
   * Initialize the translation service
   */
  initialize(): boolean {
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      console.warn('[Translation] GEMINI_API_KEY not set - translation disabled');
      return false;
    }

    try {
      this.genAI = new GoogleGenerativeAI(apiKey);
      this.model = this.genAI.getGenerativeModel({
        model: 'gemini-2.0-flash',
        generationConfig: {
          temperature: 0.3,  // Lower for consistent translations
          maxOutputTokens: 1024,
        },
      });
      this.isInitialized = true;
      console.log('[Translation] Initialized successfully');
      return true;
    } catch (error) {
      console.error('[Translation] Failed to initialize:', error);
      return false;
    }
  }

  /**
   * Translate text from source to target language with debate context
   */
  async translate(
    text: string,
    sourceLanguage: LanguageCode,
    targetLanguage: LanguageCode,
    context: TranslationContext
  ): Promise<TranslationResult | null> {
    if (!this.isInitialized || !this.model) {
      console.warn('[Translation] Not initialized, skipping translation');
      return null;
    }

    // Don't translate if languages are the same
    if (sourceLanguage === targetLanguage) {
      return {
        translatedText: text,
        latencyMs: 0,
      };
    }

    // IMPORTANT: Skip translation for very short/empty text to prevent Gemini from generating content
    // Gemini sometimes "fills in" content when given minimal input like "." or single characters
    const trimmedText = text.trim();
    if (trimmedText.length < 3 || /^[.\s,!?]+$/.test(trimmedText)) {
      console.log(`[Translation] Skipping minimal text: "${trimmedText}"`);
      return {
        translatedText: trimmedText,
        latencyMs: 0,
      };
    }

    const startTime = Date.now();

    const prompt = this.buildTranslationPrompt(text, sourceLanguage, targetLanguage, context);

    try {
      const result = await this.model.generateContent(prompt);
      const translatedText = this.cleanTranslation(result.response.text());
      const latencyMs = Date.now() - startTime;

      console.log(`[Translation] ${sourceLanguage}→${targetLanguage} in ${latencyMs}ms: "${translatedText.substring(0, 50)}..."`);

      return {
        translatedText,
        latencyMs,
      };
    } catch (error: any) {
      console.error('[Translation] Error:', error.message || error);
      return null;
    }
  }

  /**
   * Build a context-aware translation prompt
   */
  private buildTranslationPrompt(
    text: string,
    sourceLanguage: LanguageCode,
    targetLanguage: LanguageCode,
    context: TranslationContext
  ): string {
    const sourceName = this.getLanguageName(sourceLanguage);
    const targetName = this.getLanguageName(targetLanguage);
    const sideName = context.speakerSide === 'AFF' ? 'Affirmative' : 'Negative';
    const speechNames: Record<SpeechRole, string> = {
      AC: 'Affirmative Constructive',
      NC: 'Negative Constructive',
      '1AR': 'First Affirmative Rebuttal',
      NR: 'Negative Rebuttal',
      '2AR': 'Second Affirmative Rebuttal',
    };

    return `Translate this ${sourceName} text to ${targetName}. This is from a Lincoln-Douglas debate.

CRITICAL RULES:
- Output ONLY the direct translation of the input text
- NEVER generate, add, or invent any content not present in the original
- NEVER add arguments, examples, or elaborations
- If the input is short (e.g., "Yes", "Thank you"), translate it literally - do NOT expand it
- Preserve debate terminology: impact, turn, link, warrant, contention, value, criterion
- Output ONLY the translation - no quotes, labels, or explanations

INPUT TEXT:
${text}

TRANSLATION:`;
  }

  /**
   * Get language name from code
   */
  private getLanguageName(code: LanguageCode): string {
    const lang = LANGUAGES.find(l => l.code === code);
    return lang?.name || code;
  }

  /**
   * Clean up translation output
   */
  private cleanTranslation(text: string): string {
    return text
      .replace(/^(TRANSLATION:|Translation:)\s*/i, '')
      .replace(/^["']|["']$/g, '') // Remove surrounding quotes
      .trim();
  }

  /**
   * Check if service is ready
   */
  isReady(): boolean {
    return this.isInitialized;
  }
}

export const translationService = new GeminiTranslationService();

