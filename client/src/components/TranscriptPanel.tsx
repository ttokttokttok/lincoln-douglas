/**
 * TranscriptPanel Component
 * 
 * Displays real-time transcripts with translations from the debate.
 */

import { useEffect, useRef } from 'react';
import { useTranscriptStore, type Transcript } from '../stores/transcriptStore';
import { LANGUAGES } from '@shared/types';

interface TranscriptPanelProps {
  myParticipantId: string | null;
  myLanguage?: string;
}

export function TranscriptPanel({ myParticipantId, myLanguage }: TranscriptPanelProps) {
  const { transcripts } = useTranscriptStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to latest transcript
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcripts]);

  if (transcripts.length === 0) {
    return (
      <div className="card">
        <h3 className="font-semibold mb-2 text-sm">Live Transcript</h3>
        <div className="text-gray-500 text-sm italic">
          Transcripts will appear here when someone speaks...
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <h3 className="font-semibold mb-2 text-sm flex items-center gap-2">
        <span className="inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse" />
        Live Transcript
      </h3>
      <div 
        ref={scrollRef}
        className="space-y-3 max-h-64 overflow-y-auto"
      >
        {transcripts.map((transcript) => (
          <TranscriptItem
            key={transcript.id}
            transcript={transcript}
            isMe={transcript.speakerId === myParticipantId}
            showTranslation={transcript.language !== myLanguage}
          />
        ))}
      </div>
    </div>
  );
}

interface TranscriptItemProps {
  transcript: Transcript;
  isMe: boolean;
  showTranslation: boolean;
}

function TranscriptItem({ transcript, isMe, showTranslation }: TranscriptItemProps) {
  const langInfo = LANGUAGES.find((l) => l.code === transcript.language);
  const translationLangInfo = transcript.translation 
    ? LANGUAGES.find((l) => l.code === transcript.translation?.language)
    : null;

  return (
    <div className={`text-sm ${isMe ? 'text-blue-300' : 'text-gray-300'}`}>
      {/* Header */}
      <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
        <span className="font-medium">
          {transcript.speakerName}
          {isMe && ' (you)'}
        </span>
        <span>•</span>
        <span>{langInfo?.flag} {transcript.speechId}</span>
        {transcript.translation && (
          <>
            <span>•</span>
            <span className="text-emerald-500">
              +{transcript.translation.latencyMs}ms
            </span>
          </>
        )}
      </div>

      {/* Dual transcript display */}
      <div className="space-y-1">
        {/* Original text */}
        <div className="pl-2 border-l-2 border-gray-700">
          <span className="text-xs text-gray-600 mr-1">{langInfo?.flag}</span>
          {transcript.text}
        </div>

        {/* Translation (if available and needed) */}
        {showTranslation && transcript.translation && (
          <div className="pl-2 border-l-2 border-emerald-600/50 text-emerald-200">
            <span className="text-xs text-gray-600 mr-1">{translationLangInfo?.flag}</span>
            {transcript.translation.text}
          </div>
        )}

        {/* Translation pending indicator */}
        {showTranslation && !transcript.translation && (
          <div className="pl-2 border-l-2 border-gray-600 text-gray-500 italic text-xs">
            Translating...
          </div>
        )}
      </div>
    </div>
  );
}

