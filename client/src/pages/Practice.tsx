import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Bot, Scale } from 'lucide-react';
import type { BotCharacter, Side, LanguageCode } from '@shared/types';
import { BotCharacterCard } from '../components/BotCharacterCard';
import { useRoomStore } from '../stores/roomStore';

// Bot character definitions (from shared/botCharacters.ts)
const BOT_CHARACTERS = [
  {
    id: 'scholar' as BotCharacter,
    name: 'The Scholar',
    description: 'Evidence-heavy, measured tone, logical structure. Emphasizes warrants and citations.',
    difficulty: 'hard' as const,
  },
  {
    id: 'passionate' as BotCharacter,
    name: 'The Passionate Advocate',
    description: 'Values-focused, emotional delivery, moral framing. Appeals to justice and rights.',
    difficulty: 'medium' as const,
  },
  {
    id: 'aggressive' as BotCharacter,
    name: 'The Aggressive Challenger',
    description: 'Direct attacks, turns arguments, pressure-heavy. Identifies dropped points.',
    difficulty: 'hard' as const,
  },
  {
    id: 'beginner' as BotCharacter,
    name: 'The Beginner',
    description: 'Simple arguments, slower pace, good for learning. Makes occasional logical gaps.',
    difficulty: 'easy' as const,
  },
];

// Suggested resolutions for practice
const SUGGESTED_RESOLUTIONS = [
  'Resolved: The United States ought to provide a universal basic income.',
  'Resolved: Civil disobedience in a democracy is morally justified.',
  'Resolved: The right to privacy ought to be valued above national security.',
  'Resolved: Economic sanctions ought not be used to achieve foreign policy objectives.',
  'Resolved: The United States ought to guarantee universal health care.',
];

type Step = 'resolution' | 'character' | 'side';

