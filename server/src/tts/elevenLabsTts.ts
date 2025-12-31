/**
 * ElevenLabs TTS Service
 *
 * Provides streaming text-to-speech synthesis using ElevenLabs API.
 * Optimized for low-latency debate translation playback.
 *
 * Based on ElevenLabs best practices:
 * - https://elevenlabs.io/docs/agents-platform/customization/voice/best-practices/conversational-voice-design
 * - https://elevenlabs.io/docs/agents-platform/best-practices/prompting-guide
 */

import {
  LanguageCode,
  VoiceConfig,
  VoiceSettings,
  EmotionMarkers,
  BotCharacter,
} from '@shared/types';

interface ElevenLabsConfig {
  apiKey: string;
  modelId: string;
  outputFormat: string;
  baseUrl: string;
}

interface GenerateOptions {
  text: string;
  voiceId: string;
  voiceSettings?: Partial<VoiceSettings>;
  onChunk: (chunk: Buffer) => void;
  onComplete: () => void;
  onError: (error: Error) => void;
}

class ElevenLabsTTSService {
  private config: ElevenLabsConfig | null = null;
  private isInitialized = false;
  private presetVoices: Map<LanguageCode, VoiceConfig[]> = new Map();

  /**
   * Initialize the TTS service with API key from environment
   */
  initialize(): boolean {
    const apiKey = process.env.ELEVENLABS_API_KEY;

    if (!apiKey) {
      console.warn('[ElevenLabsTTS] ELEVENLABS_API_KEY not set - TTS service disabled');
      return false;
    }

    this.config = {
      apiKey,
      modelId: 'eleven_flash_v2_5',  // Flash for lowest latency (~75ms)
      outputFormat: 'mp3_44100_64',  // Balance of quality and bandwidth
      baseUrl: 'https://api.elevenlabs.io',  // Use standard endpoint for now
    };

    this.initializePresetVoices();
    this.isInitialized = true;
    console.log('[ElevenLabsTTS] Service initialized successfully');
    console.log(`[ElevenLabsTTS] Using model: ${this.config.modelId}`);
    return true;
  }

  /**
   * Check if service is ready
   */
  isReady(): boolean {
    return this.isInitialized && this.config !== null;
  }

  /**
   * Initialize preset voices for each supported language
   * These are curated ElevenLabs voices for debate clarity
   */
  private initializePresetVoices(): void {
    // English voices - verified from ElevenLabs library
    this.presetVoices.set('en', [
      {
        voiceId: 'EXAVITQu4vr4xnSDxMaL',
        name: 'Sarah',
        language: 'en',
        labels: { gender: 'female', accent: 'american', use_case: 'professional' },
      },
      {
        voiceId: 'TX3LPaxmHKxFdv7VOQHJ',
        name: 'Liam',
        language: 'en',
        labels: { gender: 'male', accent: 'american', use_case: 'authoritative' },
      },
      {
        voiceId: 'XB0fDUnXU5powFXDhCwa',
        name: 'Charlotte',
        language: 'en',
        labels: { gender: 'female', accent: 'british', use_case: 'articulate' },
      },
    ]);

    // Korean voices - will need verification during testing
    this.presetVoices.set('ko', [
      {
        voiceId: 'jBpfuIE2acCO8z3wKNLl',
        name: 'Gigi',
        language: 'ko',
        labels: { gender: 'female', use_case: 'natural' },
      },
    ]);

    // Spanish voices
    this.presetVoices.set('es', [
      {
        voiceId: 'XrExE9yKIg1WjnnlVkGX',
        name: 'Matilda',
        language: 'es',
        labels: { gender: 'female', accent: 'neutral', use_case: 'professional' },
      },
    ]);

    // Japanese voices
    this.presetVoices.set('ja', [
      {
        voiceId: 'ThT5KcBeYPX3keUQqHPh',
        name: 'Dorothy',
        language: 'ja',
        labels: { gender: 'female', use_case: 'clear' },
      },
    ]);

    // Chinese voices
    this.presetVoices.set('zh', [
      {
        voiceId: 'ThT5KcBeYPX3keUQqHPh',
        name: 'Dorothy',
        language: 'zh',
        labels: { gender: 'female', use_case: 'clear' },
      },
    ]);

    // French voices
    this.presetVoices.set('fr', [
      {
        voiceId: 'XrExE9yKIg1WjnnlVkGX',
        name: 'Matilda',
        language: 'fr',
        labels: { gender: 'female', use_case: 'professional' },
      },
    ]);

    // German voices
    this.presetVoices.set('de', [
      {
        voiceId: 'XrExE9yKIg1WjnnlVkGX',
        name: 'Matilda',
        language: 'de',
        labels: { gender: 'female', use_case: 'professional' },
      },
    ]);

    console.log(`[ElevenLabsTTS] Loaded preset voices for ${this.presetVoices.size} languages`);
  }

