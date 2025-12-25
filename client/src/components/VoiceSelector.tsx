import { useState, useRef, useEffect } from 'react';
import type { VoiceConfig } from '@shared/types';

interface VoiceSelectorProps {
  voices: VoiceConfig[];
  selectedVoiceId: string | null;
  onSelect: (voiceId: string) => void;
  loading?: boolean;
  disabled?: boolean;
}

export function VoiceSelector({
  voices,
  selectedVoiceId,
  onSelect,
  loading = false,
  disabled = false,
}: VoiceSelectorProps) {
  const [previewPlaying, setPreviewPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const playPreview = async (voice: VoiceConfig, e: React.MouseEvent) => {
    e.stopPropagation();

    if (previewPlaying === voice.voiceId) {
      audioRef.current?.pause();
      setPreviewPlaying(null);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
    }

    if (voice.previewUrl) {
      const audio = new Audio(voice.previewUrl);
      audio.onended = () => setPreviewPlaying(null);
      audio.onerror = () => setPreviewPlaying(null);
      audioRef.current = audio;
      setPreviewPlaying(voice.voiceId);
      try {
        await audio.play();
      } catch {
        setPreviewPlaying(null);
      }
    }
  };

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-14 bg-gray-800 rounded-lg animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (voices.length === 0) {
    return (
      <div className="text-center text-gray-500 py-4 text-sm">
        No voices available
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {voices.map((voice) => {
        const isSelected = selectedVoiceId === voice.voiceId;
        const genderIcon = voice.labels?.gender === 'female' ? '♀' : '♂';
        const genderColor = voice.labels?.gender === 'female'
          ? 'text-pink-400'
          : 'text-blue-400';

        return (
          <button
            key={voice.voiceId}
            onClick={() => !disabled && onSelect(voice.voiceId)}
            disabled={disabled}
            className={`
              w-full flex items-center justify-between p-3 rounded-lg border-2 transition-all
              ${isSelected
                ? 'border-purple-500 bg-purple-500/20'
                : 'border-gray-700 bg-gray-800 hover:border-gray-600'
              }
              ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
            `}
          >
            <div className="flex items-center gap-3">
              <div className={`
                w-8 h-8 rounded-full flex items-center justify-center text-lg
                ${voice.labels?.gender === 'female'
                  ? 'bg-pink-500/20'
                  : 'bg-blue-500/20'
                }
              `}>
                <span className={genderColor}>{genderIcon}</span>
              </div>
              <div className="text-left">
                <div className="font-medium text-white text-sm">{voice.name}</div>
                {voice.labels?.accent && (
                  <div className="text-xs text-gray-500">
                    {voice.labels.accent} accent
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {voice.previewUrl && (
                <button
                  onClick={(e) => playPreview(voice, e)}
                  disabled={disabled}
                  className="p-1.5 rounded-full hover:bg-gray-700 transition-colors text-gray-400 hover:text-white"
                  title="Preview voice"
                >
                  {previewPlaying === voice.voiceId ? (
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              )}

              {isSelected && (
                <svg className="w-5 h-5 text-purple-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
