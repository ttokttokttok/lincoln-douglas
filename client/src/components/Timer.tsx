import { useTimer, formatTime, getSpeechName, getSpeechSide } from '../hooks/useTimer';
import type { Side, SpeechRole } from '@shared/types';
import { SPEECH_ORDER } from '@shared/types';

interface TimerProps {
  onEndSpeech: () => void;
  onStartPrep: (side: Side) => void;
  onEndPrep: () => void;
  onStartNextSpeech: () => void;
}

export function Timer({ onEndSpeech, onStartPrep, onEndPrep, onStartNextSpeech }: TimerProps) {
  const {
    timer,
    displayTime,
    isLowTime,
    isCriticalTime,
    currentSpeechName,
    currentSpeakerSide,
    isMyTurn,
    mySide,
    nextSpeech,
  } = useTimer();

  if (!timer) {
    return null;
  }

  // Determine next speaker's side (for prep time)
  const nextSpeakerSide = nextSpeech ? getSpeechSide(nextSpeech) : null;

  // Get prep time for the next speaker
  const nextSpeakerPrepTime = nextSpeakerSide ? timer.prepTime[nextSpeakerSide] : 0;

  // Check if we're currently in prep time
  const isInPrepTime = timer.isPrepTime && timer.prepSide;

  // Check if we're between speeches (not running speech, not in prep, and there's a next speech)
  const isBetweenSpeeches = !timer.isRunning && !isInPrepTime && timer.speechTimeRemaining === 0 && nextSpeech;

  // Check if debate is complete
  const isDebateComplete = !timer.isRunning && !isInPrepTime && timer.speechTimeRemaining === 0 && !nextSpeech && timer.currentSpeech === null;

  return (
    <div className="bg-gray-900 text-white rounded-xl p-6">
      {/* Speech Progress */}
      <div className="mb-4">
        <div className="flex justify-between text-xs text-gray-500 mb-2">
          {SPEECH_ORDER.map((speech: SpeechRole, index: number) => {
            const side = getSpeechSide(speech);
            const isPast = timer.currentSpeech
              ? SPEECH_ORDER.indexOf(timer.currentSpeech) > index
              : isDebateComplete;
            const isCurrent = timer.currentSpeech === speech;

            return (
              <div
                key={speech}
                className={`
                  px-2 py-1 rounded text-center flex-1 mx-0.5
                  ${isCurrent ? 'bg-gray-700 text-white font-bold' : ''}
                  ${isPast ? 'text-gray-600' : ''}
                  ${side === 'AFF' ? 'border-t-2 border-blue-500' : 'border-t-2 border-red-500'}
                `}
              >
                {speech}
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Timer Display */}
      <div className="text-center mb-4">
        {timer.currentSpeech && !isInPrepTime && (
          <div className="text-sm text-gray-400 mb-1">
            {currentSpeechName}
            <span className={`ml-2 ${currentSpeakerSide === 'AFF' ? 'text-blue-400' : 'text-red-400'}`}>
              ({currentSpeakerSide})
            </span>
          </div>
        )}

        {isInPrepTime && timer.prepSide && (
          <div className={`text-sm mb-1 ${timer.prepSide === 'AFF' ? 'text-blue-400' : 'text-red-400'}`}>
            {timer.prepSide} Prep Time
          </div>
        )}

        {isBetweenSpeeches && (
          <div className="text-sm text-yellow-400 mb-1">
            Next: {getSpeechName(nextSpeech!)} ({getSpeechSide(nextSpeech!)})
          </div>
        )}

        {isDebateComplete && (
          <div className="text-sm text-green-400 mb-1">
            Debate Complete
          </div>
        )}

        <div
          className={`
            text-6xl font-mono font-bold transition-colors
            ${isCriticalTime && !isInPrepTime ? 'text-red-500 animate-pulse' : ''}
            ${isLowTime && !isCriticalTime && !isInPrepTime ? 'text-yellow-400' : ''}
            ${isInPrepTime ? 'text-yellow-400' : ''}
            ${!isLowTime && !isCriticalTime && !isInPrepTime ? 'text-white' : ''}
          `}
        >
          {isInPrepTime && timer.prepSide
            ? formatTime(timer.prepTime[timer.prepSide])
            : displayTime}
        </div>

        {isMyTurn && timer.isRunning && !isInPrepTime && (
          <div className="text-sm text-green-400 mt-1">
            Your turn to speak
          </div>
        )}
      </div>

      {/* Controls - During Speech (only current speaker can end) */}
      {timer.isRunning && timer.currentSpeech && !isInPrepTime && isMyTurn && (
        <div className="flex gap-2 justify-center mb-4">
          <button
            onClick={onEndSpeech}
            className="px-6 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-medium transition-colors"
          >
            End Speech
          </button>
        </div>
      )}

      {/* Controls - During Prep Time */}
      {isInPrepTime && timer.prepSide && (
        <div className="space-y-3">
          <div className="flex gap-2 justify-center">
            <button
              onClick={onEndPrep}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg font-medium transition-colors"
            >
              End Prep
            </button>
          </div>

          {/* Start speech button - only for the side whose prep it is */}
          {nextSpeech && timer.prepSide === mySide && (
            <div className="flex gap-2 justify-center">
              <button
                onClick={() => {
                  onEndPrep();
                  onStartNextSpeech();
                }}
                className="px-6 py-2 bg-green-600 hover:bg-green-700 rounded-lg font-medium transition-colors"
              >
                Start {nextSpeech}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Controls - Between Speeches (not in prep) */}
      {isBetweenSpeeches && mySide && (
        <div className="space-y-3">
          {/* Prep Time Option - offered to side that speaks NEXT */}
          {nextSpeakerSide && nextSpeakerPrepTime > 0 && nextSpeakerSide === mySide && (
            <div className="flex gap-2 justify-center">
              <button
                onClick={() => onStartPrep(nextSpeakerSide)}
                className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 rounded-lg font-medium transition-colors"
              >
                Use Prep Time ({formatTime(nextSpeakerPrepTime)})
              </button>
            </div>
          )}

          {/* Start Next Speech - Only show if next speech is my side */}
          {nextSpeech && getSpeechSide(nextSpeech) === mySide && (
            <div className="flex gap-2 justify-center">
              <button
                onClick={onStartNextSpeech}
                className="px-6 py-2 bg-green-600 hover:bg-green-700 rounded-lg font-medium transition-colors"
              >
                Start {nextSpeech}
              </button>
            </div>
          )}

          {/* Waiting for opponent */}
          {nextSpeech && getSpeechSide(nextSpeech) !== mySide && (
            <div className="text-center text-gray-400 text-sm">
              Waiting for {getSpeechSide(nextSpeech)} to start {nextSpeech}...
            </div>
          )}
        </div>
      )}

      {/* Prep Time Display */}
      <div className="flex justify-between text-sm mt-4 pt-4 border-t border-gray-700">
        <div className={mySide === 'AFF' ? 'text-blue-400' : 'text-gray-400'}>
          AFF Prep: {formatTime(timer.prepTime.AFF)}
        </div>
        <div className={mySide === 'NEG' ? 'text-red-400' : 'text-gray-400'}>
          NEG Prep: {formatTime(timer.prepTime.NEG)}
        </div>
      </div>
    </div>
  );
}

// Compact timer for when debate is in progress
export function TimerCompact() {
  const { timer, displayTime, isLowTime, isCriticalTime, isMyTurn } = useTimer();

  if (!timer || !timer.currentSpeech) {
    return null;
  }

  return (
    <div className="flex items-center gap-3 bg-gray-800 rounded-lg px-4 py-2">
      <span className="text-sm text-gray-400">{timer.currentSpeech}</span>
      <span
        className={`
          text-2xl font-mono font-bold
          ${isCriticalTime ? 'text-red-500 animate-pulse' : ''}
          ${isLowTime && !isCriticalTime ? 'text-yellow-400' : ''}
          ${!isLowTime && !isCriticalTime ? 'text-white' : ''}
        `}
      >
        {displayTime}
      </span>
      {isMyTurn && (
        <span className="text-xs text-green-400 bg-green-900 px-2 py-1 rounded">
          YOUR TURN
        </span>
      )}
    </div>
  );
}
