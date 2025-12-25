interface TTSSettingsProps {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  volume: number;
  onVolumeChange: (volume: number) => void;
}

export function TTSSettings({
  enabled,
  onEnabledChange,
  volume,
  onVolumeChange,
}: TTSSettingsProps) {
  return (
    <div className="bg-gray-800/50 rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <label className="text-sm font-medium text-gray-300">
            Hear Opponent
          </label>
          <p className="text-xs text-gray-500 mt-0.5">
            {enabled ? 'Hearing TTS translations' : 'Opponent muted'}
          </p>
        </div>
        <button
          onClick={() => onEnabledChange(!enabled)}
          className={`
            relative inline-flex h-6 w-11 items-center rounded-full transition-colors
            ${enabled ? 'bg-purple-600' : 'bg-red-600'}
          `}
          role="switch"
          aria-checked={enabled}
          title={enabled ? 'Click to mute opponent' : 'Click to hear opponent'}
        >
          <span
            className={`
              inline-block h-4 w-4 transform rounded-full bg-white transition-transform
              ${enabled ? 'translate-x-6' : 'translate-x-1'}
            `}
          />
        </button>
      </div>

      {enabled && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm text-gray-400">Volume</label>
            <span className="text-sm text-gray-500 tabular-nums">
              {Math.round(volume * 100)}%
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={volume}
            onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
          />
        </div>
      )}
    </div>
  );
}
