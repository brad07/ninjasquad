import React, { useState } from 'react';
import { Plus, X, Edit2, Check } from 'lucide-react';
import type { SessionState } from '../../types/claude-agent-session';

interface ClaudeAgentTabBarProps {
  sessions: SessionState[];
  activeSessionId: string | null;
  onSwitchSession: (sessionId: string) => void;
  onCreateSession: () => void;
  onCloseSession: (sessionId: string) => void;
  onRenameSession: (sessionId: string, newTitle: string) => void;
}

export const ClaudeAgentTabBar: React.FC<ClaudeAgentTabBarProps> = ({
  sessions,
  activeSessionId,
  onSwitchSession,
  onCreateSession,
  onCloseSession,
  onRenameSession
}) => {
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const startEditing = (session: SessionState, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSessionId(session.sessionId);
    setEditTitle(session.title);
  };

  const finishEditing = (sessionId: string) => {
    if (editTitle.trim()) {
      onRenameSession(sessionId, editTitle.trim());
    }
    setEditingSessionId(null);
    setEditTitle('');
  };

  const cancelEditing = () => {
    setEditingSessionId(null);
    setEditTitle('');
  };

  return (
    <div className="flex items-center bg-gradient-to-b from-gray-700 to-gray-800 border-b-4 border-black p-1 gap-1 overflow-x-auto">
      {/* Session tabs */}
      {sessions.map((session) => {
        const isActive = session.sessionId === activeSessionId;
        const isEditing = editingSessionId === session.sessionId;

        return (
          <div
            key={session.sessionId}
            onClick={() => !isEditing && onSwitchSession(session.sessionId)}
            className={`
              group relative flex items-center gap-2 px-3 py-1.5 border-2 border-black
              ${isActive
                ? 'bg-gradient-to-b from-purple-400 to-purple-500 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                : 'bg-gradient-to-b from-gray-500 to-gray-600 hover:from-gray-400 hover:to-gray-500'
              }
              transition-all cursor-pointer min-w-[120px] max-w-[200px]
            `}
          >
            {/* Session title or edit input */}
            {isEditing ? (
              <div className="flex items-center gap-1 flex-1">
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') finishEditing(session.sessionId);
                    if (e.key === 'Escape') cancelEditing();
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="flex-1 px-1 py-0.5 bg-white border border-black text-xs font-mono text-black focus:outline-none focus:border-cyan-400"
                  autoFocus
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    finishEditing(session.sessionId);
                  }}
                  className="p-0.5 bg-green-400 border border-black hover:bg-green-300"
                >
                  <Check className="w-3 h-3 text-black" />
                </button>
              </div>
            ) : (
              <>
                {/* Loading indicator */}
                {session.isLoading && (
                  <div className="w-2 h-2 bg-cyan-400 border border-black rounded-full animate-pulse"></div>
                )}

                {/* Session title */}
                <span className="font-mono text-xs font-bold text-white truncate flex-1">
                  {session.title}
                </span>

                {/* Edit button (show on hover) */}
                {isActive && (
                  <button
                    onClick={(e) => startEditing(session, e)}
                    className="opacity-0 group-hover:opacity-100 p-0.5 bg-gray-700 border border-black hover:bg-gray-600 transition-opacity"
                    title="Rename session"
                  >
                    <Edit2 className="w-3 h-3 text-white" />
                  </button>
                )}

                {/* Close button */}
                {sessions.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloseSession(session.sessionId);
                    }}
                    className="p-0.5 bg-red-400 border border-black hover:bg-red-500"
                    title="Close session"
                  >
                    <X className="w-3 h-3 text-black" />
                  </button>
                )}
              </>
            )}
          </div>
        );
      })}

      {/* New session button */}
      <button
        onClick={onCreateSession}
        className="flex items-center gap-1 px-3 py-1.5 bg-gradient-to-b from-cyan-400 to-cyan-500 border-2 border-black hover:from-cyan-300 hover:to-cyan-400 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] transition-all"
        title="New session"
      >
        <Plus className="w-4 h-4 text-black font-bold" strokeWidth={3} />
        <span className="font-mono text-xs font-bold text-black">NEW</span>
      </button>
    </div>
  );
};