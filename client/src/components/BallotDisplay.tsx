/**
 * BallotDisplay Component
 * 
 * Shows the debate ballot with RFD and the flow sheet.
 */

import type { Ballot, FlowState } from '@shared/types';
import { FlowSheet } from './FlowSheet';

interface BallotDisplayProps {
  ballot: Ballot;
  flowState: FlowState;
  onClose?: () => void;
}

export function BallotDisplay({ ballot, flowState, onClose }: BallotDisplayProps) {
  const winnerColor = ballot.winner === 'AFF' ? 'text-blue-400' : 'text-red-400';
  const winnerBg = ballot.winner === 'AFF' ? 'bg-blue-500/20' : 'bg-red-500/20';

  return (
    <div className="fixed inset-0 bg-black/80 z-50 overflow-y-auto">
      <div className="min-h-screen py-8 px-4">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold text-white mb-2">Debate Complete</h1>
            <p className="text-gray-400">{ballot.resolution}</p>
          </div>

          {/* Winner Banner */}
          <div className={`${winnerBg} rounded-lg p-6 mb-6 text-center`}>
            <div className="text-sm text-gray-400 mb-1">Winner</div>
            <div className={`text-4xl font-bold ${winnerColor}`}>
              {ballot.winnerName}
            </div>
            <div className="text-lg text-gray-300 mt-2">
              ({ballot.winner === 'AFF' ? 'Affirmative' : 'Negative'})
            </div>
          </div>

          {/* Speaker Points */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-blue-500/10 rounded-lg p-4 text-center border border-blue-500/30">
              <div className="text-sm text-gray-400">Affirmative</div>
              <div className="text-3xl font-bold text-blue-400">{ballot.speakerPoints.AFF}</div>
              <div className="text-xs text-gray-500">Speaker Points</div>
            </div>
            <div className="bg-red-500/10 rounded-lg p-4 text-center border border-red-500/30">
              <div className="text-sm text-gray-400">Negative</div>
              <div className="text-3xl font-bold text-red-400">{ballot.speakerPoints.NEG}</div>
              <div className="text-xs text-gray-500">Speaker Points</div>
            </div>
          </div>

          {/* RFD Summary */}
          <div className="bg-gray-800 rounded-lg p-4 mb-6">
            <h3 className="text-lg font-bold text-white mb-2">Reason for Decision</h3>
            <p className="text-yellow-300 font-medium mb-3">{ballot.rfdSummary}</p>
            <div className="text-gray-300 whitespace-pre-wrap text-sm">
              {ballot.rfdDetails}
            </div>
          </div>

          {/* Voting Issues */}
          {ballot.votingIssues.length > 0 && (
            <div className="bg-gray-800 rounded-lg p-4 mb-6">
              <h3 className="text-lg font-bold text-white mb-3">Key Voting Issues</h3>
              <div className="space-y-3">
                {ballot.votingIssues.map((issue, i) => (
                  <div key={i} className="border-l-2 border-gray-600 pl-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-white">{issue.issue}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        issue.winner === 'AFF' 
                          ? 'bg-blue-500/30 text-blue-300' 
                          : 'bg-red-500/30 text-red-300'
                      }`}>
                        {issue.winner}
                      </span>
                    </div>
                    <p className="text-gray-400 text-sm">{issue.analysis}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Flow Sheet */}
          <div className="bg-gray-800 rounded-lg p-4 mb-6">
            <FlowSheet flowState={flowState} />
          </div>

          {/* Close Button */}
          {onClose && (
            <div className="text-center">
              <button
                onClick={onClose}
                className="btn-primary px-8"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

