import React, { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Terminal as TerminalIcon, Monitor, RefreshCw } from 'lucide-react';
import type { PluginUIProps } from '../../types/plugin';

/**
 * OpenCode UI Component - handles tmux terminal display and interaction
 * This is essentially the existing tmux functionality extracted into a plugin component
 */
const OpenCodeUI: React.FC<PluginUIProps> = ({
  plugin,
  session,
  server,
  onCommand,
  config
}) => {
  const [tmuxOutput, setTmuxOutput] = useState<string[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const terminalRef = useRef<HTMLDivElement>(null);
  const refreshIntervalRef = useRef<NodeJS.Timer | null>(null);

  useEffect(() => {
    if (session && autoRefresh) {
      // Start auto-refresh for tmux content
      refreshIntervalRef.current = setInterval(() => {
        captureTmuxContent();
      }, 1000);

      return () => {
        if (refreshIntervalRef.current) {
          clearInterval(refreshIntervalRef.current);
        }
      };
    }
  }, [session, autoRefresh]);

  useEffect(() => {
    // Auto-scroll to bottom when new content arrives
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [tmuxOutput]);

  const captureTmuxContent = async () => {
    if (!session) return;

    try {
      setIsCapturing(true);
      const content = await invoke<string>('capture_tmux_content', {
        sessionId: session.id
      });

      const lines = content.split('\n');
      setTmuxOutput(lines);
    } catch (error) {
      console.error('Failed to capture tmux content:', error);
    } finally {
      setIsCapturing(false);
    }
  };

  const handleSendCommand = (command: string) => {
    if (session) {
      onCommand(command);
    }
  };

  const cleanAnsiEscapes = (text: string): string => {
    // Remove ANSI escape sequences for cleaner display
    return text
      .replace(/\x1b\[[0-9;]*m/g, '') // Remove color codes
      .replace(/\x1b\[[0-9;]*[A-Z]/g, '') // Remove cursor movement
      .replace(/\x1b\[[\?;0-9]*[hlm]/g, '') // Remove other escape sequences
      .replace(/\[\?7[lh]/g, '') // Remove wrap mode sequences
      .replace(/\[\?25[lh]/g, ''); // Remove cursor visibility sequences
  };

  if (!server) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        <div className="text-center">
          <TerminalIcon className="w-12 h-12 mx-auto mb-4 text-gray-600" />
          <p>No OpenCode server running</p>
          <p className="text-sm mt-2">Spawn a server to start coding</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        <div className="text-center">
          <Monitor className="w-12 h-12 mx-auto mb-4 text-gray-600" />
          <p>Connecting to OpenCode...</p>
          <p className="text-sm mt-2">Creating tmux session</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-gray-700">
      {/* Toolbar */}
      <div className="flex items-center justify-between p-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <TerminalIcon className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-300">OpenCode Terminal</span>
          </div>
          <div className="flex items-center space-x-2 text-xs text-gray-500">
            <span>Session: {session.id.substring(0, 8)}</span>
            <span>•</span>
            <span>Port: {server.port}</span>
            <span>•</span>
            <span>Model: {server.model}</span>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <label className="flex items-center space-x-2 text-sm text-gray-400">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            <span>Auto-refresh</span>
          </label>
          <button
            onClick={captureTmuxContent}
            disabled={isCapturing}
            className="p-1 hover:bg-gray-700 rounded transition-colors"
            title="Refresh terminal output"
          >
            <RefreshCw className={`w-4 h-4 text-gray-400 ${isCapturing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Terminal Display */}
      <div
        ref={terminalRef}
        className="flex-1 overflow-auto bg-black p-4 font-mono text-sm"
        style={{ minHeight: '400px' }}
      >
        {tmuxOutput.map((line, index) => {
          const cleaned = cleanAnsiEscapes(line);
          return (
            <div key={index} className="text-green-400 whitespace-pre-wrap">
              {cleaned || '\u00A0'}
            </div>
          );
        })}
      </div>

      {/* Command Input */}
      <div className="p-3 bg-gray-800 border-t border-gray-700">
        <div className="flex space-x-2">
          <input
            type="text"
            placeholder="Type a command..."
            className="flex-1 px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500"
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                const input = e.currentTarget;
                handleSendCommand(input.value);
                input.value = '';
              }
            }}
          />
          <button
            onClick={() => handleSendCommand('C-c')}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm transition-colors"
            title="Send Ctrl+C"
          >
            Cancel
          </button>
        </div>
      </div>

      {/* Status Bar */}
      <div className="px-3 py-1 bg-gray-700 border-t border-gray-600 text-xs text-gray-400 flex justify-between">
        <span>OpenCode {plugin.version}</span>
        <span>{tmuxOutput.length} lines</span>
      </div>
    </div>
  );
};

export default OpenCodeUI;