import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { PaperAirplaneIcon } from '@heroicons/react/24/outline';
import { opencodeSDKService } from '../services/OpenCodeSDKService';
import type { OrchestratorSession } from '../types';
import type { ServerMode } from './ModeToggle';

interface TaskDistributionProps {
  sessions: OrchestratorSession[];
  serverMode: ServerMode;
}

const TaskDistribution: React.FC<TaskDistributionProps> = ({ sessions, serverMode }) => {
  const [prompt, setPrompt] = useState('');
  const [isDistributing, setIsDistributing] = useState(false);
  const [strategy, setStrategy] = useState<'RoundRobin' | 'Random' | 'LeastLoaded'>('RoundRobin');

  const distributeTask = async () => {
    if (!prompt.trim()) return;

    setIsDistributing(true);
    try {
      if (serverMode === 'sdk') {
        // SDK Mode: Actually send prompt to a session
        const extendedSessions = opencodeSDKService.listSDKSessions();
        const idleSession = extendedSessions.find(s => s.status === 'Idle');

        if (!idleSession) {
          alert('No SDK sessions available. Please create a session from a running SDK server first.');
          return;
        }

        const response = await opencodeSDKService.sendPromptToSession(idleSession.session.id, prompt);
        console.log('SDK Prompt response:', response);
        console.log('Session:', idleSession.session);

        // Log available models if we have them
        const server = opencodeSDKService.getSDKServer(idleSession.serverId);
        if (server?.config?.model) {
          console.log('Available model:', server.config.model);
        }

        alert(`Prompt sent to session "${idleSession.session.title}"! Check the Sessions tab to see the response.`);
        setPrompt('');

        // Refresh sessions to show the updated response
        if (window.loadSessions) {
          window.loadSessions();
        }
      } else {
        // Process Mode: Use existing Tauri command
        const taskId = await invoke<string>('distribute_task', { prompt, strategy });
        alert(`Task distributed successfully! Task ID: ${taskId}`);
        setPrompt('');
      }
    } catch (error) {
      console.error('Failed to distribute task:', error);
      alert(`Failed to distribute task: ${error}`);
    } finally {
      setIsDistributing(false);
    }
  };

  const availableSessions = sessions.filter(s => s.status === 'Idle').length;
  const extendedSessions = serverMode === 'sdk' ? opencodeSDKService.listSDKSessions() : [];
  const availableSDKSessions = extendedSessions.filter(s => s.status === 'Idle').length;

  return (
    <div className="space-y-6">
      <div className="card">
        <h2 className="text-xl font-semibold mb-4">Task Distribution</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Distribution Strategy
            </label>
            <select
              value={strategy}
              onChange={(e) => setStrategy(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-opencode-500 focus:border-opencode-500 dark:bg-gray-700"
            >
              <option value="RoundRobin">Round Robin</option>
              <option value="Random">Random</option>
              <option value="LeastLoaded">Least Loaded</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Task Prompt
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Enter your task prompt here..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-opencode-500 focus:border-opencode-500 dark:bg-gray-700"
              rows={4}
            />
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {serverMode === 'sdk' ? (
                <>SDK Sessions: {availableSDKSessions} / {extendedSessions.length}</>
              ) : (
                <>Available sessions: {availableSessions} / {sessions.length}</>
              )}
            </p>
            <button
              onClick={distributeTask}
              disabled={isDistributing || (serverMode === 'sdk' ? availableSDKSessions === 0 : availableSessions === 0) || !prompt.trim()}
              className="btn-primary flex items-center gap-2"
            >
              <PaperAirplaneIcon className="h-5 w-5" />
              {isDistributing ? 'Distributing...' : 'Distribute Task'}
            </button>
          </div>
        </div>
      </div>

      {/* Task History */}
      <div className="card">
        <h3 className="text-lg font-semibold mb-4">Recent Tasks</h3>
        <div className="space-y-2">
          {sessions
            .filter(s => s.task)
            .map((session) => (
              <div key={session.id} className="border-b dark:border-gray-700 pb-2 last:border-0">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{session.task?.prompt}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Session: {session.id} • {session.task?.assigned_at}
                    </p>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    session.status === 'Working' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                    session.status === 'Completed' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                    'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
                  }`}>
                    {typeof session.status === 'string' ? session.status : 'Failed'}
                  </span>
                </div>
              </div>
            ))}
          {sessions.filter(s => s.task).length === 0 && (
            <p className="text-gray-500 text-center py-4">No tasks distributed yet</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default TaskDistribution;