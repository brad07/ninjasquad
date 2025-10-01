import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, Settings, Brain, RefreshCw } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getDevCommand, getAllScripts } from '../utils/packageManager';
import { ollamaService, type OllamaAnalysis } from '../services/OllamaService';

interface DevServerLauncherProps {
  projectPath: string;
  projectName: string;
  serverId?: string; // Optional: link to OpenCode server for Sensei integration
  sessionId?: string; // Optional: Sensei session ID for error reporting
}

export const DevServerLauncher: React.FC<DevServerLauncherProps> = ({
  projectPath,
  projectName,
  serverId,
  sessionId
}) => {
  const [showModal, setShowModal] = useState(false);
  const [detectedCommand, setDetectedCommand] = useState<string | null>(null);
  const [customCommand, setCustomCommand] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [serverPid, setServerPid] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [availableScripts, setAvailableScripts] = useState<Record<string, string>>({});
  const [selectedScript, setSelectedScript] = useState<string>('');
  const [outputLogs, setOutputLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [detectedUrl, setDetectedUrl] = useState<string | null>(null);
  const [browserOpened, setBrowserOpened] = useState(false);
  const [port, setPort] = useState<number>(() => Math.floor(Math.random() * (3100 - 3010 + 1)) + 3010);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Ollama analysis state
  const [ollamaEnabled, setOllamaEnabled] = useState(false);
  const [ollamaHealth, setOllamaHealth] = useState<boolean | null>(null);
  const serverIdRef = useRef<string>(`dev-server-${Date.now()}`);

  useEffect(() => {
    loadDevCommand();
    loadOllamaConfig();
    checkOllamaHealth();
  }, [projectPath]);

  // Load Ollama configuration
  const loadOllamaConfig = () => {
    const config = ollamaService.getConfig();
    setOllamaEnabled(config.enabled);
  };

  // Check Ollama health
  const checkOllamaHealth = async () => {
    const healthy = await ollamaService.checkHealth();
    setOllamaHealth(healthy);
  };

  // Auto-scroll logs to bottom when new logs arrive
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [outputLogs]);

  useEffect(() => {
    // Listen for dev server output
    const unlisten = listen<string>('dev-server-output', (event) => {
      const line = event.payload;
      setOutputLogs(prev => [...prev, line]);

      // Feed output to Ollama service for analysis
      if (ollamaEnabled) {
        ollamaService.addOutput(serverIdRef.current, line);
      }

      // Try to detect server URL
      if (!detectedUrl && !browserOpened) {
        // Common patterns for dev server URLs
        const urlPatterns = [
          /(?:Local|http):?\s+(?:https?:\/\/)?([^\s]+)/i,
          /(?:running|listening) (?:at|on):?\s*(?:https?:\/\/)?([^\s]+)/i,
          /Server (?:started|running) (?:at|on):?\s*(?:https?:\/\/)?([^\s]+)/i,
          /(https?:\/\/localhost:\d+)/i,
          /(https?:\/\/127\.0\.0\.1:\d+)/i,
        ];

        for (const pattern of urlPatterns) {
          const match = line.match(pattern);
          if (match) {
            let url = match[1] || match[0];
            // Ensure it has http:// prefix
            if (!url.startsWith('http')) {
              url = 'http://' + url;
            }
            console.log('[DevServer] Detected URL:', url);
            setDetectedUrl(url);
            setBrowserOpened(true);

            // Open browser after a short delay
            setTimeout(async () => {
              try {
                await invoke('open_browser', { url });
                console.log('[DevServer] Browser opened');
              } catch (error) {
                console.error('[DevServer] Failed to open browser:', error);
              }
            }, 1000);
            break;
          }
        }
      }
    });

    const unlistenError = listen<string>('dev-server-error', (event) => {
      setOutputLogs(prev => [...prev, `[ERROR] ${event.payload}`]);
    });

    return () => {
      unlisten.then(fn => fn());
      unlistenError.then(fn => fn());
    };
  }, [detectedUrl, browserOpened, ollamaEnabled]);

  const loadDevCommand = async () => {
    try {
      const command = await getDevCommand(projectPath);
      setDetectedCommand(command);

      const scripts = await getAllScripts(projectPath);
      setAvailableScripts(scripts);

      // Auto-select detected dev command
      if (command) {
        const scriptName = command.split(' ').pop(); // Extract script name
        setSelectedScript(scriptName || '');
      }
    } catch (error) {
      console.error('Failed to load dev command:', error);
    }
  };

  const handleLaunch = async () => {
    setLoading(true);
    try {
      const commandToRun = customCommand.trim() || detectedCommand;

      if (!commandToRun) {
        alert('No command to run. Please enter a custom command.');
        setLoading(false);
        return;
      }

      // Prepend PORT environment variable
      const commandWithPort = `PORT=${port} ${commandToRun}`;

      console.log('Launching dev server with command:', commandWithPort);

      // Clear previous logs and reset browser state
      setOutputLogs([]);
      setDetectedUrl(null);
      setBrowserOpened(false);

      // Initialize Ollama session and link to Sensei if available
      if (ollamaEnabled) {
        ollamaService.getOrCreateSession(serverIdRef.current, projectPath, projectName, sessionId);
        if (sessionId && serverId) {
          console.log('[DevServerLauncher] Linking Ollama to Sensei session:', sessionId);
        }
      }

      const pid = await invoke<number>('spawn_dev_server', {
        command: commandWithPort,
        workingDir: projectPath
      });

      console.log('Dev server launched with PID:', pid);
      setServerPid(pid);
      setIsRunning(true);
      setShowModal(false);
      setShowLogs(true); // Auto-show logs when starting
    } catch (error) {
      console.error('Failed to launch dev server:', error);
      alert(`Failed to launch dev server: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    if (serverPid) {
      try {
        // Try to kill the process
        // Note: This may not work if the terminal window manages the process
        console.log('Stopping dev server with PID:', serverPid);
        // We'd need a kill_process command in Tauri for this
        setIsRunning(false);
        setServerPid(null);
      } catch (error) {
        console.error('Failed to stop dev server:', error);
      }
    }
  };

  const handleScriptSelect = (scriptName: string) => {
    setSelectedScript(scriptName);
    // Update the command based on detected package manager
    if (detectedCommand) {
      const parts = detectedCommand.split(' ');
      const manager = parts.slice(0, -1).join(' '); // e.g., "npm run"
      setCustomCommand(`${manager} ${scriptName}`);
    }
  };

  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={() => isRunning ? handleStop() : setShowModal(true)}
        className={`fixed bottom-8 left-8 z-40 p-4 rounded-full border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all ${
          isRunning
            ? 'bg-gradient-to-br from-red-400 to-red-500 hover:from-red-300 hover:to-red-400'
            : 'bg-gradient-to-br from-green-400 to-green-500 hover:from-green-300 hover:to-green-400'
        }`}
        title={isRunning ? 'Stop Dev Server' : 'Launch Dev Server'}
      >
        {isRunning ? (
          <Square className="h-8 w-8 text-black fill-black" strokeWidth={3} />
        ) : (
          <Play className="h-8 w-8 text-black fill-black" strokeWidth={3} />
        )}
        {isRunning && (
          <span className="absolute top-1 right-1 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
          </span>
        )}
      </button>

      {/* Launch Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white border-4 border-black rounded-lg p-6 w-[600px] max-w-full shadow-[12px_12px_0px_0px_rgba(0,0,0,1)]">
            <h2 className="text-2xl font-bold mb-4 text-black flex items-center gap-2">
              <Play className="h-6 w-6" />
              Launch Dev Server
            </h2>

            {/* Project Info */}
            <div className="mb-4 p-3 bg-gray-100 border-2 border-gray-300 rounded">
              <p className="text-sm font-medium text-gray-700">Project:</p>
              <p className="text-sm font-mono text-gray-900">{projectName}</p>
              <p className="text-xs font-mono text-gray-600 mt-1">{projectPath}</p>
            </div>

            {/* Detected Command */}
            {detectedCommand && (
              <div className="mb-4">
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Detected Command:
                </label>
                <div className="p-3 bg-green-50 border-2 border-green-500 rounded font-mono text-sm text-gray-900">
                  {detectedCommand}
                </div>
              </div>
            )}

            {/* Available Scripts */}
            {Object.keys(availableScripts).length > 0 && (
              <div className="mb-4">
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Available Scripts:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(availableScripts).map(([name, script]) => (
                    <button
                      key={name}
                      onClick={() => handleScriptSelect(name)}
                      className={`p-2 text-left border-2 rounded text-sm transition-all ${
                        selectedScript === name
                          ? 'bg-cyan-100 border-cyan-600 text-black font-bold'
                          : 'bg-white border-gray-300 text-gray-700 hover:border-gray-500'
                      }`}
                    >
                      <div className="font-mono font-bold">{name}</div>
                      <div className="text-xs text-gray-600 truncate">{script}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Port Configuration */}
            <div className="mb-4">
              <label className="block text-sm font-bold text-gray-700 mb-2">
                Port:
              </label>
              <input
                type="number"
                value={port}
                onChange={(e) => setPort(parseInt(e.target.value) || 3010)}
                min={3010}
                max={3100}
                className="w-full px-3 py-2 bg-white border-2 border-black rounded font-mono text-sm text-gray-900 focus:outline-none focus:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all"
              />
              <p className="text-xs text-gray-500 mt-1">
                Server will run on PORT={port} (randomly selected between 3010-3100)
              </p>
            </div>

            {/* Ollama AI Analysis Toggle */}
            <div className="mb-4 p-3 bg-purple-50 border-2 border-purple-300 rounded">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Brain className="h-4 w-4 text-purple-600" />
                  <span className="text-sm font-bold text-gray-700">AI Analysis (Ollama)</span>
                  {ollamaHealth === false && (
                    <span className="text-xs text-red-600">(Offline)</span>
                  )}
                  {ollamaHealth === true && (
                    <span className="text-xs text-green-600">(Ready)</span>
                  )}
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ollamaEnabled}
                    onChange={(e) => {
                      const enabled = e.target.checked;
                      setOllamaEnabled(enabled);
                      ollamaService.updateConfig({ enabled });
                    }}
                    className="sr-only peer"
                    disabled={ollamaHealth === false}
                  />
                  <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-500 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600 peer-disabled:opacity-50"></div>
                </label>
              </div>
              <p className="text-xs text-gray-600 mt-2">
                {ollamaHealth === false
                  ? 'Install Ollama to enable local AI analysis of terminal output'
                  : 'Analyze terminal output with local LLM for errors and suggestions'}
              </p>
            </div>

            {/* Custom Command */}
            <div className="mb-6">
              <label className="block text-sm font-bold text-gray-700 mb-2">
                Custom Command (optional):
              </label>
              <input
                type="text"
                value={customCommand}
                onChange={(e) => setCustomCommand(e.target.value)}
                placeholder={detectedCommand || "npm run dev"}
                className="w-full px-3 py-2 bg-white border-2 border-black rounded font-mono text-sm text-gray-900 focus:outline-none focus:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all"
              />
              <p className="text-xs text-gray-500 mt-1">
                Override the detected command or enter your own
              </p>
            </div>

            {/* Warning if no command */}
            {!detectedCommand && !customCommand && (
              <div className="mb-4 p-3 bg-yellow-50 border-2 border-yellow-500 rounded">
                <p className="text-sm text-yellow-800">
                  ⚠️ No dev script detected. Please enter a custom command.
                </p>
              </div>
            )}

            {/* Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2 bg-gray-200 text-black font-bold border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all rounded"
              >
                Cancel
              </button>
              <button
                onClick={handleLaunch}
                disabled={loading || (!detectedCommand && !customCommand)}
                className="flex-1 px-4 py-2 bg-gradient-to-br from-green-400 to-green-500 hover:from-green-300 hover:to-green-400 text-black font-bold border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] transition-all disabled:opacity-50 disabled:cursor-not-allowed rounded"
              >
                {loading ? 'Launching...' : 'Launch 🚀'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Logs Panel */}
      {isRunning && showLogs && (
        <div className="fixed bottom-4 right-4 w-2/3 max-w-3xl bg-gray-900 border-4 border-black rounded-lg shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] overflow-hidden z-50">
          <div className="flex items-center justify-between p-3 bg-gray-800 border-b-2 border-black">
            <span className="text-white font-bold text-sm">📋 Dev Server Logs</span>
            <button
              onClick={() => setShowLogs(false)}
              className="text-white hover:text-red-400 font-bold"
            >
              ✕
            </button>
          </div>
          <div className="h-64 overflow-y-auto p-3 bg-gray-900 font-mono text-xs text-green-400">
            {outputLogs.length === 0 ? (
              <div className="text-gray-500">Waiting for output...</div>
            ) : (
              outputLogs.map((log, i) => (
                <div key={i} className={log.startsWith('[ERROR]') ? 'text-red-400' : 'text-green-400'}>
                  {log}
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>
          <div className="p-2 bg-gray-800 border-t-2 border-black flex justify-between items-center">
            <span className="text-xs text-gray-400">{outputLogs.length} lines</span>
            <button
              onClick={() => setOutputLogs([])}
              className="text-xs px-2 py-1 bg-gray-700 text-white border border-gray-600 rounded hover:bg-gray-600"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Show Logs Button (when hidden) */}
      {isRunning && !showLogs && (
        <button
          onClick={() => setShowLogs(true)}
          className="fixed bottom-4 right-4 px-4 py-2 bg-gray-900 text-white border-2 border-black rounded-lg shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] font-bold z-50"
        >
          📋 Show Logs
        </button>
      )}

      {/* Enable Ollama Button (when disabled) */}
      {isRunning && !ollamaEnabled && ollamaHealth !== false && (
        <button
          onClick={() => {
            ollamaService.updateConfig({ enabled: true });
            setOllamaEnabled(true);
            ollamaService.getOrCreateSession(serverIdRef.current, projectPath, projectName, sessionId);
          }}
          className="fixed bottom-20 left-8 px-3 py-2 bg-purple-100 text-purple-700 border-2 border-purple-600 rounded-lg shadow-[4px_4px_0px_0px_rgba(147,51,234,0.5)] hover:bg-purple-200 font-bold text-sm z-40 flex items-center gap-2"
          title="Enable AI error monitoring with Ollama → Sensei"
        >
          <Brain className="h-4 w-4" />
          {sessionId ? 'Enable AI → Sensei' : 'Enable AI'}
        </button>
      )}
    </>
  );
};