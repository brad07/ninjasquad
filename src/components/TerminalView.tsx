import React, { useEffect, useRef } from 'react';
import type { OrchestratorSession } from '../types';

interface TerminalViewProps {
  session: OrchestratorSession;
  output: string;
  onInput?: (input: string) => void;
}

export const TerminalView: React.FC<TerminalViewProps> = ({ session, output, onInput }) => {
  const outputRef = useRef<HTMLPreElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Scroll to bottom when new output arrives
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && onInput && inputRef.current) {
      onInput(inputRef.current.value);
      inputRef.current.value = '';
    }
  };

  const getStatusColor = () => {
    if (typeof session.status === 'string') {
      switch (session.status) {
        case 'Idle': return 'text-gray-500';
        case 'Working': return 'text-blue-500';
        case 'Completed': return 'text-green-500';
        default: return 'text-gray-500';
      }
    }
    return 'text-red-500'; // Failed status
  };

  return (
    <div className="terminal-view flex flex-col h-full bg-black text-white p-4 rounded-lg">
      <div className="terminal-header flex justify-between mb-2">
        <h3 className="text-sm font-mono">
          Session: {session.id}
        </h3>
        <span className={`text-sm ${getStatusColor()}`}>
          {typeof session.status === 'string' ? session.status : 'Failed'}
        </span>
      </div>

      <pre
        ref={outputRef}
        className="terminal-output flex-1 overflow-y-auto bg-gray-900 p-2 rounded font-mono text-sm"
        data-testid="terminal-output"
      >
        {output || 'No output yet...'}
      </pre>

      {onInput && (
        <input
          ref={inputRef}
          type="text"
          className="terminal-input mt-2 bg-gray-800 text-white p-2 rounded font-mono text-sm"
          placeholder="Enter command..."
          onKeyPress={handleKeyPress}
          disabled={session.status !== 'Working'}
          data-testid="terminal-input"
        />
      )}

      {session.task && (
        <div className="task-info mt-2 text-xs text-gray-400">
          <p>Task: {session.task.prompt}</p>
          <p>Started: {new Date(session.task.assigned_at).toLocaleString()}</p>
        </div>
      )}
    </div>
  );
};