  /**
   * Get preset voices for a language
   */
  getPresetVoices(language: LanguageCode): VoiceConfig[] {
    return this.presetVoices.get(language) || this.presetVoices.get('en') || [];
  }

  /**
   * Get all available languages with preset voices
   */
  getAvailableLanguages(): LanguageCode[] {
    return Array.from(this.presetVoices.keys());
  }

  /**
   * Get default voice for a language
   */
  getDefaultVoice(language: LanguageCode): VoiceConfig | null {
    const voices = this.getPresetVoices(language);
    return voices[0] || null;
  }

  /**
   * Generate streaming TTS audio
   */
  async generateStream(options: GenerateOptions): Promise<void> {
    if (!this.isReady() || !this.config) {
      options.onError(new Error('ElevenLabs TTS service not initialized'));
      return;
    }

    const { text, voiceId, voiceSettings, onChunk, onComplete, onError } = options;

    // Default settings optimized for debate context
    // Based on: https://elevenlabs.io/docs/agents-platform/customization/voice/best-practices/conversational-voice-design
    const defaultSettings: VoiceSettings = {
      stability: 0.55,          // Balance between expressive and reliable
      similarity_boost: 0.75,   // Good clarity without distortion risk
      style: 0,                 // ALWAYS 0 - ElevenLabs recommends this for stability
      speed: 1.0,               // Natural conversation pace
      use_speaker_boost: true,  // Enhanced voice clarity
    };

    const settings: VoiceSettings = {
      ...defaultSettings,
      ...voiceSettings,
      style: 0,  // Force style to 0 regardless of input
    };

    // Preprocess text for natural TTS output
    const processedText = this.preprocessForTTS(text);

    if (!processedText.trim()) {
      console.warn('[ElevenLabsTTS] Empty text after preprocessing, skipping TTS');
      onComplete();
      return;
    }

    try {
      // Build URL with latency optimization
      const url = new URL(
        `${this.config.baseUrl}/v1/text-to-speech/${voiceId}/stream`
      );
      url.searchParams.set('optimize_streaming_latency', '3');  // Max optimization
      url.searchParams.set('output_format', this.config.outputFormat);

      console.log(`[ElevenLabsTTS] Generating TTS for ${processedText.length} chars with voice ${voiceId}`);

      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': this.config.apiKey,
        },
        body: JSON.stringify({
          text: processedText,
          model_id: this.config.modelId,
          voice_settings: {
            stability: settings.stability,
            similarity_boost: settings.similarity_boost,
            style: 0,  // Always 0
            use_speaker_boost: settings.use_speaker_boost,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
      }

      if (!response.body) {
        throw new Error('No response body from ElevenLabs');
      }

      // Process streaming response
      const reader = response.body.getReader();
      let totalBytes = 0;

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          console.log(`[ElevenLabsTTS] Stream complete, total bytes: ${totalBytes}`);
          onComplete();
          break;
        }

        if (value) {
          totalBytes += value.length;
          onChunk(Buffer.from(value));
        }
      }
    } catch (error) {
      console.error('[ElevenLabsTTS] Generation error:', error);
      onError(error as Error);
    }
  }

  /**
   * Preprocess text for natural TTS output
   * Based on: https://elevenlabs.io/docs/agents-platform/best-practices/prompting-guide
   */
  private preprocessForTTS(text: string): string {
    let processed = text;

    // Normalize special characters for speech
    processed = processed
      .replace(/@/g, ' at ')
      .replace(/\.com\b/g, ' dot com')
      .replace(/\.org\b/g, ' dot org')
      .replace(/\.net\b/g, ' dot net')
      .replace(/\.io\b/g, ' dot I O')
      .replace(/https?:\/\//g, '');

    // Handle common abbreviations
    processed = processed
      .replace(/\bvs\.?\b/gi, 'versus')
      .replace(/\be\.g\.\b/gi, 'for example')
      .replace(/\bi\.e\.\b/gi, 'that is')
      .replace(/\betc\.\b/gi, 'et cetera');

    // Add SSML pauses after debate transition phrases (Flash v2.5 supports <break> tags)
    const transitionPhrases = [
      'First,', 'Second,', 'Third,', 'Finally,',
      'In conclusion,', 'Furthermore,', 'Moreover,',
      'However,', 'Therefore,', 'Consequently,',
      'On the other hand,', 'In contrast,',
      'My opponent argues,', 'The resolution states,',
      'I contend that,', 'The evidence shows,',
    ];

    for (const phrase of transitionPhrases) {
      const regex = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      processed = processed.replace(regex, `${phrase} <break time="0.3s"/>`);
    }

    // Clean up multiple spaces
    processed = processed.replace(/\s+/g, ' ').trim();

    // Validate length (Flash/Turbo max: 40,000 chars)
    if (processed.length > 40000) {
      console.warn('[ElevenLabsTTS] Text exceeds 40K limit, truncating');
      processed = processed.slice(0, 39900) + '...';
    }

    return processed;
  }

  /**
   * Map emotion markers to voice settings
   * SIMPLIFIED: Only adjust stability and speed, keep style at 0
   * Per ElevenLabs: "We recommend keeping style at 0 at all times"
   */
  mapEmotionToSettings(emotion: EmotionMarkers): VoiceSettings {
    // Only adjust stability and speed based on emotion - never touch style
    const emotionMappings: Record<string, { stability: number; speed: number }> = {
      confident:   { stability: 0.60, speed: 1.0 },   // Steady, normal pace
      passionate:  { stability: 0.45, speed: 1.05 },  // More dynamic, slightly faster
      aggressive:  { stability: 0.40, speed: 1.1 },   // Most dynamic, faster
      measured:    { stability: 0.70, speed: 0.95 },  // Very stable, slightly slower
      uncertain:   { stability: 0.55, speed: 0.9 },   // Moderate stability, slower
      neutral:     { stability: 0.55, speed: 1.0 },   // Default balanced settings
    };

    const settings = emotionMappings[emotion.dominantEmotion] || emotionMappings.neutral;

    return {
      stability: settings.stability,
      similarity_boost: 0.75,
      style: 0,  // ALWAYS 0 for stability
      speed: settings.speed,
      use_speaker_boost: true,
    };
  }

  /**
   * Validate a voice ID exists in our presets
   */
  isValidVoiceId(voiceId: string): boolean {
    for (const voices of this.presetVoices.values()) {
      if (voices.some(v => v.voiceId === voiceId)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get voice config by ID
   */
  getVoiceById(voiceId: string): VoiceConfig | null {
    for (const voices of this.presetVoices.values()) {
      const voice = voices.find(v => v.voiceId === voiceId);
      if (voice) return voice;
    }
    return null;
  }

  /**
   * Get bot character voice for a given language (Milestone 5)
   * Each bot character has a preferred voice style
   */
  getBotVoice(character: BotCharacter, language: LanguageCode): VoiceConfig {
    // Bot character voice preferences (using ElevenLabs voice IDs)
    // These map character personalities to voice types
    const botVoiceMap: Record<BotCharacter, { englishVoice: string; fallbackIndex: number }> = {
      scholar: {
        englishVoice: 'TX3LPaxmHKxFdv7VOQHJ',  // Liam - authoritative, measured
        fallbackIndex: 1,  // Second voice in list (usually male/authoritative)
      },
      passionate: {
        englishVoice: 'EXAVITQu4vr4xnSDxMaL',  // Sarah - expressive
        fallbackIndex: 0,  // First voice in list
      },
      aggressive: {
        englishVoice: 'TxGEqnHWrfWFTfGW9XjX',  // Josh - energetic, direct, forceful
        fallbackIndex: 1,
      },
      beginner: {
        englishVoice: 'XB0fDUnXU5powFXDhCwa',  // Charlotte - softer, natural
        fallbackIndex: 0,
      },
    };

    const voices = this.getPresetVoices(language);
    const botPref = botVoiceMap[character];

    // For English, use specific voice
    if (language === 'en') {
      const specificVoice = voices.find(v => v.voiceId === botPref.englishVoice);
      if (specificVoice) return specificVoice;
    }

    // For other languages, use fallback index or first voice
    const fallbackVoice = voices[botPref.fallbackIndex] || voices[0];
    if (fallbackVoice) return fallbackVoice;

    // Ultimate fallback to any English voice
    const englishVoices = this.presetVoices.get('en') || [];
    return englishVoices[0] || {
      voiceId: 'EXAVITQu4vr4xnSDxMaL',
      name: 'Sarah',
      language: 'en',
    };
  }

  /**
   * Get bot character voice settings (stability/speed adjustments)
   */
  getBotVoiceSettings(character: BotCharacter): VoiceSettings {
    // Character-specific voice settings aligned with their personalities
    const characterSettings: Record<BotCharacter, VoiceSettings> = {
      scholar: {
        stability: 0.70,          // Very stable, measured delivery
        similarity_boost: 0.75,
        style: 0,
        speed: 0.95,              // Slightly slower, deliberate
        use_speaker_boost: true,
      },
      passionate: {
        stability: 0.45,          // More expressive, emotional range
        similarity_boost: 0.75,
        style: 0,
        speed: 1.05,              // Slightly faster, energetic
        use_speaker_boost: true,
      },
      aggressive: {
        stability: 0.40,          // Most expressive, intense
        similarity_boost: 0.75,
        style: 0,
        speed: 1.10,              // Faster, urgent delivery
        use_speaker_boost: true,
      },
      beginner: {
        stability: 0.65,          // Somewhat stable, natural
        similarity_boost: 0.75,
        style: 0,
        speed: 0.90,              // Slower, easier to follow
        use_speaker_boost: true,
      },
    };

    return characterSettings[character];
  }
}

// Export singleton instance
export const elevenLabsTTS = new ElevenLabsTTSService();
