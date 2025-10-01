import React from 'react';
import type { PluginUIProps } from '../../types/plugin';
import { useClaudeAgentSessions } from '../../hooks/useClaudeAgentSessions';
import { ClaudeAgentTabBar } from './ClaudeAgentTabBar';
import ClaudeAgentDirectUI from './ClaudeAgentDirectUI';

/**
 * Multi-session wrapper for Claude Agent
 * Manages multiple independent agent sessions with tabbed interface
 */
const ClaudeAgentMultiSession: React.FC<PluginUIProps> = (props) => {
  const {
    sessions,
    activeSessionId,
    createSession,
    closeSession,
    switchSession,
    updateSessionTitle,
    updateSessionMessages,
    updateSessionLoading,
    updateSessionLogs,
    getSessionsList
  } = useClaudeAgentSessions(props.config?.workingDirectory);

  const sessionsList = getSessionsList();

  const handleCreateSession = () => {
    const sessionNumber = sessions.size + 1;
    const newSessionId = createSession(`Session ${sessionNumber}`);
    switchSession(newSessionId);
  };

  const handleCloseSession = (sessionId: string) => {
    // Prevent closing the last session
    if (sessions.size <= 1) {
      console.log('[MultiSession] Cannot close last session');
      return;
    }
    closeSession(sessionId);
  };

  const activeSession = sessions.get(activeSessionId || '');

  return (
    <div className="h-full flex flex-col bg-purple-100">
      {/* Tab bar */}
      <ClaudeAgentTabBar
        sessions={sessionsList}
        activeSessionId={activeSessionId}
        onSwitchSession={switchSession}
        onCreateSession={handleCreateSession}
        onCloseSession={handleCloseSession}
        onRenameSession={updateSessionTitle}
      />

      {/* Active session content */}
      {activeSessionId && activeSession && (
        <div className="flex-1 overflow-hidden">
          <ClaudeAgentDirectUI
            {...props}
            session={{
              ...props.session,
              id: activeSessionId
            }}
            sessionState={activeSession}
            onUpdateSessionLogs={updateSessionLogs}
            onUpdateSessionLoading={updateSessionLoading}
            onUpdateSessionMessages={updateSessionMessages}
          />
        </div>
      )}
    </div>
  );
};

export default ClaudeAgentMultiSession;