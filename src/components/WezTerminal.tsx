import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface WezTerminalProps {
  serverId?: string;
  port?: number;
  onClose?: () => void;
}

const WezTerminal: React.FC<WezTerminalProps> = ({ serverId, port, onClose }) => {
  const [wezTermId, setWezTermId] = useState<string | null>(null);
  const [isLaunching, setIsLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (port) {
      launchWezTerm();
    }
  }, [port]);

  const launchWezTerm = async () => {
    if (!port) return;

    setIsLaunching(true);
    setError(null);

    try {
      // Spawn WezTerm in embedded mode
      const terminalId = await invoke<string>('spawn_wezterm_embedded', { port });
      setWezTermId(terminalId);
      console.log('WezTerm launched with ID:', terminalId);
    } catch (err) {
      console.error('Failed to launch WezTerm:', err);
      setError(String(err));
    } finally {
      setIsLaunching(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-gray-900">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center space-x-2">
          <div className={`w-2 h-2 rounded-full ${wezTermId ? 'bg-green-500' : 'bg-yellow-500'}`} />
          <span className="text-sm text-gray-300">
            {serverId ? `WezTerm - Port ${port}` : 'WezTerm Terminal'}
          </span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      <div className="flex-1 flex items-center justify-center bg-gray-900">
        {isLaunching && (
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-gray-400">Launching WezTerm...</p>
            <p className="text-sm text-gray-500 mt-2">This will open in a new window</p>
          </div>
        )}

        {error && (
          <div className="text-center">
            <div className="text-red-400 mb-4">
              <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-gray-400">Failed to launch WezTerm</p>
            <p className="text-sm text-gray-500 mt-2">{error}</p>
            <button
              onClick={launchWezTerm}
              className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {!isLaunching && !error && wezTermId && (
          <div className="text-center">
            <div className="text-green-400 mb-4">
              <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-gray-400">WezTerm is running</p>
            <p className="text-sm text-gray-500 mt-2">Terminal ID: {wezTermId}</p>
            <p className="text-xs text-gray-600 mt-4">
              WezTerm is running in a separate window with OpenCode on port {port}
            </p>
            <button
              onClick={launchWezTerm}
              className="mt-4 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
            >
              Launch Another Window
            </button>
          </div>
        )}

        {!isLaunching && !error && !wezTermId && (
          <div className="text-center">
            <p className="text-gray-400">Click to launch WezTerm</p>
            <button
              onClick={launchWezTerm}
              className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              Launch WezTerm
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default WezTerminal;