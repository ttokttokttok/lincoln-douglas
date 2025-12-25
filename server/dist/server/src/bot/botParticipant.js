/**
 * Milestone 5: Bot Participant
 *
 * Virtual participant that represents an AI debate opponent.
 * The bot doesn't have a real WebSocket connection but integrates
 * with the existing debate infrastructure.
 */
import { BOT_DISPLAY_NAMES, getBotCharacter } from '@shared/types';
// Create a bot participant state for a room
export function createBotParticipantState(roomId, participantId, character, side, language) {
    return {
        roomId,
        participantId,
        character,
        side,
        language,
        isGenerating: false,
        currentSpeechId: null,
        generatedSpeeches: new Map(),
        opponentArguments: [],
        ownArguments: [],
    };
}
// Convert bot state to Participant interface
export function botStateToParticipant(state) {
    return {
        id: state.participantId,
        displayName: BOT_DISPLAY_NAMES[state.character],
        side: state.side,
        speakingLanguage: state.language,
        listeningLanguage: state.language,
        isReady: true,
        isConnected: true,
        isBot: true,
        botCharacter: state.character,
    };
}
// Get the speech roles for a given side
export function getSpeechRolesForSide(side) {
    if (side === 'AFF') {
        return ['AC', '1AR', '2AR'];
    }
    else {
        return ['NC', 'NR'];
    }
}
// Get the next speech role for the bot based on current speech
export function getNextBotSpeech(currentSpeech, botSide) {
    const speechOrder = ['AC', 'NC', '1AR', 'NR', '2AR'];
    const currentIndex = speechOrder.indexOf(currentSpeech);
    if (currentIndex === -1 || currentIndex >= speechOrder.length - 1) {
        return null;
    }
    const nextSpeech = speechOrder[currentIndex + 1];
    const botSpeeches = getSpeechRolesForSide(botSide);
    return botSpeeches.includes(nextSpeech) ? nextSpeech : null;
}
// Check if it's the bot's turn to speak
export function isBotTurn(currentSpeech, botSide) {
    if (!currentSpeech)
        return false;
    const botSpeeches = getSpeechRolesForSide(botSide);
    return botSpeeches.includes(currentSpeech);
}
// Get thinking delay based on character (in ms)
export function getBotThinkingDelay(character) {
    const characterInfo = getBotCharacter(character);
    switch (characterInfo.difficulty) {
        case 'easy':
            return 3000; // 3 seconds - slower, more hesitant
        case 'medium':
            return 2000; // 2 seconds - moderate pace
        case 'hard':
            return 1500; // 1.5 seconds - quick, confident
        default:
            return 2000;
    }
}
// Store for active bot participants (keyed by roomId)
const activeBots = new Map();
// Register a bot for a room
export function registerBot(state) {
    activeBots.set(state.roomId, state);
    console.log(`Bot registered for room ${state.roomId}: ${BOT_DISPLAY_NAMES[state.character]}`);
}
// Get bot state for a room
export function getBotState(roomId) {
    return activeBots.get(roomId);
}
// Remove bot from a room
export function unregisterBot(roomId) {
    const bot = activeBots.get(roomId);
    if (bot) {
        activeBots.delete(roomId);
        console.log(`Bot unregistered from room ${roomId}`);
    }
}
// Update bot with opponent's arguments (from flow state)
export function updateBotContext(roomId, opponentArguments, ownArguments) {
    const bot = activeBots.get(roomId);
    if (bot) {
        bot.opponentArguments = opponentArguments;
        bot.ownArguments = ownArguments;
    }
}
// Mark bot as generating speech
export function setBotGenerating(roomId, isGenerating, speechId) {
    const bot = activeBots.get(roomId);
    if (bot) {
        bot.isGenerating = isGenerating;
        bot.currentSpeechId = speechId || null;
    }
}
// Store generated speech for a role
export function storeBotSpeech(roomId, role, text) {
    const bot = activeBots.get(roomId);
    if (bot) {
        bot.generatedSpeeches.set(role, text);
    }
}
// Get all active bot room IDs
export function getActiveBotRooms() {
    return Array.from(activeBots.keys());
}
//# sourceMappingURL=botParticipant.js.map