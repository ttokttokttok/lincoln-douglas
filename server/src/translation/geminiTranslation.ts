/**
 * Gemini Translation Service
 * 
 * Provides debate-aware translation using Gemini 2.0 Flash.
 * Includes context about the debate to improve translation quality.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import type { LanguageCode, SpeechRole, Side } from '@shared/types';

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

    return `You are a real-time debate translator for a Lincoln-Douglas debate. Translate the following speech segment from ${sourceName} to ${targetName}.

CONTEXT:
- Debate Resolution: "${context.resolution}"
- Current Speech: ${speechNames[context.currentSpeech]} (${sideName} side)
- Speaker: ${context.speakerName}

REQUIREMENTS:
- Preserve rhetorical force and argumentation structure
- Maintain debate terminology (e.g., "impact", "turn", "link", "warrant", "contention", "value", "criterion")
- Keep emotional intensity markers (emphatic phrases, rhetorical questions)
- Translate idioms to culturally equivalent expressions
- Be concise — this is real-time translation, latency matters
- Output ONLY the translation, no explanations, notes, or quotes

TEXT TO TRANSLATE:
${text}

TRANSLATION:`;
  }

  /**
   * Get language name from code
   */
  private getLanguageName(code: LanguageCode): string {
    const names: Record<LanguageCode, string> = {
      en: 'English',
      ko: 'Korean',
      ja: 'Japanese',
      es: 'Spanish',
      zh: 'Chinese (Mandarin)',
    };
    return names[code];
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

