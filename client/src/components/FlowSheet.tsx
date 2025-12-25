/**
 * FlowSheet Component
 * 
 * Displays the debate flow with arguments organized by speech column.
 */

import type { FlowState, Argument, SpeechRole, Side } from '@shared/types';

interface FlowSheetProps {
  flowState: FlowState;
}

const SPEECH_INFO: Record<SpeechRole, { label: string; fullName: string; side: Side }> = {
  AC: { label: 'AC', fullName: 'Affirmative Constructive', side: 'AFF' },
  NC: { label: 'NC', fullName: 'Negative Constructive', side: 'NEG' },
  '1AR': { label: '1AR', fullName: '1st Aff Rebuttal', side: 'AFF' },
  NR: { label: 'NR', fullName: 'Negative Rebuttal', side: 'NEG' },
  '2AR': { label: '2AR', fullName: '2nd Aff Rebuttal', side: 'AFF' },
};

const SPEECH_ORDER: SpeechRole[] = ['AC', 'NC', '1AR', 'NR', '2AR'];

export function FlowSheet({ flowState }: FlowSheetProps) {
  return (
    <div className="flow-sheet">
      <h3 className="text-lg font-bold mb-3 text-white">Debate Flow</h3>
      <div className="grid grid-cols-5 gap-2">
        {SPEECH_ORDER.map((speech) => {
          const info = SPEECH_INFO[speech];
          const arguments_ = flowState.arguments.filter(a => a.speech === speech);
          
          return (
            <FlowColumn
              key={speech}
              speech={speech}
              info={info}
              arguments_={arguments_}
            />
          );
        })}
      </div>
    </div>
  );
}

interface FlowColumnProps {
  speech: SpeechRole;
  info: { label: string; fullName: string; side: Side };
  arguments_: Argument[];
}

function FlowColumn({ speech: _speech, info, arguments_ }: FlowColumnProps) {
  const sideColor = info.side === 'AFF' ? 'border-blue-500' : 'border-red-500';
  const sideBg = info.side === 'AFF' ? 'bg-blue-500/10' : 'bg-red-500/10';

  return (
    <div className={`rounded-lg p-2 ${sideBg} border-t-2 ${sideColor}`}>
      {/* Header */}
      <div className="text-center mb-2">
        <div className="font-bold text-sm text-white">{info.label}</div>
        <div className="text-xs text-gray-500">{info.fullName}</div>
      </div>

      {/* Arguments */}
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {arguments_.length === 0 ? (
          <div className="text-xs text-gray-600 italic text-center py-2">
            No arguments
          </div>
        ) : (
          arguments_.map((arg) => (
            <ArgumentCard key={arg.id} argument={arg} />
          ))
        )}
      </div>
    </div>
  );
}

interface ArgumentCardProps {
  argument: Argument;
}

function ArgumentCard({ argument }: ArgumentCardProps) {
  const typeColors: Record<string, string> = {
    value: 'border-l-purple-500',
    criterion: 'border-l-indigo-500',
    contention: 'border-l-green-500',
    subpoint: 'border-l-teal-500',
    response: 'border-l-yellow-500',
    rebuttal: 'border-l-orange-500',
    extension: 'border-l-blue-500',
  };

  const typeLabels: Record<string, string> = {
    value: 'V',
    criterion: 'VC',
    contention: 'C',
    subpoint: '•',
    response: '→',
    rebuttal: '⟳',
    extension: '↗',
  };

  return (
    <div className={`bg-gray-800/80 rounded p-2 text-xs border-l-2 ${typeColors[argument.type] || 'border-l-gray-500'}`}>
      {/* Title */}
      <div className="font-medium text-white mb-1 flex items-center gap-1">
        <span className="text-gray-500">{typeLabels[argument.type]}</span>
        <span className="truncate">{argument.title}</span>
      </div>

      {/* CWI Structure */}
      <div className="text-gray-400 space-y-0.5">
        <p className="line-clamp-2">
          <span className="text-blue-400 font-medium">C:</span> {argument.claim}
        </p>
        {argument.warrant && (
          <p className="line-clamp-2">
            <span className="text-green-400 font-medium">W:</span> {argument.warrant}
          </p>
        )}
        {argument.impact && (
          <p className="line-clamp-2">
            <span className="text-red-400 font-medium">I:</span> {argument.impact}
          </p>
        )}
      </div>

      {/* Response indicator */}
      {argument.respondsTo.length > 0 && (
        <div className="mt-1 text-gray-500 text-xs italic">
          ↪ responds to prior
        </div>
      )}
    </div>
  );
}

