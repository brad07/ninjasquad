import React, { useState, useEffect } from 'react';
import { Brain, ChevronDown, ChevronUp } from 'lucide-react';
import { type SenseiRecommendation } from '../../services/SenseiService';

interface SenseiRecommendationCardProps {
  recommendation: SenseiRecommendation;
  isNew?: boolean;
  onApprove: (id: string, editedText?: string) => void;
  onDeny: (id: string) => void;
}

export const SenseiRecommendationCard: React.FC<SenseiRecommendationCardProps> = ({
  recommendation: rec,
  isNew = false,
  onApprove,
  onDeny
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isInputExpanded, setIsInputExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState(rec.recommendation);

  // Collapse the recommendation when it's accepted or denied
  useEffect(() => {
    if (rec.executed) {
      setIsExpanded(false);
      setIsInputExpanded(false);
    }
  }, [rec.executed]);

  const truncateText = (text: string, maxLength: number = 200) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  const needsTruncation = rec.recommendation.length > 200;
  const inputNeedsTruncation = rec.input && rec.input.length > 100;

  return (
    <div
      className={`p-4 border-2 border-gray-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-1px] hover:translate-y-[-1px] transition-all rounded-lg ${
        isNew ? 'bg-purple-50 animate-pulse' : 'bg-white'
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          {/* Source label */}
          <span className={`text-xs px-2 py-1 rounded-md border-2 font-bold flex items-center gap-1 ${
            rec.source === 'sensei' ? 'bg-purple-100 border-purple-600 text-purple-800' :
            rec.source === 'claude-code' ? 'bg-orange-100 border-orange-600 text-orange-800' :
            rec.source === 'agent' ? 'bg-blue-100 border-blue-600 text-blue-800' :
            'bg-indigo-100 border-indigo-600 text-indigo-800'
          }`}>
            {rec.source === 'sensei' ? (
              <>
                <Brain className="h-3 w-3" />
                SensAI
              </>
            ) : rec.source === 'claude-code' ? '🤖 Claude Code' :
             rec.source === 'agent' ? '🤖 Agent' :
             rec.source === 'ollama-dev-monitor' ? '🔍 Server monitor' :
             '🤖 ' + rec.source.replace('-', ' ').toUpperCase()}
          </span>

          <span className="text-xs text-gray-600 font-medium">
            {rec.timestamp.toLocaleTimeString()}
          </span>
        </div>
      </div>

      {/* Show user input if available */}
      {rec.input && (
        <div className="mb-3 p-2 bg-gray-50 rounded border border-gray-300">
          <p className="text-xs text-gray-600 font-semibold mb-1">User asked:</p>
          <p className="text-xs text-gray-700 whitespace-pre-wrap">
            {isInputExpanded ? rec.input : truncateText(rec.input, 100)}
          </p>
          {inputNeedsTruncation && (
            <button
              onClick={() => setIsInputExpanded(!isInputExpanded)}
              className="mt-1 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
            >
              {isInputExpanded ? (
                <>
                  <ChevronUp className="h-3 w-3" />
                  Show less
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3" />
                  Show more
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* Recommendation */}
      {isEditing ? (
        <div className="mb-3">
          <textarea
            value={editedText}
            onChange={(e) => setEditedText(e.target.value)}
            className="w-full p-3 text-sm text-gray-800 font-medium border-2 border-blue-500 rounded bg-blue-50 focus:outline-none focus:border-blue-600 resize-y min-h-[100px]"
            placeholder="Edit recommendation..."
          />
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-800 mb-3 font-medium whitespace-pre-wrap">
            {isExpanded ? rec.recommendation : truncateText(rec.recommendation)}
          </p>

          {needsTruncation && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="mb-3 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="h-3 w-3" />
                  Show less
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3" />
                  Show more
                </>
              )}
            </button>
          )}
        </>
      )}

      {rec.command && (
        <div className="mt-3 p-3 bg-gray-900 rounded-lg border-2 border-gray-900 overflow-hidden">
          <code className="text-xs text-gray-100 font-mono font-medium overflow-x-auto whitespace-nowrap scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-gray-900">
            Suggested command: {rec.command}
          </code>
        </div>
      )}

      <div className="mt-3 flex items-center justify-between gap-4">
        {rec.confidence !== undefined && rec.confidence > 0 && (
          <span className="text-xs text-gray-600 font-medium">
            Confidence: {(rec.confidence * 100).toFixed(0)}%
          </span>
        )}

        {!rec.executed && (
          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <button
                  onClick={() => {
                    onApprove(rec.id, editedText);
                    setIsEditing(false);
                  }}
                  className="px-3 py-1.5 bg-green-400 text-black font-bold text-xs border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:bg-green-500 transition-all rounded"
                  title="Save and approve"
                >
                  Save & Approve
                </button>
                <button
                  onClick={() => {
                    setEditedText(rec.recommendation);
                    setIsEditing(false);
                  }}
                  className="px-3 py-1.5 bg-gray-400 text-black font-bold text-xs border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:bg-gray-500 transition-all rounded"
                  title="Cancel editing"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setIsEditing(true)}
                  className="px-3 py-1.5 bg-blue-400 text-black font-bold text-xs border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:bg-blue-500 transition-all rounded"
                  title="Edit recommendation before approving"
                >
                  Edit
                </button>
                <button
                  onClick={() => onApprove(rec.id)}
                  className="px-3 py-1.5 bg-green-400 text-black font-bold text-xs border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:bg-green-500 transition-all rounded"
                  title="Approve recommendation"
                >
                  Approve
                </button>
                <button
                  onClick={() => onDeny(rec.id)}
                  className="px-3 py-1.5 bg-red-400 text-black font-bold text-xs border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:bg-red-500 transition-all rounded"
                  title="Deny recommendation"
                >
                  Deny
                </button>
              </>
            )}
          </div>
        )}

        {rec.executed && (
          <span className={`text-xs px-2 py-0.5 rounded-full border-2 font-bold ${
            rec.denied
              ? 'bg-red-100 text-red-800 border-red-600'
              : 'bg-green-100 text-green-800 border-green-600'
          }`}>
            {rec.denied ? 'Denied' : rec.autoApproved ? 'Auto-approved' : 'Approved'}
          </span>
        )}
      </div>
    </div>
  );
};