import React, { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { TerminalView } from './TerminalView';
import type { OrchestratorSession } from '../types';

interface SessionViewProps {
  sessions: OrchestratorSession[];
  onSessionsUpdate: (sessions: OrchestratorSession[]) => void;
}

const SessionView: React.FC<SessionViewProps> = ({ sessions, onSessionsUpdate }) => {
  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    try {
      const sessionList = await invoke<OrchestratorSession[]>('list_sessions');
      onSessionsUpdate(sessionList);
    } catch (error) {
      console.error('Failed to load sessions:', error);
    }
  };

  const handleInput = async (sessionId: string, input: string) => {
    try {
      await invoke('send_input_to_session', { sessionId, input });
      await loadSessions();
    } catch (error) {
      console.error('Failed to send input:', error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Active Sessions</h2>
        <button onClick={loadSessions} className="btn-secondary">
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {sessions.map((session) => (
          <TerminalView
            key={session.id}
            session={session}
            output=""
            onInput={(input) => handleInput(session.id, input)}
          />
        ))}
      </div>

      {sessions.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500 dark:text-gray-400">No active sessions</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
            Start by spawning servers and creating sessions
          </p>
        </div>
      )}
    </div>
  );
};

export default SessionView;