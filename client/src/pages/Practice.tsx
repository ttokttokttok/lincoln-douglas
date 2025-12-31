import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Bot, Scale, Globe } from 'lucide-react';
import type { BotCharacter, Side, LanguageCode, BotCharacterInfo } from '@shared/types';
import { getAllBotCharacters } from '@shared/types';
import { BotCharacterCard } from '../components/BotCharacterCard';
import { useRoomStore } from '../stores/roomStore';

// Get bot characters from shared definitions
const BOT_CHARACTERS: BotCharacterInfo[] = getAllBotCharacters();

// Supported languages for practice mode
const SUPPORTED_LANGUAGES: { code: LanguageCode; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'zh', name: 'Chinese' },
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
  const [selectedLanguage, setSelectedLanguage] = useState<LanguageCode>('en');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayName = sessionStorage.getItem('displayName') || 'Debater';

  const handleStartDebate = async () => {
    if (!resolution || !selectedCharacter || !selectedSide) return;

    setIsCreating(true);
    setError(null);

    try {
      // Store bot configuration for the room
      setBotConfig({
        character: selectedCharacter,
        userSide: selectedSide,
        resolution,
        language: selectedLanguage,
      });

      // Navigate to room with practice mode indicator
      navigate('/room/practice', {
        state: {
          isPractice: true,
          resolution,
          botCharacter: selectedCharacter,
          userSide: selectedSide,
          language: selectedLanguage,
        }
      });
    } catch (err) {
      setError('Failed to create practice room. Please try again.');
      setIsCreating(false);
    }
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

            {/* Language selection */}
            <div>
              <label className="flex items-center gap-2 text-sm text-gray-400 mb-3">
                <Globe className="w-4 h-4" />
                Debate Language
              </label>
              <select
                value={selectedLanguage}
                onChange={(e) => setSelectedLanguage(e.target.value as LanguageCode)}
                className="input"
              >
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.name}
                  </option>
                ))}
              </select>
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
                <div className="text-white">
                  <strong>Language:</strong> {SUPPORTED_LANGUAGES.find(l => l.code === selectedLanguage)?.name}
                </div>
              </div>
            )}

            {/* Error display */}
            {error && (
              <div className="bg-red-500/20 border border-red-500 text-red-300 rounded-lg p-3 text-sm">
                {error}
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
