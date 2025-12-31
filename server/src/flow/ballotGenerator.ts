/**
 * Ballot Generator Service
 * 
 * Uses Gemini to generate a debate ballot with RFD (Reason for Decision)
 * based on the flow state and extracted arguments.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Ballot, FlowState, Argument, Side, VotingIssue } from '@shared/types';

interface BallotContext {
  resolution: string;
  affName: string;
  negName: string;
  flowState: FlowState;
}

interface GeneratedBallot {
  winner: 'AFF' | 'NEG';
  rfdSummary: string;
  rfdDetails: string;
  speakerPoints: {
    AFF: number;
    NEG: number;
  };
  votingIssues: VotingIssue[];
}

class BallotGeneratorService {
  private genAI: GoogleGenerativeAI | null = null;
  private model: ReturnType<GoogleGenerativeAI['getGenerativeModel']> | null = null;
  private isInitialized = false;

  /**
   * Initialize the ballot generator
   */
  initialize(): boolean {
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      console.warn('[BallotGenerator] GEMINI_API_KEY not set - ballot generation disabled');
      return false;
    }

    try {
      this.genAI = new GoogleGenerativeAI(apiKey);
      this.model = this.genAI.getGenerativeModel({
        model: 'gemini-2.0-flash',
        generationConfig: {
          temperature: 0.3,
          responseMimeType: 'application/json',
        },
      });
      this.isInitialized = true;
      console.log('[BallotGenerator] Initialized successfully');
      return true;
    } catch (error) {
      console.error('[BallotGenerator] Failed to initialize:', error);
      return false;
    }
  }

  /**
   * Generate a ballot for the debate
   */
  async generateBallot(context: BallotContext, retryCount = 0): Promise<Ballot | null> {
    const MAX_RETRIES = 2;

    if (!this.isInitialized || !this.model) {
      console.warn('[BallotGenerator] Not initialized, skipping ballot generation');
      return null;
    }

    const prompt = this.buildBallotPrompt(context);

    try {
      const result = await this.model.generateContent(prompt);
      const jsonText = result.response.text();

      // Try to extract JSON if response contains other text
      let cleanedJson = jsonText.trim();

      // Handle markdown code blocks
      if (cleanedJson.startsWith('```json')) {
        cleanedJson = cleanedJson.slice(7);
      } else if (cleanedJson.startsWith('```')) {
        cleanedJson = cleanedJson.slice(3);
      }
      if (cleanedJson.endsWith('```')) {
        cleanedJson = cleanedJson.slice(0, -3);
      }
      cleanedJson = cleanedJson.trim();

      // Validate JSON structure before parsing
      if (!cleanedJson.startsWith('{') || !cleanedJson.endsWith('}')) {
        throw new Error(`Invalid JSON structure: doesn't start/end with braces`);
      }

      let generated: GeneratedBallot;
      try {
        generated = JSON.parse(cleanedJson) as GeneratedBallot;
      } catch (parseError) {
        console.error('[BallotGenerator] JSON parse failed, raw response:', jsonText.substring(0, 200));
        throw parseError;
      }

      // Validate required fields
      if (!generated.winner || !['AFF', 'NEG'].includes(generated.winner)) {
        throw new Error(`Invalid winner field: ${generated.winner}`);
      }
      if (!generated.rfdSummary || typeof generated.rfdSummary !== 'string') {
        generated.rfdSummary = 'Decision based on overall argument strength.';
      }
      if (!generated.rfdDetails || typeof generated.rfdDetails !== 'string') {
        generated.rfdDetails = generated.rfdSummary;
      }
      if (!generated.speakerPoints || typeof generated.speakerPoints !== 'object') {
        generated.speakerPoints = { AFF: 28, NEG: 28 };
      }
      if (!Array.isArray(generated.votingIssues)) {
        generated.votingIssues = [];
      }

      const ballot = this.formatBallot(generated, context);

      console.log(`[BallotGenerator] Generated ballot - Winner: ${ballot.winner}`);
      return ballot;
    } catch (error: any) {
      console.error('[BallotGenerator] Generation error:', error.message || error);

      // Retry on failure
      if (retryCount < MAX_RETRIES) {
        console.log(`[BallotGenerator] Retrying... (attempt ${retryCount + 2}/${MAX_RETRIES + 1})`);
        await new Promise(resolve => setTimeout(resolve, 1000));  // Wait 1 second
        return this.generateBallot(context, retryCount + 1);
      }

      return null;
    }
  }

  /**
   * Build the ballot generation prompt
   */
  private buildBallotPrompt(context: BallotContext): string {
    const { resolution, affName, negName, flowState } = context;
    
    // Format arguments by speech
    const formatArgsBySpeech = (speech: string) => {
      const args = flowState.arguments.filter(a => a.speech === speech);
      if (args.length === 0) return '  (No arguments extracted)';
      return args.map(a => 
        `  - ${a.title}: ${a.claim}${a.respondsTo.length > 0 ? ` [responds to: ${a.respondsTo.join(', ')}]` : ''}`
      ).join('\n');
    };

    return `You are an experienced Lincoln-Douglas debate judge. Evaluate this debate and provide a ballot.

RESOLUTION: "${resolution}"

AFFIRMATIVE: ${affName}
NEGATIVE: ${negName}

FLOW OF THE DEBATE:

AC (Affirmative Constructive):
${formatArgsBySpeech('AC')}

NC (Negative Constructive):
${formatArgsBySpeech('NC')}

1AR (First Affirmative Rebuttal):
${formatArgsBySpeech('1AR')}

NR (Negative Rebuttal):
${formatArgsBySpeech('NR')}

2AR (Second Affirmative Rebuttal):
${formatArgsBySpeech('2AR')}

TASK: Evaluate the debate and return a JSON object:
{
  "winner": "AFF" or "NEG",
  "rfdSummary": "One sentence summary of why this side won",
  "rfdDetails": "2-3 paragraph detailed reason for decision explaining the key issues and how you weighed them",
  "speakerPoints": {
    "AFF": number between 27-30,
    "NEG": number between 27-30
  },
  "votingIssues": [
    {
      "issue": "Name of the key clash point",
      "analysis": "How each side handled it and why one side won",
      "winner": "AFF" or "NEG"
    }
  ]
}

JUDGING CRITERIA:
1. Value/Criterion Debate: Whose framework is more compelling and applicable?
2. Contention-Level Clash: Who won the key substantive arguments?
3. Warrant Analysis: Whose reasoning and evidence was stronger?
4. Impact Comparison: Whose impacts are more significant/probable?
5. Extensions & Drops: Did debaters extend their arguments? Were any dropped?

IMPORTANT: 
- Be objective and base decision on the arguments presented
- Speaker points should reflect speaking quality (27=average, 28=good, 29=excellent, 30=exceptional)
- Identify 2-4 key voting issues
- Return ONLY the JSON, no other text`;
  }

  /**
   * Format the generated ballot into the proper structure
   */
  private formatBallot(generated: GeneratedBallot, context: BallotContext): Ballot {
    // Helper to safely clamp speaker points, handling NaN/undefined
    const clampPoints = (points: number | undefined | null): number => {
      if (points === undefined || points === null || isNaN(points)) {
        return 28;  // Default to 28 (good)
      }
      return Math.min(30, Math.max(25, Math.round(points)));
    };

    return {
      roomId: context.flowState.roomId,
      resolution: context.resolution,
      generatedAt: Date.now(),
      winner: generated.winner,
      winnerName: generated.winner === 'AFF' ? context.affName : context.negName,
      loserName: generated.winner === 'AFF' ? context.negName : context.affName,
      rfdSummary: generated.rfdSummary || 'Decision based on overall argument strength.',
      rfdDetails: generated.rfdDetails || generated.rfdSummary || 'The judge found one side more persuasive.',
      speakerPoints: {
        AFF: clampPoints(generated.speakerPoints?.AFF),
        NEG: clampPoints(generated.speakerPoints?.NEG),
      },
      votingIssues: generated.votingIssues || [],
    };
  }

  /**
   * Check if service is ready
   */
  isReady(): boolean {
    return this.isInitialized;
  }
}

export const ballotGenerator = new BallotGeneratorService();

