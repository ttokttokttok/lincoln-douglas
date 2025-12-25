/**
 * Emotion Detection Service
 *
 * Analyzes debate speech text to detect emotional tone using Gemini.
 * Detected emotions are used to modulate TTS voice settings for
 * emotion-preserving translation.
 */
import { GoogleGenerativeAI } from '@google/generative-ai';
class EmotionDetectorService {
    genAI = null;
    model = null;
    isInitialized = false;
    // Track emotion history per speaker for continuity
    emotionHistory = new Map();
    /**
     * Initialize the emotion detection service
     */
    initialize() {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.warn('[EmotionDetector] GEMINI_API_KEY not set - emotion detection disabled');
            return false;
        }
        try {
            this.genAI = new GoogleGenerativeAI(apiKey);
            this.model = this.genAI.getGenerativeModel({
                model: 'gemini-2.0-flash',
                generationConfig: {
                    temperature: 0.2, // Low for consistent emotion detection
                    maxOutputTokens: 256,
                    responseMimeType: 'application/json',
                },
            });
            this.isInitialized = true;
            console.log('[EmotionDetector] Initialized successfully');
            return true;
        }
        catch (error) {
            console.error('[EmotionDetector] Failed to initialize:', error);
            return false;
        }
    }
    /**
     * Check if service is ready
     */
    isReady() {
        return this.isInitialized && this.model !== null;
    }
    /**
     * Detect emotion from transcript text
     */
    async detectEmotion(originalText, translatedText, sourceLanguage, targetLanguage, context) {
        const startTime = Date.now();
        // Skip emotion detection for very short text
        if (originalText.length < 20) {
            return {
                emotion: this.getDefaultEmotion(),
                latencyMs: Date.now() - startTime,
            };
        }
        if (!this.isReady() || !this.model) {
            return {
                emotion: this.getDefaultEmotion(),
                latencyMs: Date.now() - startTime,
            };
        }
        // Get previous emotion for this speaker (for continuity)
        const previousEmotion = this.getLastEmotion(context.speakerName);
        const prompt = this.buildDetectionPrompt(originalText, translatedText, sourceLanguage, targetLanguage, context, previousEmotion);
        try {
            const result = await this.model.generateContent(prompt);
            const jsonText = result.response.text();
            // Parse the JSON response
            const parsed = JSON.parse(jsonText);
            const emotion = {
                dominantEmotion: this.validateEmotion(parsed.dominantEmotion),
                intensity: this.clamp(parsed.intensity ?? 0.5, 0, 1),
                confidence: this.clamp(parsed.confidence ?? 0.5, 0, 1),
            };
            // Apply continuity smoothing to avoid jarring voice changes
            const smoothedEmotion = this.applyContinuity(emotion, previousEmotion);
            // Update history
            this.updateHistory(context.speakerName, smoothedEmotion);
            const latencyMs = Date.now() - startTime;
            console.log(`[EmotionDetector] Detected: ${smoothedEmotion.dominantEmotion} (${Math.round(smoothedEmotion.intensity * 100)}%) in ${latencyMs}ms`);
            return {
                emotion: smoothedEmotion,
                latencyMs,
            };
        }
        catch (error) {
            console.error('[EmotionDetector] Error:', error.message || error);
            // Fall back to previous emotion or default
            return {
                emotion: previousEmotion || this.getDefaultEmotion(),
                latencyMs: Date.now() - startTime,
            };
        }
    }
    /**
     * Build the emotion detection prompt
     */
    buildDetectionPrompt(originalText, translatedText, sourceLanguage, targetLanguage, context, previousEmotion) {
        const sideName = context.speakerSide === 'AFF' ? 'Affirmative' : 'Negative';
        const speechNames = {
            AC: 'Affirmative Constructive',
            NC: 'Negative Constructive',
            '1AR': 'First Affirmative Rebuttal',
            NR: 'Negative Rebuttal',
            '2AR': 'Second Affirmative Rebuttal',
        };
        return `Analyze the emotional tone of this debate speech segment.

CONTEXT:
- Debate Resolution: "${context.resolution}"
- Current Speech: ${speechNames[context.speechRole]} (${sideName} side)
- Speaker: ${context.speakerName}
${previousEmotion ? `- Previous emotional tone: ${previousEmotion.dominantEmotion} (${Math.round(previousEmotion.intensity * 100)}%)` : ''}

ORIGINAL TEXT (${sourceLanguage}):
${originalText}

TRANSLATED TEXT (${targetLanguage}):
${translatedText}

TASK: Analyze the emotional delivery and rhetorical intensity of this speech.

Consider these markers:
- Emphatic language ("absolutely", "must", "crucial", "fundamentally")
- Rhetorical questions and exclamations
- Repetition for emphasis
- Attack language vs. defensive language
- Confident assertions vs. hedged statements
- Impact-heavy framing ("lives at stake", "moral imperative")

Return ONLY a JSON object:
{
  "dominantEmotion": "confident" | "passionate" | "aggressive" | "measured" | "uncertain" | "neutral",
  "intensity": 0.0-1.0,
  "confidence": 0.0-1.0
}

EMOTION DEFINITIONS:
- "confident": Clear, assertive statements with strong claims and certainty
- "passionate": Emphatic delivery about values/impacts, emotional appeals, urgency
- "aggressive": Direct attacks on opponent, strong rebuttals, forceful challenges
- "measured": Calm, analytical, framework/definitional work, methodical
- "uncertain": Hedged language, concessions, tentative claims
- "neutral": Informational, evidence reading, roadmaps, procedural

Only return the JSON, no other text.`;
    }
    /**
     * Validate that the detected emotion is one of our supported types
     */
    validateEmotion(emotion) {
        const validEmotions = [
            'confident', 'passionate', 'aggressive', 'measured', 'uncertain', 'neutral'
        ];
        if (validEmotions.includes(emotion)) {
            return emotion;
        }
        return 'neutral';
    }
    /**
     * Clamp a value between min and max
     */
    clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }
    /**
     * Get default neutral emotion
     */
    getDefaultEmotion() {
        return {
            dominantEmotion: 'neutral',
            intensity: 0.5,
            confidence: 0.5,
        };
    }
    /**
     * Apply continuity smoothing to avoid jarring voice changes
     * - If confidence is low, blend with previous emotion
     * - Limit intensity changes to max 0.3 per utterance
     */
    applyContinuity(current, previous) {
        if (!previous)
            return current;
        // If confidence is low, keep previous emotion
        if (current.confidence < 0.5) {
            return {
                dominantEmotion: previous.dominantEmotion,
                intensity: (current.intensity + previous.intensity) / 2,
                confidence: current.confidence,
            };
        }
        // Smooth intensity transitions (max 0.3 change per utterance)
        const intensityDelta = current.intensity - previous.intensity;
        const smoothedIntensity = previous.intensity + this.clamp(intensityDelta, -0.3, 0.3);
        return {
            ...current,
            intensity: smoothedIntensity,
        };
    }
    /**
     * Track emotion history for a speaker
     */
    updateHistory(speakerId, emotion) {
        if (!this.emotionHistory.has(speakerId)) {
            this.emotionHistory.set(speakerId, []);
        }
        const history = this.emotionHistory.get(speakerId);
        history.push(emotion);
        // Keep only last 10 emotions
        if (history.length > 10) {
            history.shift();
        }
    }
    /**
     * Get the last detected emotion for a speaker
     */
    getLastEmotion(speakerId) {
        const history = this.emotionHistory.get(speakerId);
        return history?.[history.length - 1];
    }
    /**
     * Clear emotion history for a speaker (e.g., when debate ends)
     */
    clearHistory(speakerId) {
        this.emotionHistory.delete(speakerId);
    }
    /**
     * Clear all emotion history (e.g., on room cleanup)
     */
    clearAllHistory() {
        this.emotionHistory.clear();
    }
}
// Export singleton instance
export const emotionDetector = new EmotionDetectorService();
//# sourceMappingURL=emotionDetector.js.map