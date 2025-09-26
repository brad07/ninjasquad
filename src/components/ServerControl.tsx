import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { PlusIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { ServerCard } from './ServerCard';
import type { OpenCodeServer } from '../types';

interface ServerControlProps {
  servers: OpenCodeServer[];
  onServersUpdate: (servers: OpenCodeServer[]) => void;
}

const ServerControl: React.FC<ServerControlProps> = ({ servers, onServersUpdate }) => {
  const [isSpawning, setIsSpawning] = useState(false);
  const [port, setPort] = useState(4096);

  useEffect(() => {
    loadServers();
  }, []);

  const loadServers = async () => {
    try {
      const serverList = await invoke<OpenCodeServer[]>('list_opencode_servers');
      onServersUpdate(serverList);
    } catch (error) {
      console.error('Failed to load servers:', error);
    }
  };

  const spawnServer = async () => {
    setIsSpawning(true);
    try {
      const newServer = await invoke<OpenCodeServer>('spawn_opencode_server', { port });
      onServersUpdate([...servers, newServer]);
      setPort(port + 1); // Increment port for next server
    } catch (error) {
      console.error('Failed to spawn server:', error);
      alert(`Failed to spawn server: ${error}`);
    } finally {
      setIsSpawning(false);
    }
  };

  const handleStop = async (serverId: string) => {
    try {
      await invoke('stop_opencode_server', { server_id: serverId });
      await loadServers();
    } catch (error) {
      console.error('Failed to stop server:', error);
      alert(`Failed to stop server: ${error}`);
    }
  };

  const handleHealthCheck = async (serverId: string) => {
    try {
      const healthy = await invoke<boolean>('health_check_server', { server_id: serverId });
      alert(`Server ${serverId} is ${healthy ? 'healthy' : 'unhealthy'}`);
      await loadServers();
    } catch (error) {
      console.error('Failed to check server health:', error);
      alert(`Failed to check server health: ${error}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Control Panel */}
      <div className="card">
        <h2 className="text-xl font-semibold mb-4">Server Control</h2>
        <div className="flex items-end gap-4">
          <div className="flex-1">
            <label htmlFor="port" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Port Number
            </label>
            <input
              type="number"
              id="port"
              value={port}
              onChange={(e) => setPort(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700"
              min="1024"
              max="65535"
            />
          </div>
          <button
            onClick={spawnServer}
            disabled={isSpawning}
            className="btn-primary flex items-center gap-2"
          >
            <PlusIcon className="h-5 w-5" />
            {isSpawning ? 'Spawning...' : 'Spawn Server'}
          </button>
          <button
            onClick={loadServers}
            className="btn-secondary flex items-center gap-2"
          >
            <ArrowPathIcon className="h-5 w-5" />
            Refresh
          </button>
        </div>
      </div>

      {/* Server List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {servers.map((server) => (
          <ServerCard
            key={server.id}
            server={server}
            onStop={() => handleStop(server.id)}
            onHealthCheck={() => handleHealthCheck(server.id)}
          />
        ))}
      </div>

      {servers.length === 0 && (
        <div className="text-center py-12">
          <ServerIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">No servers running</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
            Click "Spawn Server" to create your first OpenCode server
          </p>
        </div>
      )}
    </div>
  );
};

function ServerIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
    </svg>
  );
}

export default ServerControl;