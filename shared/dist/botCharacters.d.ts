/**
 * Milestone 5: Bot Character Definitions
 *
 * Four distinct debate opponent archetypes with different
 * personalities, difficulties, and voice characteristics.
 */
import type { BotCharacter, BotCharacterInfo, BotDifficulty } from './types';
export declare const BOT_DISPLAY_NAMES: Record<BotCharacter, string>;
export declare const BOT_CHARACTERS: Record<BotCharacter, BotCharacterInfo>;
export declare function getBotCharacter(id: BotCharacter): BotCharacterInfo;
export declare function getAllBotCharacters(): BotCharacterInfo[];
export declare function getBotCharactersByDifficulty(difficulty: BotDifficulty): BotCharacterInfo[];
export declare const DIFFICULTY_COLORS: Record<BotDifficulty, string>;
export declare const DIFFICULTY_LABELS: Record<BotDifficulty, string>;
//# sourceMappingURL=botCharacters.d.ts.map