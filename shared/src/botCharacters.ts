/**
 * Milestone 5: Bot Character Definitions
 *
 * Four distinct debate opponent archetypes with different
 * personalities, difficulties, and voice characteristics.
 */

import type { BotCharacter, BotCharacterInfo, BotDifficulty } from './types';

// Character display names for the bot participant
export const BOT_DISPLAY_NAMES: Record<BotCharacter, string> = {
  scholar: 'Professor Logos',
  passionate: 'Advocate Aurora',
  aggressive: 'Challenger Rex',
  beginner: 'Rookie Riley',
};

// Full character definitions
export const BOT_CHARACTERS: Record<BotCharacter, BotCharacterInfo> = {
  scholar: {
    id: 'scholar',
    name: 'The Scholar',
    description: 'Evidence-heavy, measured tone, logical structure. Emphasizes warrants and citations.',
    difficulty: 'hard',
    icon: 'graduation-cap', // Lucide icon name
    voiceSettings: {
      stability: 0.70,  // More stable, measured delivery
      speed: 0.95,      // Slightly slower, deliberate
    },
  },
  passionate: {
    id: 'passionate',
    name: 'The Passionate Advocate',
    description: 'Values-focused, emotional delivery, moral framing. Appeals to justice and rights.',
    difficulty: 'medium',
    icon: 'flame',
    voiceSettings: {
      stability: 0.45,  // More expressive, emotional range
      speed: 1.05,      // Slightly faster, energetic
    },
  },
  aggressive: {
    id: 'aggressive',
    name: 'The Aggressive Challenger',
    description: 'Direct attacks, turns arguments, pressure-heavy. Identifies dropped points.',
    difficulty: 'hard',
    icon: 'swords',
    voiceSettings: {
      stability: 0.40,  // Very expressive, intense
      speed: 1.10,      // Faster, urgent delivery
    },
  },
  beginner: {
    id: 'beginner',
    name: 'The Beginner',
    description: 'Simple arguments, slower pace, good for learning. Makes occasional logical gaps.',
    difficulty: 'easy',
    icon: 'sprout',
    voiceSettings: {
      stability: 0.65,  // Somewhat stable, natural
      speed: 0.90,      // Slower, easier to follow
    },
  },
};

// Get character by ID
export function getBotCharacter(id: BotCharacter): BotCharacterInfo {
  return BOT_CHARACTERS[id];
}

// Get all characters as array (for UI display)
export function getAllBotCharacters(): BotCharacterInfo[] {
  return Object.values(BOT_CHARACTERS);
}

// Get characters filtered by difficulty
export function getBotCharactersByDifficulty(difficulty: BotDifficulty): BotCharacterInfo[] {
  return Object.values(BOT_CHARACTERS).filter(c => c.difficulty === difficulty);
}

// Difficulty color mapping for UI
export const DIFFICULTY_COLORS: Record<BotDifficulty, string> = {
  easy: 'text-green-500',
  medium: 'text-yellow-500',
  hard: 'text-red-500',
};

// Difficulty labels
export const DIFFICULTY_LABELS: Record<BotDifficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
};
