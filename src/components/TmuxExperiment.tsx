import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import Terminal from './Terminal';
import { Play, Square, Terminal as TerminalIcon, Send, RefreshCw, X, Trash2, Keyboard, KeyboardOff } from 'lucide-react';

interface TmuxSession {
  id: string;
  name: string;
  project_path: string;
  created_at: string;
  is_active: boolean;
  window_count: number;
  pane_count: number;
}

interface TmuxOutput {
  session_id: string;
  content: string;
  pane_id: string;
  timestamp: string;
}

const TmuxExperiment: React.FC = () => {
  const [sessions, setSessions] = useState<TmuxSession[]>([]);
  const [activeSession, setActiveSession] = useState<TmuxSession | null>(null);
  const [projectPath, setProjectPath] = useState('/Users/bradbond');
  const [isCreating, setIsCreating] = useState(false);
  const [command, setCommand] = useState('');
  const [prompt, setPrompt] = useState('');
  const [output, setOutput] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [interactiveMode, setInteractiveMode] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const outputListenerRef = useRef<UnlistenFn | null>(null);
  const eventListenerRef = useRef<UnlistenFn | null>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const interactiveInputRef = useRef<HTMLInputElement>(null);
  const autoRefreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Example prompts for quick testing
  const examplePrompts = [
    "Create a Python function that calculates the factorial of a number",
    "Write a bash script to find all large files in the current directory",
    "Explain how async/await works in JavaScript",
    "Create a React component for a todo list",
    "Write unit tests for a fibonacci function"
  ];

  useEffect(() => {
    loadSessions();
    setupEventListeners();

    return () => {
      if (outputListenerRef.current) outputListenerRef.current();
      if (eventListenerRef.current) eventListenerRef.current();
    };
  }, []);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  useEffect(() => {
    // Auto-scroll to bottom when new output is added
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  // Handle auto-refresh
  useEffect(() => {
    if (autoRefresh && activeSession) {
      // Set up interval to refresh every 100ms
      autoRefreshIntervalRef.current = setInterval(async () => {
        try {
          const content = await invoke<string>('capture_tmux_pane', {
            sessionId: activeSession.id
          });
          // Clean up the output by removing all border characters and box drawing
          const cleanedLines = content.split('\n').map(line => {
            // Remove various border characters: │ ┃ ║ | and box drawing characters
            return line
              .replace(/[│┃║|╎╏┆┇┊┋]/g, '')  // Remove vertical lines
              .replace(/[─━╌╍┄┅┈┉]/g, '')      // Remove horizontal lines
              .replace(/[┌┐└┘├┤┬┴┼]/g, '')     // Remove corner and junction characters
              .replace(/[╔╗╚╝╠╣╦╩╬]/g, '')     // Remove double-line box characters
              .replace(/^\s+|\s+$/g, '');       // Trim leading/trailing whitespace
          }).filter(line => {
            // Don't filter out empty lines completely as they may be intentional
            return true;
          });
          setOutput(cleanedLines);
        } catch (err) {
          console.error('Auto-refresh error:', err);
        }
      }, 100); // Refresh every 100ms

      // Clean up interval on unmount or when autoRefresh/activeSession changes
      return () => {
        if (autoRefreshIntervalRef.current) {
          clearInterval(autoRefreshIntervalRef.current);
          autoRefreshIntervalRef.current = null;
        }
      };
    } else {
      // Clear interval if auto-refresh is disabled
      if (autoRefreshIntervalRef.current) {
        clearInterval(autoRefreshIntervalRef.current);
        autoRefreshIntervalRef.current = null;
      }
    }
  }, [autoRefresh, activeSession]);

  const setupEventListeners = async () => {
    // Listen for tmux output
    outputListenerRef.current = await listen<TmuxOutput>('tmux-output', (event) => {
      const data = event.payload;
      if (activeSession && data.session_id === activeSession.id) {
        // For real-time updates, replace the last line if it's being updated
        // or append if it's a new line
        setOutput(prev => {
          const lines = data.content.split('\n').filter(line => line !== '');
          if (lines.length === 0) return prev;

          // Append new content
          return [...prev, ...lines];
        });
      }
    });

    // Listen for tmux events
    eventListenerRef.current = await listen('tmux-event', (event) => {
      console.log('Tmux event:', event.payload);
    });
  };

  const loadSessions = async () => {
    try {
      const sessions = await invoke<TmuxSession[]>('list_tmux_sessions');
      setSessions(sessions);
    } catch (err) {
      console.error('Failed to load sessions:', err);
    }
  };

  const createSession = async () => {
    setIsCreating(true);
    setError(null);
    try {
      const session = await invoke<TmuxSession>('create_tmux_session', {
        projectPath
      });
      setSessions(prev => [...prev, session]);
      setActiveSession(session);
      setOutput([]);
      setAutoRefresh(true); // Enable auto-refresh by default for new sessions
      setNotification({
        message: `Created tmux session: ${session.id}`,
        type: 'success'
      });

      // Capture initial pane content
      await capturePaneContent(session.id);
    } catch (err: any) {
      setError(err);
      setNotification({
        message: `Failed to create session: ${err}`,
        type: 'error'
      });
    } finally {
      setIsCreating(false);
    }
  };

  const killSession = async (sessionId: string) => {
    try {
      await invoke('kill_tmux_session', { sessionId });
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      if (activeSession?.id === sessionId) {
        setActiveSession(null);
        setOutput([]);
      }
      setNotification({
        message: `Killed tmux session: ${sessionId}`,
        type: 'success'
      });
    } catch (err: any) {
      setError(err);
      setNotification({
        message: `Failed to kill session: ${err}`,
        type: 'error'
      });
    }
  };

  const sendCommand = async () => {
    if (!activeSession || !command) return;

    try {
      await invoke('send_tmux_command', {
        sessionId: activeSession.id,
        command
      });
      setCommand('');
      setNotification({
        message: 'Command sent',
        type: 'success'
      });
    } catch (err: any) {
      setError(err);
      setNotification({
        message: `Failed to send command: ${err}`,
        type: 'error'
      });
    }
  };

  const sendKeys = async (keys: string) => {
    if (!activeSession) return;

    try {
      await invoke('send_tmux_keys', {
        sessionId: activeSession.id,
        keys
      });
    } catch (err: any) {
      console.error('Failed to send keys:', err);
    }
  };

  const handleInteractiveKeyPress = async (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!activeSession || !interactiveMode) return;

    e.preventDefault();

    let keysToSend = '';

    // Handle special keys
    if (e.key === 'Enter') {
      keysToSend = 'Enter';
    } else if (e.key === 'Backspace') {
      keysToSend = 'BSpace';
    } else if (e.key === 'Tab') {
      keysToSend = 'Tab';
    } else if (e.key === 'Escape') {
      keysToSend = 'Escape';
    } else if (e.key === 'ArrowUp') {
      keysToSend = 'Up';
    } else if (e.key === 'ArrowDown') {
      keysToSend = 'Down';
    } else if (e.key === 'ArrowLeft') {
      keysToSend = 'Left';
    } else if (e.key === 'ArrowRight') {
      keysToSend = 'Right';
    } else if (e.ctrlKey) {
      // Handle Ctrl+key combinations
      if (e.key.length === 1) {
        keysToSend = `C-${e.key.toLowerCase()}`;
      }
    } else if (e.key.length === 1) {
      // Regular character
      keysToSend = e.key;
    }

    if (keysToSend) {
      await sendKeys(keysToSend);

      // Auto-refresh the display after sending the keystroke
      // Small delay to allow tmux to process the input
      setTimeout(async () => {
        try {
          const content = await invoke<string>('capture_tmux_pane', {
            sessionId: activeSession.id
          });
          // Clean up the output by removing all border characters and box drawing
          const cleanedLines = content.split('\n').map(line => {
            return line
              .replace(/[│┃║|╎╏┆┇┊┋]/g, '')  // Remove vertical lines
              .replace(/[─━╌╍┄┅┈┉]/g, '')      // Remove horizontal lines
              .replace(/[┌┐└┘├┤┬┴┼]/g, '')     // Remove corner and junction characters
              .replace(/[╔╗╚╝╠╣╦╩╬]/g, '')     // Remove double-line box characters
              .replace(/^\s+|\s+$/g, '');      // Trim leading/trailing whitespace
          });
          setOutput(cleanedLines);
        } catch (err) {
          console.error('Failed to refresh after keystroke:', err);
        }
      }, 50); // 50ms delay to allow tmux to process
    }
  };

  const sendPrompt = async () => {
    if (!activeSession || !prompt) return;

    try {
      // Send the prompt text directly to OpenCode
      // This will fill in the OpenCode prompt without executing
      await invoke('send_tmux_keys', {
        sessionId: activeSession.id,
        keys: prompt
      });

      // Optionally send Enter to execute immediately
      // Uncomment the next line if you want auto-execution
      // await invoke('send_tmux_keys', { sessionId: activeSession.id, keys: 'Enter' });

      setPrompt('');
      setNotification({
        message: 'Prompt sent to OpenCode',
        type: 'success'
      });
    } catch (err: any) {
      setError(err);
      setNotification({
        message: `Failed to send prompt: ${err}`,
        type: 'error'
      });
    }
  };

  const capturePaneContent = async (sessionId?: string) => {
    const id = sessionId || activeSession?.id;
    if (!id) return;

    try {
      const content = await invoke<string>('capture_tmux_pane', {
        sessionId: id
      });
      // Clean up the output by removing all border characters and box drawing
      const cleanedLines = content.split('\n').map(line => {
        return line
          .replace(/[│┃║|╎╏┆┇┊┋]/g, '')  // Remove vertical lines
          .replace(/[─━╌╍┄┅┈┉]/g, '')      // Remove horizontal lines
          .replace(/[┌┐└┘├┤┬┴┼]/g, '')     // Remove corner and junction characters
          .replace(/[╔╗╚╝╠╣╦╩╬]/g, '')     // Remove double-line box characters
          .replace(/^\s+|\s+$/g, '');      // Trim leading/trailing whitespace
      });
      setOutput(cleanedLines);
      setNotification({
        message: 'Captured pane content',
        type: 'success'
      });
    } catch (err: any) {
      setError(err);
      setNotification({
        message: `Failed to capture pane: ${err}`,
        type: 'error'
      });
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-gray-100">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h1 className="text-2xl font-bold">Tmux Laboratory</h1>
            <span className="text-sm text-gray-400">
              Real-time terminal streaming with tmux control mode
            </span>
          </div>
          <button
            onClick={loadSessions}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded transition-colors"
            title="Reload sessions"
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      {/* Notification */}
      {notification && (
        <div className={`p-2 text-center ${
          notification.type === 'success' ? 'bg-green-600' : 'bg-red-600'
        }`}>
          {notification.message}
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div className="w-80 bg-gray-800 border-r border-gray-700 flex flex-col">
          {/* Create Session */}
          <div className="p-4 border-b border-gray-700">
            <h2 className="text-lg font-semibold mb-3">Create Session</h2>
            <input
              type="text"
              value={projectPath}
              onChange={(e) => setProjectPath(e.target.value)}
              placeholder="Project path"
              className="w-full px-3 py-2 bg-gray-700 rounded border border-gray-600 focus:border-blue-500 focus:outline-none mb-3"
            />
            <button
              onClick={createSession}
              disabled={isCreating}
              className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded transition-colors disabled:opacity-50 flex items-center justify-center space-x-2"
            >
              <Play size={18} />
              <span>{isCreating ? 'Creating...' : 'Create Tmux Session'}</span>
            </button>
          </div>

          {/* Sessions List */}
          <div className="flex-1 overflow-y-auto p-4">
            <h2 className="text-lg font-semibold mb-3">Sessions</h2>
            {sessions.length === 0 ? (
              <p className="text-gray-500">No sessions running</p>
            ) : (
              <div className="space-y-2">
                {sessions.map(session => (
                  <div
                    key={session.id}
                    className={`p-3 bg-gray-700 rounded cursor-pointer hover:bg-gray-600 transition-colors ${
                      activeSession?.id === session.id ? 'ring-2 ring-blue-500' : ''
                    }`}
                    onClick={() => {
                      setActiveSession(session);
                      setOutput([]);
                      setAutoRefresh(true); // Enable auto-refresh when selecting a session
                      capturePaneContent(session.id);
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <TerminalIcon size={16} />
                        <span className="font-mono text-sm">{session.id}</span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          killSession(session.id);
                        }}
                        className="text-red-400 hover:text-red-300"
                      >
                        <X size={16} />
                      </button>
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      {session.project_path}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Windows: {session.window_count}, Panes: {session.pane_count}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          {activeSession ? (
            <>
              {/* Session Info */}
              <div className="bg-gray-800 border-b border-gray-700 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">Session: {activeSession.id}</h2>
                    <p className="text-sm text-gray-400">{activeSession.project_path}</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setInteractiveMode(!interactiveMode)}
                      className={`px-3 py-1 rounded transition-colors flex items-center space-x-1 ${
                        interactiveMode
                          ? 'bg-green-600 hover:bg-green-700 text-white'
                          : 'bg-gray-700 hover:bg-gray-600'
                      }`}
                      title={interactiveMode ? "Disable interactive mode" : "Enable interactive mode"}
                    >
                      {interactiveMode ? <Keyboard size={16} /> : <KeyboardOff size={16} />}
                      <span className="text-xs">{interactiveMode ? 'Interactive' : 'View Only'}</span>
                    </button>
                    <button
                      onClick={() => setAutoRefresh(!autoRefresh)}
                      className={`px-3 py-1 rounded transition-colors flex items-center space-x-1 ${
                        autoRefresh
                          ? 'bg-blue-600 hover:bg-blue-700 text-white animate-pulse'
                          : 'bg-gray-700 hover:bg-gray-600'
                      }`}
                      title={autoRefresh ? "Disable auto-refresh" : "Enable auto-refresh (100ms)"}
                    >
                      <RefreshCw size={16} className={autoRefresh ? 'animate-spin' : ''} />
                      <span className="text-xs">{autoRefresh ? 'Auto' : 'Manual'}</span>
                    </button>
                    <button
                      onClick={() => capturePaneContent()}
                      className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded transition-colors"
                      title="Capture pane content"
                      disabled={autoRefresh}
                    >
                      <RefreshCw size={16} />
                    </button>
                    <button
                      onClick={() => killSession(activeSession.id)}
                      className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded transition-colors"
                    >
                      <Square size={16} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Terminal Output */}
              <div className="flex-1 bg-black p-4 overflow-hidden flex flex-col relative">
                {interactiveMode && (
                  <div className="absolute top-6 right-6 bg-green-600 text-white px-2 py-1 rounded text-xs animate-pulse z-10">
                    Interactive Mode - Click to type
                  </div>
                )}
                <div
                  ref={outputRef}
                  className={`flex-1 overflow-y-auto font-mono text-sm text-green-400 ${
                    interactiveMode ? 'cursor-text' : ''
                  }`}
                  tabIndex={interactiveMode ? 0 : -1}
                  onKeyDown={handleInteractiveKeyPress}
                  onClick={() => {
                    if (interactiveMode && outputRef.current) {
                      outputRef.current.focus();
                    }
                  }}
                  style={{
                    outline: interactiveMode ? '2px solid rgba(34, 197, 94, 0.3)' : 'none',
                    outlineOffset: '-2px',
                    whiteSpace: 'pre',
                    wordBreak: 'break-all'
                  }}
                >
                  {output.length > 0 ? (
                    <pre className="whitespace-pre font-mono">
                      {output.map((line, index) => {
                        const isLastLine = index === output.length - 1;
                        // Check if this line starts with a prompt character (>, $, #, %)
                        const promptMatch = line.match(/^([>$#%])\s*/);

                        if (isLastLine && promptMatch) {
                          // Place cursor after the prompt on the last line
                          return (
                            <span key={index}>
                              {line}
                              <span className="inline-block w-2 h-4 bg-green-400 animate-pulse" />
                              {index < output.length - 1 ? '\n' : ''}
                            </span>
                          );
                        }

                        return (
                          <span key={index}>
                            {line}
                            {index < output.length - 1 ? '\n' : ''}
                          </span>
                        );
                      })}
                    </pre>
                  ) : (
                    interactiveMode && (
                      <div className="text-gray-500 italic">
                        Click here and start typing to interact with the terminal...
                        <span className="inline-block w-2 h-4 bg-gray-500 animate-pulse ml-2" />
                      </div>
                    )
                  )}
                </div>
              </div>

              {/* Command Input */}
              <div className="bg-gray-800 border-t border-gray-700 p-4 space-y-4">
                {/* Command Section */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Terminal Command
                  </label>
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={command}
                      onChange={(e) => setCommand(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          sendCommand();
                        }
                      }}
                      placeholder="Enter bash command..."
                      className="flex-1 px-3 py-2 bg-gray-700 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
                    />
                    <button
                      onClick={sendCommand}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded transition-colors flex items-center space-x-2"
                    >
                      <Send size={18} />
                      <span>Run</span>
                    </button>
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    Executes command in terminal (adds Enter automatically)
                  </div>
                </div>

                {/* Prompt Section */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-gray-300">
                      OpenCode Prompt
                    </label>
                    <select
                      onChange={(e) => e.target.value && setPrompt(e.target.value)}
                      className="text-xs px-2 py-1 bg-gray-700 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
                      value=""
                    >
                      <option value="">Example prompts...</option>
                      {examplePrompts.map((example, idx) => (
                        <option key={idx} value={example}>
                          {example.substring(0, 50)}...
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex space-x-2">
                    <textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      onKeyDown={(e) => {
                        // Allow Ctrl/Cmd+Enter to send
                        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                          e.preventDefault();
                          sendPrompt();
                        }
                      }}
                      placeholder="Enter OpenCode prompt (e.g., 'Create a function to calculate fibonacci numbers')..."
                      className="flex-1 px-3 py-2 bg-gray-700 rounded border border-gray-600 focus:border-blue-500 focus:outline-none resize-none"
                      rows={3}
                    />
                    <div className="flex flex-col space-y-2">
                      <button
                        onClick={sendPrompt}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded transition-colors flex items-center space-x-2"
                        title="Send prompt to OpenCode"
                      >
                        <Send size={18} />
                        <span>Prompt</span>
                      </button>
                      <button
                        onClick={async () => {
                          await sendPrompt();
                          // Send Enter after prompt
                          await sendKeys('Enter');
                        }}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded transition-colors flex items-center space-x-2"
                        title="Send prompt and execute immediately"
                      >
                        <Play size={18} />
                        <span>Execute</span>
                      </button>
                      <button
                        onClick={() => setPrompt('')}
                        className="px-3 py-2 bg-gray-600 hover:bg-gray-700 rounded transition-colors"
                        title="Clear prompt"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    Sends prompt to OpenCode. Use "Execute" to auto-run or Ctrl+Enter
                  </div>
                </div>

                {/* Interactive Mode Note */}
                {interactiveMode && (
                  <div className="mt-3 p-2 bg-green-900 border border-green-700 rounded">
                    <p className="text-xs text-green-300">
                      <strong>Interactive Mode Active:</strong> Click on the terminal output area above and type directly.
                      Your keystrokes will be sent to the tmux session in real-time. Use arrow keys, Ctrl+C, etc.
                    </p>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <TerminalIcon className="h-16 w-16 mx-auto mb-4" />
                <p className="text-xl">No session selected</p>
                <p className="text-sm mt-2">Create a new session or select an existing one</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-900 border-t border-red-700 p-2 text-sm">
          Error: {error}
        </div>
      )}
    </div>
  );
};

export default TmuxExperiment;