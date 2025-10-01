import React from 'react';
import { Brain, Loader2 } from 'lucide-react';

interface SenseiEmptyStateProps {
  type: 'disabled' | 'waiting' | 'analyzing';
  onEnable?: () => void;
}

export const SenseiEmptyState: React.FC<SenseiEmptyStateProps> = ({ type, onEnable }) => {
  if (type === 'disabled') {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Brain className="h-12 w-12 text-gray-400 mb-3" strokeWidth={1.5} />
        <p className="text-gray-700 font-bold mb-4">
          SensAI is disabled
        </p>
        <p className="text-sm text-gray-600 mb-4 max-w-xs">
          Enable SensAI to get AI-powered recommendations based on your terminal output
        </p>
        <button
          onClick={onEnable}
          className="px-4 py-2 bg-purple-500 text-white font-bold border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:bg-purple-600 transition-all rounded"
        >
          Enable SensAI
        </button>
      </div>
    );
  }

  if (type === 'waiting') {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Brain className="h-12 w-12 text-purple-500 mb-3 animate-pulse" strokeWidth={1.5} />
        <p className="text-gray-700 font-bold">
          Waiting for terminal output...
        </p>
        <p className="text-sm text-gray-600 mt-2">
          SensAI will analyze your session and provide recommendations
        </p>
      </div>
    );
  }

  if (type === 'analyzing') {
    return (
      <div className="bg-purple-100 p-4 border-2 border-purple-600 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] rounded-lg animate-pulse">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 text-purple-600 animate-spin" strokeWidth={2.5} />
          <div className="flex-1">
            <p className="text-sm font-bold text-purple-900">
              SensAI is analyzing the agent output
            </p>
            <p className="text-xs text-purple-700 mt-1">
              Processing conversation to provide intelligent recommendations
            </p>
          </div>
        </div>
      </div>
    );
  }

  return null;
};