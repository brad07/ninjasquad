import React from 'react';
import type { OpenCodeServer } from '../types';

interface ServerCardProps {
  server: OpenCodeServer;
  onStop?: () => void;
  onRestart?: () => void;
  onHealthCheck?: () => void;
}

export const ServerCard: React.FC<ServerCardProps> = ({
  server,
  onStop,
  onRestart,
  onHealthCheck,
}) => {
  const getStatusColor = () => {
    if (typeof server.status === 'string') {
      switch (server.status) {
        case 'Starting': return 'bg-yellow-500';
        case 'Running': return 'bg-green-500';
        case 'Stopped': return 'bg-gray-500';
        default: return 'bg-gray-500';
      }
    }
    return 'bg-red-500'; // Error status
  };

  const getStatusText = () => {
    if (typeof server.status === 'string') {
      return server.status;
    }
    return `Error: ${server.status.Error}`;
  };

  return (
    <div className="card" data-testid="server-card">
      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">OpenCode Server</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">{server.id}</p>
        </div>
        <div className="flex items-center">
          <span className={`w-3 h-3 rounded-full ${getStatusColor()} mr-2`}></span>
          <span className="text-sm text-gray-700 dark:text-gray-300">{getStatusText()}</span>
        </div>
      </div>

      <div className="text-sm space-y-1">
        <p className="text-gray-700 dark:text-gray-300">
          <span className="font-medium">Host:</span> {server.host}
        </p>
        <p className="text-gray-700 dark:text-gray-300">
          <span className="font-medium">Port:</span> {server.port}
        </p>
        {server.process_id && (
          <p className="text-gray-700 dark:text-gray-300">
            <span className="font-medium">PID:</span> {server.process_id}
          </p>
        )}
      </div>

      <div className="server-actions mt-4 flex gap-2">
        {server.status === 'Running' && (
          <>
            <button
              onClick={onStop}
              className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600"
              data-testid="stop-button"
            >
              Stop
            </button>
            <button
              onClick={onHealthCheck}
              className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
              data-testid="health-check-button"
            >
              Health Check
            </button>
          </>
        )}
        {server.status === 'Stopped' && (
          <button
            onClick={onRestart}
            className="px-3 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600"
            data-testid="restart-button"
          >
            Restart
          </button>
        )}
      </div>
    </div>
  );
};