export function Practice() {
  const navigate = useNavigate();
  const { setBotConfig } = useRoomStore();

  const [step, setStep] = useState<Step>('resolution');
  const [resolution, setResolution] = useState('');
  const [selectedCharacter, setSelectedCharacter] = useState<BotCharacter | null>(null);
  const [selectedSide, setSelectedSide] = useState<Side | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const displayName = sessionStorage.getItem('displayName') || 'Debater';

  const handleStartDebate = async () => {
    if (!resolution || !selectedCharacter || !selectedSide) return;

    setIsCreating(true);

    // Store bot configuration for the room
    setBotConfig({
      character: selectedCharacter,
      userSide: selectedSide,
      resolution,
      language: 'en' as LanguageCode, // Default to English for now
    });

    // Navigate to room with practice mode indicator
    navigate('/room/practice', {
      state: {
        isPractice: true,
        resolution,
        botCharacter: selectedCharacter,
        userSide: selectedSide,
      }
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-2xl space-y-8">
        {/* Back button */}
        <button
          onClick={() => {
            if (step === 'resolution') navigate('/');
            else if (step === 'character') setStep('resolution');
            else if (step === 'side') setStep('character');
          }}
          className="text-gray-400 hover:text-white flex items-center gap-2 transition-colors"
        >
          <ArrowRight className="w-4 h-4 rotate-180" />
          <span>
            {step === 'resolution' ? 'Back to mode selection' : 'Back'}
          </span>
        </button>

        {/* Header */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-3 mb-2">
            <Bot className="w-8 h-8 text-purple-400" />
            <h1 className="text-3xl font-bold text-white">Practice with AI</h1>
          </div>
          <p className="text-gray-400">
            Playing as: {displayName}
          </p>
        </div>

        {/* Progress indicator */}
        <div className="flex items-center justify-center gap-2">
          {['resolution', 'character', 'side'].map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
                  ${step === s ? 'bg-purple-500 text-white' :
                    ['resolution', 'character', 'side'].indexOf(step) > i ? 'bg-purple-500/30 text-purple-300' :
                    'bg-gray-700 text-gray-400'}`}
              >
                {i + 1}
              </div>
              {i < 2 && (
                <div className={`w-12 h-0.5 ${['resolution', 'character', 'side'].indexOf(step) > i ? 'bg-purple-500/50' : 'bg-gray-700'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Step 1: Resolution */}
        {step === 'resolution' && (
          <div className="card space-y-6">
            <div>
              <h2 className="text-xl font-semibold mb-2">Enter Resolution</h2>
              <p className="text-gray-400 text-sm mb-4">
                What topic would you like to debate?
              </p>
              <input
                type="text"
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                placeholder="Resolved: ..."
                className="input"
              />
            </div>

            {/* Suggested resolutions */}
            <div>
              <p className="text-sm text-gray-400 mb-3">Or try a suggested resolution:</p>
              <div className="space-y-2">
                {SUGGESTED_RESOLUTIONS.map((res) => (
                  <button
                    key={res}
                    onClick={() => setResolution(res)}
                    className={`w-full text-left p-3 rounded-lg text-sm transition-colors
                      ${resolution === res
                        ? 'bg-purple-500/20 border border-purple-500 text-white'
                        : 'bg-gray-800 hover:bg-gray-700 text-gray-300'}`}
                  >
                    {res}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => setStep('character')}
              disabled={!resolution.trim()}
              className="btn btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Continue
            </button>
          </div>
        )}

        {/* Step 2: Character Selection */}
        {step === 'character' && (
          <div className="card space-y-6">
            <div>
              <h2 className="text-xl font-semibold mb-2">Choose Your Opponent</h2>
              <p className="text-gray-400 text-sm">
                Each AI has a unique debate style and difficulty level.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              {BOT_CHARACTERS.map((char) => (
                <BotCharacterCard
                  key={char.id}
                  id={char.id}
                  name={char.name}
                  description={char.description}
                  difficulty={char.difficulty}
                  isSelected={selectedCharacter === char.id}
                  onSelect={setSelectedCharacter}
                />
              ))}
            </div>

            <button
              onClick={() => setStep('side')}
              disabled={!selectedCharacter}
              className="btn btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Continue
            </button>
          </div>
        )}

        {/* Step 3: Side Selection */}
        {step === 'side' && (
          <div className="card space-y-6">
            <div>
              <h2 className="text-xl font-semibold mb-2">Pick Your Side</h2>
              <p className="text-gray-400 text-sm">
                Will you argue for or against the resolution?
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setSelectedSide('AFF')}
                className={`p-6 rounded-xl border-2 transition-all
                  ${selectedSide === 'AFF'
                    ? 'border-green-500 bg-green-500/10'
                    : 'border-gray-700 hover:border-gray-600 bg-gray-800/50'}`}
              >
                <Scale className={`w-8 h-8 mx-auto mb-3 ${selectedSide === 'AFF' ? 'text-green-400' : 'text-gray-400'}`} />
                <div className="font-semibold text-white">Affirmative</div>
                <div className="text-sm text-gray-400">Support the resolution</div>
              </button>

              <button
                onClick={() => setSelectedSide('NEG')}
                className={`p-6 rounded-xl border-2 transition-all
                  ${selectedSide === 'NEG'
                    ? 'border-red-500 bg-red-500/10'
                    : 'border-gray-700 hover:border-gray-600 bg-gray-800/50'}`}
              >
                <Scale className={`w-8 h-8 mx-auto mb-3 transform -scale-x-100 ${selectedSide === 'NEG' ? 'text-red-400' : 'text-gray-400'}`} />
                <div className="font-semibold text-white">Negative</div>
                <div className="text-sm text-gray-400">Oppose the resolution</div>
              </button>
            </div>

            {/* Summary */}
            {selectedSide && (
              <div className="bg-gray-800/50 rounded-lg p-4 space-y-2">
                <div className="text-sm text-gray-400">Ready to start:</div>
                <div className="text-white">
                  <strong>Resolution:</strong> {resolution}
                </div>
                <div className="text-white">
                  <strong>Opponent:</strong> {BOT_CHARACTERS.find(c => c.id === selectedCharacter)?.name}
                </div>
                <div className="text-white">
                  <strong>Your Side:</strong> {selectedSide === 'AFF' ? 'Affirmative' : 'Negative'}
                </div>
              </div>
            )}

            <button
              onClick={handleStartDebate}
              disabled={!selectedSide || isCreating}
              className="btn btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCreating ? 'Starting...' : 'Start Debate'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
