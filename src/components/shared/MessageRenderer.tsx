import React from 'react';
import { ToolUseDisplay, ToolUse } from './ToolUseDisplay';

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: number;
  toolUses?: ToolUse[];
  isStreaming?: boolean;
}

export interface MessageRendererProps {
  messages: ConversationMessage[];
  themeColor?: 'cyan' | 'purple' | 'green' | 'yellow';
  onToolApprove?: (toolId: string) => void;
  onToolDeny?: (toolId: string) => void;
  showToolApprovalButtons?: boolean;
  expandedTools?: Set<string>;
  onToggleToolExpand?: (toolId: string) => void;
}

const themeColors = {
  cyan: {
    user: 'bg-cyan-950/30 border-cyan-500/30',
    assistant: 'bg-gray-800/30 border-gray-600/30',
    userText: 'text-cyan-100',
    assistantText: 'text-gray-100'
  },
  purple: {
    user: 'bg-purple-950/30 border-purple-500/30',
    assistant: 'bg-gray-800/30 border-gray-600/30',
    userText: 'text-purple-100',
    assistantText: 'text-gray-100'
  },
  green: {
    user: 'bg-green-950/30 border-green-500/30',
    assistant: 'bg-gray-800/30 border-gray-600/30',
    userText: 'text-green-100',
    assistantText: 'text-gray-100'
  },
  yellow: {
    user: 'bg-yellow-950/30 border-yellow-500/30',
    assistant: 'bg-gray-800/30 border-gray-600/30',
    userText: 'text-yellow-100',
    assistantText: 'text-gray-100'
  }
};

export const MessageRenderer: React.FC<MessageRendererProps> = ({
  messages,
  themeColor = 'cyan',
  onToolApprove,
  onToolDeny,
  showToolApprovalButtons = false,
  expandedTools = new Set(),
  onToggleToolExpand
}) => {
  const colors = themeColors[themeColor];

  const formatTimestamp = (timestamp?: number) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  };

  return (
    <div className="space-y-4">
      {messages.map((message, idx) => (
        <div key={idx} className="animate-in fade-in duration-200">
          {/* Message Header */}
          <div className="flex items-center gap-2 mb-2">
            <span className={`font-mono text-xs font-bold ${
              message.role === 'user' ? 'text-cyan-400' : 'text-purple-400'
            }`}>
              {message.role === 'user' ? '>' : 'λ'} {message.role.toUpperCase()}
            </span>
            {message.timestamp && (
              <span className="text-xs text-gray-500">
                {formatTimestamp(message.timestamp)}
              </span>
            )}
            {message.isStreaming && (
              <span className="text-xs text-yellow-400 animate-pulse">
                ● STREAMING
              </span>
            )}
          </div>

          {/* Message Content */}
          <div className={`border rounded p-4 ${
            message.role === 'user'
              ? `${colors.user} ${colors.userText}`
              : `${colors.assistant} ${colors.assistantText}`
          }`}>
            <div className="font-mono text-sm whitespace-pre-wrap">
              {message.content || <span className="text-gray-500 italic">No content</span>}
            </div>

            {/* Tool Uses */}
            {message.toolUses && message.toolUses.length > 0 && (
              <div className="mt-4 space-y-2">
                <div className="text-xs text-gray-400 font-mono mb-2">
                  TOOL USES ({message.toolUses.length}):
                </div>
                {message.toolUses.map((tool) => (
                  <ToolUseDisplay
                    key={tool.id}
                    tool={tool}
                    themeColor={themeColor}
                    onApprove={onToolApprove}
                    onDeny={onToolDeny}
                    showApprovalButtons={showToolApprovalButtons}
                    isExpanded={expandedTools.has(tool.id)}
                    onToggleExpand={() => onToggleToolExpand?.(tool.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};