import React, { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { invoke } from '@tauri-apps/api/core';
import { senseiService } from '../services/SenseiService';
import 'xterm/css/xterm.css';

interface TerminalProps {
  serverId?: string;
  sessionId?: string;
  isNewSession?: boolean;
  onClose?: () => void;
  enableSensei?: boolean;
}

interface TerminalSession {
  id: string;
  rows: number;
  cols: number;
}

export const Terminal: React.FC<TerminalProps> = ({ serverId, sessionId, isNewSession = false, onClose, enableSensei = false }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [terminalSessionId, setTerminalSessionId] = useState<string | null>(null);
  const terminalSessionIdRef = useRef<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Update ref when terminalSessionId changes
  useEffect(() => {
    terminalSessionIdRef.current = terminalSessionId;
  }, [terminalSessionId]);

  // Listen for Sensei command execution
  useEffect(() => {
    const handleSenseiExecute = (event: CustomEvent) => {
      if (event.detail.serverId === serverId && event.detail.sessionId === sessionId) {
        // Write command to terminal
        if (terminalSessionIdRef.current && event.detail.command) {
          writeToTerminal(event.detail.command + '\r');
        }
      }
    };

    window.addEventListener('sensei-execute', handleSenseiExecute as EventListener);

    return () => {
      window.removeEventListener('sensei-execute', handleSenseiExecute as EventListener);
    };
  }, [serverId, sessionId]);

  useEffect(() => {
    if (!terminalRef.current) return;

    // Initialize Sensei session if enabled
    if (enableSensei && serverId && sessionId) {
      senseiService.initializeSession(serverId, sessionId);
    }

    // Initialize xterm.js
    const xterm = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: '"Cascadia Code", "Fira Code", monospace',
      theme: {
        background: '#1e1e2e',
        foreground: '#cdd6f4',
        cursor: '#f5e0dc',
        black: '#45475a',
        red: '#f38ba8',
        green: '#a6e3a1',
        yellow: '#f9e2af',
        blue: '#89b4fa',
        magenta: '#f5c2e7',
        cyan: '#94e2d5',
        white: '#bac2de',
        brightBlack: '#585b70',
        brightRed: '#f38ba8',
        brightGreen: '#a6e3a1',
        brightYellow: '#f9e2af',
        brightBlue: '#89b4fa',
        brightMagenta: '#f5c2e7',
        brightCyan: '#94e2d5',
        brightWhite: '#a6adc8',
      },
      allowTransparency: true,
      scrollback: 10000,
      // Disable mouse tracking to prevent garbage characters on scroll
      mouseSupport: false,
      rightClickSelectsWord: false,
    });

    // Add addons
    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    xterm.loadAddon(fitAddon);
    xterm.loadAddon(webLinksAddon);

    // Open terminal in the container
    xterm.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;

    // Initialize terminal session
    initializeTerminal(xterm);

    // Handle terminal input
    // Note: We don't write the data to xterm here because the PTY will echo it back
    const dataHandler = xterm.onData((data) => {
      if (terminalSessionIdRef.current) {
        // Only send to PTY, don't display locally
        writeToTerminal(data);
      }
    });

    // Handle resize
    const handleResize = () => {
      if (fitAddonRef.current && xtermRef.current) {
        fitAddonRef.current.fit();
        if (terminalSessionId) {
          resizeTerminal(xtermRef.current.cols, xtermRef.current.rows);
        }
      }
    };

    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      dataHandler.dispose(); // Dispose the data handler to prevent duplicates
      if (terminalSessionIdRef.current) {
        killTerminal();
      }
      xterm.dispose();
    };
  }, []);

  const [commandSent, setCommandSent] = useState(false);

  const initializeTerminal = async (xterm: XTerm) => {
    try {
      // Create a new terminal session
      const session = await invoke<TerminalSession>('create_terminal', {
        rows: xterm.rows,
        cols: xterm.cols,
        serverId: serverId,
        sessionId: sessionId,
      });

      setTerminalSessionId(session.id);
      setIsConnected(true);

      // Start reading terminal output
      readTerminalOutput(session.id);

      // Store the terminal session ID for later use
      const terminalId = session.id;

      // If we have a serverId, we need to get the session ID to connect
      if (serverId && sessionId && !commandSent) {
        // Get server details
        const server = await invoke<{ host: string; port: number }>('get_server_details', { serverId });

        if (isNewSession) {
          // For new sessions, auto-execute the command
          xterm.writeln(`\r\n\x1b[32m# Connecting to new OpenCode Session...\x1b[0m`);
          xterm.writeln(`\x1b[36m# Session: ${sessionId}\x1b[0m`);
          xterm.writeln(`\x1b[36m# Server: localhost:${server.port}\x1b[0m\r\n`);

          // Mark command as sent to prevent duplicates
          setCommandSent(true);

          // Auto-execute the command with a delay, but type it character by character
          setTimeout(async () => {
            const connectCmd = `opencode -h localhost --port ${server.port} -s ${sessionId}`;
            console.log('Auto-typing command for new session:', connectCmd);

            try {
              // Type the command character by character to avoid duplication
              for (const char of connectCmd) {
                await invoke('write_to_terminal', {
                  terminalId: terminalId,
                  data: char
                });
                await new Promise(resolve => setTimeout(resolve, 10)); // Small delay between chars
              }
              // Send enter key
              await invoke('write_to_terminal', {
                terminalId: terminalId,
                data: '\r'
              });
              console.log('Command typed successfully');
            } catch (error) {
              console.error('Failed to type command to terminal:', error);
            }
          }, 2500); // Wait 2.5 seconds for shell to fully initialize
        } else {
          // For existing sessions, just show the command
          xterm.writeln(`\r\n\x1b[32m# OpenCode Session Ready\x1b[0m`);
          xterm.writeln(`\x1b[36m# Session: ${sessionId}\x1b[0m`);
          xterm.writeln(`\x1b[36m# Server: localhost:${server.port}\x1b[0m`);
          xterm.writeln(`\x1b[33m# To connect, run:\x1b[0m`);
          xterm.writeln(`\x1b[37mopencode -h localhost --port ${server.port} -s ${sessionId}\x1b[0m\r\n`);

          // Mark command as sent to prevent duplicates
          setCommandSent(true);
        }
      } else if (serverId) {
        // If we only have serverId but no sessionId, just show the server info
        const server = await invoke<{ host: string; port: number }>('get_server_details', { serverId });
        xterm.writeln(`\r\n\x1b[33m# Waiting for session to be created...\x1b[0m`);
        xterm.writeln(`\x1b[36m# Server available at localhost:${server.port}\x1b[0m\r\n`);
      }
    } catch (error) {
      console.error('Failed to initialize terminal:', error);
      xterm.writeln('\r\n\x1b[31mError: Failed to initialize terminal\x1b[0m');
    }
  };

  const readTerminalOutput = async (terminalId: string) => {
    try {
      // Set up event listener for terminal output
      const { listen } = await import('@tauri-apps/api/event');
      const unlisten = await listen<string>(`terminal-output-${terminalId}`, (event) => {
        if (xtermRef.current) {
          xtermRef.current.write(event.payload);

          // Send output to Sensei if enabled
          if (enableSensei && serverId && sessionId) {
            senseiService.appendOutput(serverId, sessionId, event.payload);
          }
        }
      });

      // Store unlisten function for cleanup
      (window as any)[`unlisten-${terminalId}`] = unlisten;
    } catch (error) {
      console.error('Failed to set up terminal output listener:', error);
    }
  };

  const writeToTerminal = async (data: string) => {
    if (!terminalSessionIdRef.current) return;

    // Debug log to see what's being sent
    console.log(`[Terminal ${terminalSessionIdRef.current}] Writing:`, JSON.stringify(data), 'Length:', data.length);

    try {
      await invoke('write_to_terminal', {
        terminalId: terminalSessionIdRef.current,
        data: data,
      });
    } catch (error) {
      console.error('Failed to write to terminal:', error);
    }
  };

  const resizeTerminal = async (cols: number, rows: number) => {
    if (!terminalSessionId) return;

    try {
      await invoke('resize_terminal', {
        terminalId: terminalSessionId,
        cols: cols,
        rows: rows,
      });
    } catch (error) {
      console.error('Failed to resize terminal:', error);
    }
  };

  const killTerminal = async () => {
    if (!terminalSessionId) return;

    try {
      await invoke('kill_terminal', {
        terminalId: terminalSessionId,
      });

      // Clean up event listener
      const unlisten = (window as any)[`unlisten-${terminalSessionId}`];
      if (unlisten) {
        unlisten();
        delete (window as any)[`unlisten-${terminalSessionId}`];
      }
    } catch (error) {
      console.error('Failed to kill terminal:', error);
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-900 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center space-x-2">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-sm text-gray-300">
            {serverId ? `Server: ${serverId}` : 'Terminal'}
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
      <div
        ref={terminalRef}
        className="flex-1 p-2"
        style={{ backgroundColor: '#1e1e2e' }}
      />
    </div>
  );
};

export default Terminal;