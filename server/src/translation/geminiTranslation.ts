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
   * Includes retry logic for transient API failures
   */
  async translate(
    text: string,
    sourceLanguage: LanguageCode,
    targetLanguage: LanguageCode,
    context: TranslationContext,
    retryCount = 0
  ): Promise<TranslationResult | null> {
    const MAX_RETRIES = 2;

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

      // If cleanTranslation returned empty (prompt leakage), treat as failed
      if (!translatedText) {
        console.warn(`[Translation] Empty result after cleaning, returning original text`);
        return {
          translatedText: text, // Return original text as fallback
          latencyMs,
        };
      }

      console.log(`[Translation] ${sourceLanguage}→${targetLanguage} in ${latencyMs}ms: "${translatedText.substring(0, 50)}..."`);

      return {
        translatedText,
        latencyMs,
      };
    } catch (error: any) {
      console.error('[Translation] Error:', error.message || error);

      // Retry on transient failures
      if (retryCount < MAX_RETRIES) {
        const isRetryable =
          error.message?.includes('503') ||
          error.message?.includes('429') ||
          error.message?.includes('timeout') ||
          error.message?.includes('ECONNRESET') ||
          error.message?.includes('network');

        if (isRetryable) {
          const delayMs = Math.pow(2, retryCount) * 500; // Exponential backoff: 500ms, 1s, 2s
          console.log(`[Translation] Retrying in ${delayMs}ms... (attempt ${retryCount + 2}/${MAX_RETRIES + 1})`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          return this.translate(text, sourceLanguage, targetLanguage, context, retryCount + 1);
        }
      }

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
   * Clean up translation output and detect prompt leakage
   */
  private cleanTranslation(text: string): string {
    let cleaned = text
      .replace(/^(TRANSLATION:|Translation:)\s*/i, '')
      .replace(/^["']|["']$/g, '') // Remove surrounding quotes
      .trim();

    // Detect prompt leakage - if the output contains instruction-like text, it's invalid
    const promptLeakagePatterns = [
      /CRITICAL RULES:/i,
      /Output ONLY/i,
      /NEVER generate/i,
      /NEVER add/i,
      /preserve debate terminology/i,
      /INPUT TEXT:/i,
      /Lincoln-Douglas debate/i,
      /translate.*literally/i,
      /no quotes.*labels.*explanations/i,
    ];

    for (const pattern of promptLeakagePatterns) {
      if (pattern.test(cleaned)) {
        console.error(`[Translation] Prompt leakage detected: "${cleaned.substring(0, 100)}..."`);
        // Return empty string - caller should handle this as a failed translation
        return '';
      }
    }

    return cleaned;
  }

  /**
   * Check if service is ready
   */
  isReady(): boolean {
    return this.isInitialized;
  }
}

export const translationService = new GeminiTranslationService();

