import React, { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { senseiService } from '../services/SenseiService';
import 'xterm/css/xterm.css';

interface TerminalProps {
  serverId?: string;
  sessionId?: string;
  isNewSession?: boolean;
  onClose?: () => void;
  enableSensei?: boolean;
  mirrorId?: string;  // If set, terminal will display mirrored WezTerm content
}

interface MirrorUpdate {
  mirror_id: string;
  content: string;
  cursor_x: number;
  cursor_y: number;
  viewport_start: number;
  viewport_end: number;
}

interface TerminalSession {
  id: string;
  rows: number;
  cols: number;
}

export const Terminal: React.FC<TerminalProps> = ({ serverId, sessionId, isNewSession = false, onClose, enableSensei = false, mirrorId }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [terminalSessionId, setTerminalSessionId] = useState<string | null>(null);
  const terminalSessionIdRef = useRef<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const mirrorUnlistenRef = useRef<UnlistenFn | null>(null);

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

    // Ensure the terminal container is in the DOM
    if (!terminalRef.current.offsetParent) {
      console.warn('Terminal container not visible, deferring initialization');
      // Try again after a short delay
      const retryTimeout = setTimeout(() => {
        if (terminalRef.current && terminalRef.current.offsetParent) {
          // Re-trigger the effect by updating a state
          setIsConnected(prev => !prev);
        }
      }, 100);
      return () => clearTimeout(retryTimeout);
    }

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
      rightClickSelectsWord: false,
    });

    // Add addons
    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    xterm.loadAddon(fitAddon);
    xterm.loadAddon(webLinksAddon);

    // Open terminal in the container
    xterm.open(terminalRef.current);

    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;

    // Use ResizeObserver for better terminal sizing
    const resizeObserver = new ResizeObserver(() => {
      try {
        if (fitAddonRef.current && xtermRef.current) {
          fitAddonRef.current.fit();
        }
      } catch (error) {
        console.error('Error fitting terminal:', error);
      }
    });

    if (terminalRef.current) {
      resizeObserver.observe(terminalRef.current);
    }

    // Initial fit after a short delay
    setTimeout(() => {
      try {
        if (fitAddonRef.current && xtermRef.current) {
          fitAddonRef.current.fit();
        }
      } catch (error) {
        console.error('Error fitting terminal:', error);
      }
    }, 100);

    // Initialize terminal session or mirror mode
    if (mirrorId) {
      initializeMirrorMode(xterm);
    } else {
      initializeTerminal(xterm);
    }

    // Handle terminal input
    // Note: We don't write the data to xterm here because the PTY will echo it back
    const dataHandler = xterm.onData((data) => {
      if (mirrorId) {
        // In mirror mode, forward input to WezTerm
        sendToMirror(data);
      } else if (terminalSessionIdRef.current) {
        // Only send to PTY, don't display locally
        writeToTerminal(data, false); // false = user input, will be echoed
      }
    });

    // Handle resize
    const handleResize = () => {
      try {
        if (fitAddonRef.current && xtermRef.current) {
          // Check if terminal is still mounted and visible
          if (!xtermRef.current.element?.offsetParent) {
            console.warn('Terminal element not visible, skipping resize');
            return;
          }
          fitAddonRef.current.fit();
          if (terminalSessionId) {
            resizeTerminal(xtermRef.current.cols, xtermRef.current.rows);
          }
        }
      } catch (error) {
        console.error('Error handling terminal resize:', error);
      }
    };

    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      try {
        dataHandler.dispose(); // Dispose the data handler to prevent duplicates
      } catch (error) {
        console.error('Error disposing data handler:', error);
      }
      if (mirrorUnlistenRef.current) {
        mirrorUnlistenRef.current();
      }
      if (mirrorId) {
        stopMirror();
      } else if (terminalSessionIdRef.current) {
        killTerminal();
      }
      try {
        xterm.dispose();
      } catch (error) {
        console.error('Error disposing terminal:', error);
      }
    };
  }, [mirrorId]);

  const [, setCommandSent] = useState(false);
  const commandSentRef = useRef(false);

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

      // If we have a serverId, run opencode --port command
      if (serverId && !commandSentRef.current) {
        // Mark command as sent immediately to prevent any duplicates
        commandSentRef.current = true;
        setCommandSent(true);

        // Extract port from serverId (format: opencode-4097)
        const portMatch = serverId.match(/opencode-(\d+)/);
        const port = portMatch ? portMatch[1] : '4097';

        xterm.writeln(`\r\n\x1b[32m# Starting OpenCode on port ${port}...\x1b[0m`);
        xterm.writeln(`\x1b[36m# This will start both the TUI and server\x1b[0m\r\n`);

        // Run opencode --port command
        setTimeout(async () => {
          const connectCmd = `opencode --port ${port}`;
          console.log(`Running OpenCode command: ${connectCmd}`);

          try {
            // Clear any existing input
            await invoke('write_to_terminal', {
              terminalId: terminalId,
              data: '\x03'  // Ctrl+C
            });
            await new Promise(resolve => setTimeout(resolve, 200));

            // Send the opencode command
            await invoke('write_to_terminal', {
              terminalId: terminalId,
              data: connectCmd + '\r'
            });

            console.log('OpenCode command sent successfully');

          } catch (error) {
            console.error('Failed to run OpenCode:', error);
          }
        }, 1000); // Shorter delay since we're just running a command
      } else if (serverId) {
        // If we only have serverId but no sessionId, just show the server info
        const server = await invoke<{ host: string; port: number; working_dir?: string }>('get_server_details', { serverId });
        xterm.writeln(`\r\n\x1b[33m# Waiting for session to be created...\x1b[0m`);
        xterm.writeln(`\x1b[36m# Server available at localhost:${server.port}\x1b[0m`);
        if (server.working_dir) {
          xterm.writeln(`\x1b[36m# Working directory: ${server.working_dir}\x1b[0m`);
        }
        xterm.writeln('\r\n');
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
          const output = event.payload;
          xtermRef.current.write(output);

          // Send output to Sensei if enabled
          console.log('🖥️ [Terminal] Output received:', {
            enableSensei,
            hasServerId: !!serverId,
            hasSessionId: !!sessionId,
            outputLength: output.length,
            outputPreview: output.substring(0, 50)
          });

          if (enableSensei && serverId && sessionId) {
            console.log('✅ [Terminal] Sending to Sensei:', { serverId, sessionId });
            senseiService.appendOutput(serverId, sessionId, output);
          } else {
            console.log('❌ [Terminal] NOT sending to Sensei - conditions not met');
          }

          // Check for error messages with log file paths
          // Match various formats of log file references
          const logPatterns = [
            /check log file at ([^\s]+\.log)/i,
            /log file: ([^\s]+\.log)/i,
            /see log: ([^\s]+\.log)/i,
            /details in ([^\s]+\.log)/i,
            /logged to ([^\s]+\.log)/i
          ];

          let logFilePath = null;
          for (const pattern of logPatterns) {
            const match = output.match(pattern);
            if (match && match[1]) {
              logFilePath = match[1];
              break;
            }
          }

          if (logFilePath) {
            console.log('Error detected with log file:', logFilePath);

            // Auto-tail the log file after a short delay
            setTimeout(async () => {
              if (terminalSessionIdRef.current && xtermRef.current) {
                // Display a helpful message
                xtermRef.current.writeln('\r\n\x1b[33m# Auto-tailing error log file (last 30 lines)...\x1b[0m');
                xtermRef.current.writeln('\x1b[33m# To see more, run: tail -n 100 "' + logFilePath + '"\x1b[0m\r\n');

                // Send the tail command
                const tailCmd = `tail -n 30 "${logFilePath}"`;
                await invoke('write_to_terminal', {
                  terminalId: terminalSessionIdRef.current,
                  data: tailCmd + '\r'
                });
              }
            }, 500); // Small delay to let the error message finish displaying
          }
        }
      });

      // Store unlisten function for cleanup
      (window as any)[`unlisten-${terminalId}`] = unlisten;
    } catch (error) {
      console.error('Failed to set up terminal output listener:', error);
    }
  };

  const writeToTerminal = async (data: string, isProgrammatic: boolean = true) => {
    if (!terminalSessionIdRef.current) return;

    // Debug log to see what's being sent
    console.log(`[Terminal ${terminalSessionIdRef.current}] Writing (programmatic=${isProgrammatic}):`, JSON.stringify(data), 'Length:', data.length);

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

  const initializeMirrorMode = async (xterm: XTerm) => {
    if (!mirrorId) return;

    try {
      xterm.writeln('\x1b[33m# WezTerm Mirror Mode\x1b[0m');
      xterm.writeln('\x1b[36m# Displaying output from WezTerm terminal...\x1b[0m\r\n');

      // Listen for mirror updates
      mirrorUnlistenRef.current = await listen<MirrorUpdate>('wezterm-mirror-update', (event) => {
        const update = event.payload;
        if (update.mirror_id === mirrorId && xtermRef.current) {
          // Clear and write the new content
          xtermRef.current.clear();
          xtermRef.current.write(update.content);

          // Position cursor if provided
          if (update.cursor_x !== undefined && update.cursor_y !== undefined) {
            xtermRef.current.write(`\x1b[${update.cursor_y + 1};${update.cursor_x + 1}H`);
          }
        }
      });

      setIsConnected(true);

      // Get initial content
      try {
        const content = await invoke<string>('get_mirror_content', { mirrorId });
        if (content) {
          xterm.write(content);
        }
      } catch (error) {
        console.error('Failed to get initial mirror content:', error);
      }
    } catch (error) {
      console.error('Failed to initialize mirror mode:', error);
      xterm.writeln('\r\n\x1b[31mError: Failed to initialize mirror mode\x1b[0m');
    }
  };

  const sendToMirror = async (data: string) => {
    if (!mirrorId) return;

    try {
      await invoke('send_input_to_mirror', {
        mirrorId,
        text: data
      });
    } catch (error) {
      console.error('Failed to send input to mirror:', error);
    }
  };

  const stopMirror = async () => {
    if (!mirrorId) return;

    try {
      await invoke('stop_wezterm_mirror', { mirrorId });
    } catch (error) {
      console.error('Failed to stop mirror:', error);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-gray-900 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center space-x-2">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-sm text-gray-300">
            {mirrorId ? `WezTerm Mirror: ${mirrorId.substring(0, 8)}` : serverId ? `Server: ${serverId}` : 'Terminal'}
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
        className="flex-1 min-h-0 overflow-hidden"
        style={{ backgroundColor: '#1e1e2e', padding: '8px' }}
      />
    </div>
  );
};

export default Terminal;