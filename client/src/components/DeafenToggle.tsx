/**
 * DeafenToggle Component
 *
 * Allows users to mute/unmute their opponent's raw WebRTC audio.
 * Useful for eliminating background noise from the non-speaking participant.
 * Note: TTS translations still play even when deafened.
 */

interface DeafenToggleProps {
  isDeafened: boolean;
  onDeafenChange: (deafened: boolean) => void;
  disabled?: boolean;
}

export function DeafenToggle({
  isDeafened,
  onDeafenChange,
  disabled = false,
}: DeafenToggleProps) {
  return (
    <div className="bg-gray-800/50 rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div>
          <label className="text-sm font-medium text-gray-300">
            Deafen Opponent
          </label>
          <p className="text-xs text-gray-500 mt-0.5">
            {isDeafened
              ? "Opponent's raw audio muted"
              : "Hearing opponent's audio"
            }
          </p>
        </div>
        <button
          onClick={() => !disabled && onDeafenChange(!isDeafened)}
          disabled={disabled}
          className={`
            relative inline-flex h-6 w-11 items-center rounded-full transition-colors
            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
            ${isDeafened ? 'bg-red-600' : 'bg-gray-600'}
          `}
          role="switch"
          aria-checked={isDeafened}
          title={isDeafened ? 'Click to hear opponent' : 'Click to deafen opponent'}
        >
          <span
            className={`
              inline-block h-4 w-4 transform rounded-full bg-white transition-transform
              ${isDeafened ? 'translate-x-6' : 'translate-x-1'}
            `}
          />
        </button>
      </div>
      {isDeafened && (
        <p className="text-xs text-amber-400 mt-2">
          TTS translations will still play
        </p>
      )}
    </div>
  );
}
