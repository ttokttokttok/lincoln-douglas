/**
 * Argument Extractor Service
 *
 * Uses Gemini to extract structured arguments (Claim-Warrant-Impact)
 * from debate speech transcripts.
 */
import { GoogleGenerativeAI } from '@google/generative-ai';
// Speech to side mapping
const SPEECH_SIDES = {
    AC: 'AFF',
    NC: 'NEG',
    '1AR': 'AFF',
    NR: 'NEG',
    '2AR': 'AFF',
};
class ArgumentExtractorService {
    genAI = null;
    model = null;
    isInitialized = false;
    /**
     * Initialize the extractor service
     */
    initialize() {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.warn('[ArgumentExtractor] GEMINI_API_KEY not set - extraction disabled');
            return false;
        }
        try {
            this.genAI = new GoogleGenerativeAI(apiKey);
            this.model = this.genAI.getGenerativeModel({
                model: 'gemini-2.0-flash',
                generationConfig: {
                    temperature: 0.2, // Low for consistent extraction
                    responseMimeType: 'application/json',
                },
            });
            this.isInitialized = true;
            console.log('[ArgumentExtractor] Initialized successfully');
            return true;
        }
        catch (error) {
            console.error('[ArgumentExtractor] Failed to initialize:', error);
            return false;
        }
    }
    /**
     * Extract arguments from a speech transcript
     */
    async extractArguments(transcript, context) {
        if (!this.isInitialized || !this.model) {
            console.warn('[ArgumentExtractor] Not initialized, skipping extraction');
            return [];
        }
        if (!transcript || transcript.trim().length < 50) {
            console.log('[ArgumentExtractor] Transcript too short, skipping');
            return [];
        }
        const side = SPEECH_SIDES[context.speech];
        const prompt = this.buildExtractionPrompt(transcript, context, side);
        try {
            const result = await this.model.generateContent(prompt);
            const jsonText = result.response.text();
            const extracted = JSON.parse(jsonText);
            const arguments_ = this.processExtracted(extracted, context.speech, side);
            console.log(`[ArgumentExtractor] Extracted ${arguments_.length} arguments from ${context.speech}`);
            return arguments_;
        }
        catch (error) {
            console.error('[ArgumentExtractor] Extraction error:', error.message || error);
            return [];
        }
    }
    /**
     * Build the extraction prompt
     */
    buildExtractionPrompt(transcript, context, side) {
        const speechDescriptions = {
            AC: 'Affirmative Constructive - establishes value, criterion, and contentions',
            NC: 'Negative Constructive - presents negative case and responds to AC',
            '1AR': 'First Affirmative Rebuttal - defends case and attacks NC',
            NR: 'Negative Rebuttal - extends attacks and defends NC',
            '2AR': 'Second Affirmative Rebuttal - final defense and crystallization',
        };
        const priorArgsText = context.priorArguments.length > 0
            ? context.priorArguments.map(a => `- [${a.id}] ${a.title} (${a.side}): ${a.claim}`).join('\n')
            : 'None yet';
        return `You are analyzing a Lincoln-Douglas debate speech to extract structured arguments.

RESOLUTION: "${context.resolution}"
SPEECH: ${context.speech} - ${speechDescriptions[context.speech]}
SIDE: ${side}

PRIOR ARGUMENTS IN THIS DEBATE:
${priorArgsText}

SPEECH TRANSCRIPT:
${transcript}

TASK: Extract all distinct arguments from this speech. For each argument, identify:
1. Type: value, criterion, contention, subpoint, response, rebuttal, or extension
2. Structure: claim (assertion), warrant (reasoning/evidence), impact (significance)
3. Relationships: if responding to a prior argument, include its ID

Return a JSON array of arguments (return empty array [] if no clear arguments found):
[
  {
    "title": "Short label (e.g., 'V: Justice', 'C1: Human Dignity', 'Turn: Economic Harm')",
    "type": "value|criterion|contention|subpoint|response|rebuttal|extension",
    "claim": "The main assertion being made",
    "warrant": "The evidence or reasoning supporting the claim",
    "impact": "Why this matters / the significance",
    "respondsTo": ["id1", "id2"]
  }
]

IMPORTANT:
- Extract ONLY clearly articulated arguments, not vague statements
- For AC/NC, look for value, criterion, and contentions
- For rebuttals, identify what prior arguments are being addressed
- Keep titles short (max 30 chars)
- Return ONLY the JSON array, no other text`;
    }
    /**
     * Process extracted arguments into proper Argument objects
     */
    processExtracted(extracted, speech, side) {
        return extracted.map((raw, index) => {
            // Determine status based on whether it responds to something
            let status = 'introduced';
            if (raw.respondsTo && raw.respondsTo.length > 0) {
                status = raw.type === 'rebuttal' ? 'answered' : 'introduced';
            }
            return {
                id: `${speech}-${index}-${Date.now()}`,
                speech,
                side,
                title: raw.title.substring(0, 50), // Limit title length
                claim: raw.claim,
                warrant: raw.warrant || '',
                impact: raw.impact || '',
                type: raw.type,
                status,
                respondsTo: raw.respondsTo || [],
                createdAt: Date.now(),
            };
        });
    }
    /**
     * Check if service is ready
     */
    isReady() {
        return this.isInitialized;
    }
}
export const argumentExtractor = new ArgumentExtractorService();
//# sourceMappingURL=argumentExtractor.js.map