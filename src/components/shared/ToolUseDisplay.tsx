import React, { useState } from 'react';

export interface ToolUse {
  id: string;
  name: string;
  input: Record<string, any>;
  status: 'pending' | 'approved' | 'denied' | 'executed' | 'error';
  result?: string;
  error?: string;
  timestamp?: number;
}

export interface ToolUseDisplayProps {
  tool: ToolUse;
  themeColor?: 'cyan' | 'purple' | 'green' | 'yellow';
  onApprove?: (toolId: string) => void;
  onDeny?: (toolId: string) => void;
  showApprovalButtons?: boolean;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

const themeColors = {
  cyan: {
    border: 'border-cyan-500/30',
    bg: 'bg-cyan-950/30',
    text: 'text-cyan-400',
    button: 'bg-cyan-600 hover:bg-cyan-700'
  },
  purple: {
    border: 'border-purple-500/30',
    bg: 'bg-purple-950/30',
    text: 'text-purple-400',
    button: 'bg-purple-600 hover:bg-purple-700'
  },
  green: {
    border: 'border-green-500/30',
    bg: 'bg-green-950/30',
    text: 'text-green-400',
    button: 'bg-green-600 hover:bg-green-700'
  },
  yellow: {
    border: 'border-yellow-500/30',
    bg: 'bg-yellow-950/30',
    text: 'text-yellow-400',
    button: 'bg-yellow-600 hover:bg-yellow-700'
  }
};

const statusIcons = {
  pending: '⏳',
  approved: '✓',
  denied: '✗',
  executed: '✓',
  error: '⚠'
};

const statusColors = {
  pending: 'text-yellow-400',
  approved: 'text-green-400',
  denied: 'text-red-400',
  executed: 'text-green-400',
  error: 'text-red-400'
};

export const ToolUseDisplay: React.FC<ToolUseDisplayProps> = ({
  tool,
  themeColor = 'cyan',
  onApprove,
  onDeny,
  showApprovalButtons = false,
  isExpanded: controlledExpanded,
  onToggleExpand
}) => {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const colors = themeColors[themeColor];

  // Use controlled or internal state
  const isExpanded = controlledExpanded !== undefined ? controlledExpanded : internalExpanded;
  const toggleExpand = onToggleExpand || (() => setInternalExpanded(!internalExpanded));

  const formatTimestamp = (timestamp?: number) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  };

  const formatJson = (obj: any) => {
    return JSON.stringify(obj, null, 2);
  };

  return (
    <div className={`border ${colors.border} rounded ${colors.bg} overflow-hidden`}>
      {/* Tool Header */}
      <div
        className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-gray-800/30 transition-colors"
        onClick={toggleExpand}
      >
        <div className="flex items-center gap-3">
          {/* Expand/Collapse Icon */}
          <span className="text-gray-400 text-xs">
            {isExpanded ? '▼' : '▶'}
          </span>

          {/* Tool Name */}
          <span className={`font-mono text-sm ${colors.text}`}>
            {tool.name}
          </span>

          {/* Status */}
          <span className={`text-sm ${statusColors[tool.status]}`}>
            {statusIcons[tool.status]} {tool.status.toUpperCase()}
          </span>

          {/* Timestamp */}
          {tool.timestamp && (
            <span className="text-xs text-gray-500">
              {formatTimestamp(tool.timestamp)}
            </span>
          )}
        </div>

        {/* Approval Buttons */}
        {showApprovalButtons && tool.status === 'pending' && onApprove && onDeny && (
          <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => onApprove(tool.id)}
              className="px-3 py-1 text-xs font-mono bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
            >
              Approve
            </button>
            <button
              onClick={() => onDeny(tool.id)}
              className="px-3 py-1 text-xs font-mono bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
            >
              Deny
            </button>
          </div>
        )}
      </div>

      {/* Tool Details */}
      {isExpanded && (
        <div className="px-3 py-2 border-t border-gray-700/50 space-y-3">
          {/* Input */}
          <div>
            <div className="text-xs text-gray-400 mb-1 font-mono">INPUT:</div>
            <pre className="text-xs font-mono text-gray-300 bg-black/30 p-2 rounded overflow-x-auto">
              {formatJson(tool.input)}
            </pre>
          </div>

          {/* Result */}
          {tool.result && (
            <div>
              <div className="text-xs text-gray-400 mb-1 font-mono">RESULT:</div>
              <pre className="text-xs font-mono text-gray-300 bg-black/30 p-2 rounded overflow-x-auto max-h-48 overflow-y-auto">
                {tool.result}
              </pre>
            </div>
          )}

          {/* Error */}
          {tool.error && (
            <div>
              <div className="text-xs text-red-400 mb-1 font-mono">ERROR:</div>
              <pre className="text-xs font-mono text-red-300 bg-red-950/30 p-2 rounded overflow-x-auto">
                {tool.error}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};