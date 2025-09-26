import React from 'react';
import { CpuChipIcon, CloudIcon } from '@heroicons/react/24/outline';

export type ServerMode = 'process' | 'sdk';

interface ModeToggleProps {
  mode: ServerMode;
  onModeChange: (mode: ServerMode) => void;
}

const ModeToggle: React.FC<ModeToggleProps> = ({ mode, onModeChange }) => {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
        Server Management Mode
      </h3>

      <div className="flex gap-2">
        <button
          onClick={() => onModeChange('process')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-colors ${
            mode === 'process'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
          }`}
        >
          <CpuChipIcon className="h-5 w-5" />
          <span className="font-medium">Process Mode</span>
        </button>

        <button
          onClick={() => onModeChange('sdk')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-colors ${
            mode === 'sdk'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
          }`}
        >
          <CloudIcon className="h-5 w-5" />
          <span className="font-medium">SDK Mode</span>
        </button>
      </div>

      <div className="mt-3 text-xs text-gray-600 dark:text-gray-400">
        {mode === 'process' ? (
          <div>
            <strong>Process Mode:</strong> Spawns standalone OpenCode server processes.
            <br />• Traditional approach using system processes
            <br />• Cannot send prompts directly to AI
            <br />• Good for server management testing
          </div>
        ) : (
          <div>
            <strong>SDK Mode:</strong> Uses OpenCode SDK for server management.
            <br />• Programmatic server control via SDK
            <br />• Can send prompts directly to AI
            <br />• Full session and task management
          </div>
        )}
      </div>

      {mode === 'sdk' && (
        <div className="mt-2 p-2 bg-yellow-100 dark:bg-yellow-900 rounded text-xs text-yellow-800 dark:text-yellow-200">
          <strong>Note:</strong> SDK Mode is experimental. Some features may behave differently.
        </div>
      )}
    </div>
  );
};

export default ModeToggle;