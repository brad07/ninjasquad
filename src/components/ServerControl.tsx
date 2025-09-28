import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { PlusIcon, ArrowPathIcon, XCircleIcon, XMarkIcon, MagnifyingGlassIcon, FolderIcon } from '@heroicons/react/24/outline';
import { Brain } from 'lucide-react';
import Terminal from './Terminal';
import SenseiPanel from './SenseiPanel';
import SenseiSettings from './SenseiSettings';
import { opencodeSDKService, type AvailableModel } from '../services/OpenCodeSDKService';
import { projectsService } from '../services/ProjectsService';
import { senseiService } from '../services/SenseiService';
import type { OpenCodeServer } from '../types';
import type { ServerMode } from './ModeToggle';
import type { Project } from '../types/project';

interface ServerControlProps {
  servers: OpenCodeServer[];
  onServersUpdate: (servers: OpenCodeServer[]) => void;
  serverMode: ServerMode;
  onOpenTerminal?: (serverId: string, serverTitle: string) => void;
}

const ServerControl: React.FC<ServerControlProps> = ({ servers, onServersUpdate, serverMode, onOpenTerminal }) => {
  const [isSpawning, setIsSpawning] = useState(false);
  const [port, setPort] = useState(4097);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([
    { provider: 'anthropic', modelId: 'claude-sonnet-4-0', displayName: 'claude-sonnet-4-0' }
  ]);
  const [selectedModel, setSelectedModel] = useState<string>('claude-sonnet-4-0');
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [activeServerId, setActiveServerId] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState<Record<string, boolean>>({});
  const [sessionIds, setSessionIds] = useState<Record<string, string>>({});
  const [isNewSession, setIsNewSession] = useState<Record<string, boolean>>({});
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [sessionModalServerId, setSessionModalServerId] = useState<string | null>(null);
  const [availableSessions, setAvailableSessions] = useState<any[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [showKillConfirmation, setShowKillConfirmation] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [showSenseiPanel, setShowSenseiPanel] = useState(false);
  const [showSenseiSettings, setShowSenseiSettings] = useState(false);
  const [senseiEnabled, setSenseiEnabled] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadServers();
    loadProjects();
  }, []);

  // Auto-select first server when servers change (but don't create session)
  useEffect(() => {
    if (servers.length > 0 && !activeServerId) {
      const firstServer = servers[0];
      setActiveServerId(firstServer.id);
      // Don't auto-create session - let user click to create it
    }
  }, [servers]);

  useEffect(() => {
    // Load available models when in SDK mode
    if (serverMode === 'sdk') {
      loadAvailableModels();
    }
  }, [serverMode]);

  useEffect(() => {
    // Set up automatic health checks every 5 seconds
    const healthCheckInterval = setInterval(() => {
      servers.forEach(server => {
        if (server.status === 'Running' || server.status === 'Starting') {
          performHealthCheck(server.id, true); // silent health check
        }
      });
    }, 5000);

    return () => clearInterval(healthCheckInterval);
  }, [servers]);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const loadServers = async () => {
    try {
      const serverList = await invoke<OpenCodeServer[]>('list_opencode_servers');
      onServersUpdate(serverList);
    } catch (error) {
      console.error('Failed to load servers:', error);
    }
  };

  const loadProjects = async () => {
    try {
      const projectList = await projectsService.listProjects();
      // Sort projects alphabetically by name
      setProjects(projectList.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (error) {
      console.error('Failed to load projects:', error);
    }
  };

  const loadAvailableModels = async () => {
    setIsLoadingModels(true);
    try {
      // First we need an SDK server to be connected to fetch models
      const sdkServers = opencodeSDKService.listSDKServers();

      if (sdkServers.length > 0) {
        // Use the first available SDK server to fetch models
        const models = await opencodeSDKService.fetchAvailableModels(sdkServers[0].id);
        setAvailableModels(models);
        console.log('Available models loaded:', models);
      } else {
        // No SDK server connected yet, keep default model
        console.log('No SDK server connected to fetch models from, using default');
        setAvailableModels([
          { provider: 'anthropic', modelId: 'claude-sonnet-4-0', displayName: 'claude-sonnet-4-0' }
        ]);
      }
    } catch (error) {
      console.error('Failed to load available models:', error);
      // Keep default model on error
      setAvailableModels([
        { provider: 'anthropic', modelId: 'claude-sonnet-4-0', displayName: 'claude-sonnet-4-0' }
      ]);
    } finally {
      setIsLoadingModels(false);
    }
  };

  const spawnServer = async () => {
    // First show project selector modal
    setShowProjectModal(true);
  };

  const spawnServerWithProject = async (project: Project | null) => {
    let workingDir: string;

    if (project) {
      workingDir = project.path;
      // Update project last accessed time (don't wait for it)
      projectsService.updateProjectLastAccessed(project.id).catch(error => {
        console.error('Failed to update project last accessed time:', error);
      });
    } else {
      // If no project selected, ask user to select a directory
      const selectedDir = await open({
        directory: true,
        multiple: false,
        title: 'Select working directory for OpenCode server'
      });

      if (!selectedDir) {
        // User cancelled the dialog
        return;
      }
      workingDir = selectedDir as string;
    }

    setShowProjectModal(false);

    setIsSpawning(true);
    try {
      if (serverMode === 'sdk') {
        // Simply register the server info without spawning anything
        // The terminal will run opencode --port <portno>
        const serverId = `opencode-${port}`;
        const newServer: OpenCodeServer = {
          id: serverId,
          host: 'localhost',
          port: port,
          status: 'Starting' as any,
          working_dir: workingDir
        };

        onServersUpdate([...servers, newServer]);

        setNotification({
          message: `Server registered on port ${port}`,
          type: 'success'
        });

        // Set this as active server
        setActiveServerId(newServer.id);

        // Mark session as ready so terminal can be opened
        setSessionReady(prev => ({ ...prev, [serverId]: true }));
        setSessionIds(prev => ({ ...prev, [serverId]: `session-${Date.now()}` }));
        setIsNewSession(prev => ({ ...prev, [serverId]: true }));

        setPort(port + 1);
      } else {
        // Process Mode: Use existing Tauri command
        const newServer = await invoke<OpenCodeServer>('spawn_opencode_server', {
          port,
          workingDir: workingDir
        });
        onServersUpdate([...servers, newServer]);
        setPort(port + 1);
        setNotification({
          message: `Server spawned successfully on port ${port}`,
          type: 'success'
        });
      }
    } catch (error) {
      console.error('Failed to spawn server:', error);
      setNotification({
        message: `Failed to spawn server: ${error}`,
        type: 'error'
      });
    } finally {
      setIsSpawning(false);
    }
  };

  const handleCreateSession = async (serverId: string): Promise<boolean> => {
    console.log('Creating or connecting to session for server:', serverId);
    try {
      if (serverMode === 'sdk') {
        // SDK Mode: Find the SDK server for this port and create session
        const server = servers.find(s => s.id === serverId);
        if (!server) {
          console.error('Server not found in servers list:', serverId);
          return false; // Return false if server not found
        }

        // Find or create SDK connection for this server
        console.log('Looking for SDK server with port:', server.port);
        console.log('Available SDK servers:', opencodeSDKService.listSDKServers());
        let sdkServer = opencodeSDKService.listSDKServers().find(s => s.port === server.port);
        console.log('Found existing SDK server:', sdkServer);

        if (!sdkServer) {
          try {
            console.log('No existing SDK server found, creating SDK connection for port:', server.port, 'with model:', selectedModel);
            sdkServer = await opencodeSDKService.connectToServerWithSDK(server.port, selectedModel);
            console.log('SDK server created:', sdkServer);
            // Wait a bit for connection to stabilize
            await new Promise(resolve => setTimeout(resolve, 1000));
          } catch (connError) {
            console.error('Failed to connect SDK to server:', connError);
            return false;
          }
        }

        try {
          // Always create a new session for existing servers on app reload
          // This avoids issues with stale sessions from previous runs
          console.log('Creating new SDK session for server:', sdkServer.id);

          // First check if we already have a session ID stored for this server in our state
          const existingSessionId = sessionIds[serverId];
          let sessionToUse = null;

          if (existingSessionId) {
            // We already have a session for this server in the current app run
            console.log('Using existing session from current app run:', existingSessionId);
            sessionToUse = opencodeSDKService.getSDKSession(existingSessionId);
          }

          if (!sessionToUse) {
            // Create a fresh session
            sessionToUse = await opencodeSDKService.createSDKSession(sdkServer.id);
            console.log('SDK Session created:', sessionToUse.session);
            console.log('Session ID:', sessionToUse.session.id);
            console.log('Session Title:', sessionToUse.session.title);
            setNotification({
              message: `New session created successfully!`,
              type: 'success'
            });
          }

          // Mark session as ready for this server and store session ID
          setSessionReady(prev => ({ ...prev, [serverId]: true }));
          setSessionIds(prev => ({ ...prev, [serverId]: sessionToUse.session.id }));
          // Track that this is a new session (always true when creating fresh sessions)
          setIsNewSession(prev => ({ ...prev, [serverId]: !existingSessionId }));
          return true;
        } catch (sessionError: any) {
          // Session might already exist, which is fine
          console.error('Session creation/connection failed:', sessionError);
          console.error('Session error details:', sessionError?.message, sessionError?.stack);

          // Still mark as ready even if session creation fails - the server is ready
          // The user can manually create a session later
          setSessionReady(prev => ({ ...prev, [serverId]: true }));

          // Try to find the existing session ID
          const sessions = opencodeSDKService.listSDKSessions();
          const existingSession = sessions.find(s => {
            const sdkServer = opencodeSDKService.listSDKServers().find(srv => srv.id === s.serverId);
            return sdkServer && sdkServer.port === server.port;
          });
          if (existingSession) {
            console.log('Found existing session:', existingSession.session.id);
            setSessionIds(prev => ({ ...prev, [serverId]: existingSession.session.id }));
          }

          setNotification({
            message: `Server ready, but session creation failed: ${sessionError?.message || sessionError}`,
            type: 'error'
          });

          return true; // Still return true as the server is ready
        }
      } else {
        // Process Mode: Use existing Tauri command
        const session = await invoke('register_session', { serverId: serverId });
        console.log('Session created:', session);
        setNotification({
          message: 'Session created successfully!',
          type: 'success'
        });
        setSessionReady(prev => ({ ...prev, [serverId]: true }));
        return true;
      }
    } catch (error) {
      console.error('Failed to create session:', error);
      return false;
    } finally {
      // Load and update sessions in parent component if callback exists
      if (window.loadSessions) {
        window.loadSessions();
      }
    }
  };

  const handleStopServer = async (serverId: string) => {
    try {
      if (serverMode === 'sdk') {
        // SDK Mode: Disconnect SDK and stop the actual server
        const sdkServers = opencodeSDKService.listSDKServers();
        const sdkServer = sdkServers.find(s => s.port === servers.find(srv => srv.id === serverId)?.port);
        if (sdkServer) {
          await opencodeSDKService.disconnectFromServerWithSDK(sdkServer.id);
        }
        // Stop the actual server (Rust expects snake_case)
        await invoke('stop_opencode_server', { server_id: serverId });
        await loadServers();
      } else {
        // Process Mode: Use existing Tauri command (Rust expects snake_case)
        await invoke('stop_opencode_server', { server_id: serverId });
        await loadServers();
      }
      // If this was the active server, clear the selection
      if (activeServerId === serverId) {
        setActiveServerId(null);
      }
      setNotification({
        message: 'Server stopped successfully',
        type: 'success'
      });
    } catch (error) {
      console.error('Failed to stop server:', error);
      setNotification({
        message: `Failed to stop server: ${error}`,
        type: 'error'
      });
    }
  };


  const killAllServers = async () => {
    console.log('Kill all servers button clicked');
    // Show our custom confirmation modal
    setShowKillConfirmation(true);
  };

  const confirmKillAllServers = async () => {
    console.log('Kill all servers confirmed, proceeding...');
    setShowKillConfirmation(false);

    try {
      let totalKilled = 0;

      if (serverMode === 'sdk') {
        console.log('SDK Mode: Disconnecting SDK connections and killing servers');

        // SDK Mode: Disconnect all SDK connections and kill all servers
        const sdkCount = await opencodeSDKService.disconnectAllSDKServers();
        console.log(`Disconnected ${sdkCount} SDK connections`);

        const count = await invoke<number>('kill_all_servers');
        console.log(`Killed ${count} server processes via Tauri`);

        totalKilled = sdkCount + count;

        // Show success toast
        setNotification({
          message: `✓ All servers killed successfully! Disconnected ${sdkCount} SDK connection${sdkCount !== 1 ? 's' : ''} and terminated ${count} server process${count !== 1 ? 'es' : ''}`,
          type: 'success'
        });
      } else {
        // Process Mode: Use existing Tauri command (also kills orphaned processes)
        const count = await invoke<number>('kill_all_servers');
        totalKilled = count;

        // Show success toast
        setNotification({
          message: `✓ Successfully killed ${count} server${count !== 1 ? 's' : ''}!`,
          type: 'success'
        });
      }

      // Clear the servers list and reload
      console.log('Reloading servers list...');
      await loadServers();

      // Also reload sessions since they're linked to servers
      if (window.loadSessions) {
        console.log('Reloading sessions...');
        window.loadSessions();
      }

      // If no servers were tracked but the command succeeded, show a different message
      if (totalKilled === 0) {
        console.log('No servers were tracked, but kill command succeeded');
        setNotification({
          message: `✓ All server processes terminated. No tracked servers were running.`,
          type: 'success'
        });
      }

      console.log('Kill all servers completed successfully');
    } catch (error) {
      console.error('Failed to kill all servers:', error);
      setNotification({
        message: `✗ Failed to kill servers: ${error}`,
        type: 'error'
      });
    }
  };

  const scanForServers = async () => {
    console.log('Scanning for servers...');
    setIsScanning(true);

    try {
      // Scan common OpenCode server port range (4000-5000)
      const discoveredServers = await invoke<OpenCodeServer[]>('scan_for_servers', {
        startPort: 4000,
        endPort: 5000
      });

      if (discoveredServers.length > 0) {
        console.log(`Found ${discoveredServers.length} servers`);
        setNotification({
          message: `✓ Found ${discoveredServers.length} running server${discoveredServers.length !== 1 ? 's' : ''}!`,
          type: 'success'
        });

        // Reload servers to show the discovered ones
        await loadServers();
      } else {
        setNotification({
          message: 'No servers found in port range 4000-5000',
          type: 'success'
        });
      }
    } catch (error) {
      console.error('Failed to scan for servers:', error);
      setNotification({
        message: `Failed to scan: ${error}`,
        type: 'error'
      });
    } finally {
      setIsScanning(false);
    }
  };

  const performHealthCheck = async (serverId: string, silent: boolean = false) => {
    try {
      const healthy = await invoke<boolean>('health_check_server', { serverId });

      // Update server status based on health check
      const updatedServers = servers.map(server => {
        if (server.id === serverId) {
          return {
            ...server,
            status: healthy ? 'Running' : { Error: 'Health check failed' }
          };
        }
        return server;
      });
      onServersUpdate(updatedServers);

      if (!silent) {
        setNotification({
          message: `Server is ${healthy ? 'healthy ✓' : 'unhealthy ✗'}`,
          type: healthy ? 'success' : 'error'
        });
      }
    } catch (error) {
      console.error('Failed to check server health:', error);

      // Update server status to error
      const updatedServers = servers.map(server => {
        if (server.id === serverId) {
          return {
            ...server,
            status: { Error: 'Not responding' }
          };
        }
        return server;
      });
      onServersUpdate(updatedServers);

      if (!silent) {
        setNotification({
          message: `Health check failed: ${error}`,
          type: 'error'
        });
      }
    }
  };


  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Main content area */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Notification */}
        {notification && (
          <div className={`fixed top-4 right-4 px-4 py-3 rounded-lg shadow-lg z-50 transition-all ${
            notification.type === 'success'
              ? 'bg-green-500 text-white'
              : 'bg-red-500 text-white'
          }`}>
            <div className="flex items-center">
              <span className="font-medium">{notification.message}</span>
              <button
                onClick={() => setNotification(null)}
                className="ml-4 text-white hover:text-gray-200"
              >
                ×
              </button>
            </div>
          </div>
        )}

        {/* Kill Confirmation Modal */}
        {showKillConfirmation && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
              <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
                Confirm Kill All Servers
              </h2>
              <p className="text-gray-700 dark:text-gray-300 mb-4">
                Are you sure you want to kill ALL OpenCode servers?
              </p>
              <div className="mb-6 space-y-2 text-sm text-gray-600 dark:text-gray-400">
                <p>This will:</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Stop all running servers</li>
                  <li>Terminate orphaned processes</li>
                  <li>Clear all active connections</li>
                </ul>
              </div>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowKillConfirmation(false)}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmKillAllServers}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  Kill All Servers
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Control Panel */}
        <div className="p-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
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
          {serverMode === 'sdk' && (
            <div className="flex-1">
              <label htmlFor="model" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Model
              </label>
              <select
                id="model"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                disabled={isLoadingModels}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700"
              >
                {isLoadingModels && <option>Loading models...</option>}
                {!isLoadingModels && availableModels.map(model => (
                  <option
                    key={`${model.provider}/${model.modelId}`}
                    value={model.modelId}
                  >
                    {model.displayName}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button
            onClick={spawnServer}
            disabled={isSpawning}
            className="btn-primary flex items-center gap-2"
          >
            <PlusIcon className="h-5 w-5" />
            {isSpawning ? 'Starting...' : 'Start Server'}
          </button>
          <button
            onClick={loadServers}
            className="btn-secondary flex items-center gap-2"
          >
            <ArrowPathIcon className="h-5 w-5" />
            Refresh
          </button>
          <button
            onClick={scanForServers}
            disabled={isScanning}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            <MagnifyingGlassIcon className="h-5 w-5" />
            {isScanning ? 'Scanning...' : 'Scan for Servers'}
          </button>
          <button
            onClick={killAllServers}
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
          >
            <XCircleIcon className="h-5 w-5" />
            Kill All Servers
          </button>
        </div>
        </div>

        {/* Server Tabs and Terminal Area */}
        {servers.length > 0 ? (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Server Tabs */}
            <div className="flex bg-gray-800 border-b border-gray-700 overflow-x-auto flex-shrink-0">
              {servers.map((server) => {
                const isActive = activeServerId === server.id;
                const statusColor = server.status === 'Running' ? 'text-green-400' :
                                  server.status === 'Starting' ? 'text-yellow-400' :
                                  'text-red-400';

                return (
                  <div
                    key={server.id}
                    className={`flex items-center px-4 py-3 cursor-pointer border-r border-gray-700 min-w-[200px] transition-colors ${
                      isActive ? 'bg-gray-700 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-750'
                    }`}
                    onClick={async () => {
                      setActiveServerId(server.id);
                      // Auto-create session when switching tabs if needed
                      if (!sessionReady[server.id]) {
                        // Show loading state immediately
                        const success = await handleCreateSession(server.id);
                        if (!success) {
                          console.error('Failed to create session for server:', server.id);
                        }
                      }
                    }}
                  >
                    <ServerIcon className="h-4 w-4 mr-2" />
                    <span className="text-sm font-medium">Port {server.port}</span>
                    <span className={`ml-2 text-xs ${statusColor}`}>●</span>
                    <div className="ml-auto flex items-center gap-2">
                      {isActive && (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const enabled = !senseiEnabled[server.id];
                              setSenseiEnabled(prev => ({ ...prev, [server.id]: enabled }));
                              setShowSenseiPanel(enabled);
                              if (sessionIds[server.id]) {
                                senseiService.toggleSensei(server.id, sessionIds[server.id], enabled);
                              }
                            }}
                            className={`p-1.5 rounded transition-colors ${
                              senseiEnabled[server.id]
                                ? 'text-blue-400 bg-blue-600/20'
                                : 'text-gray-500 hover:text-gray-300'
                            }`}
                            title="Toggle Sensei AI Assistant"
                          >
                            <Brain className="h-4 w-4" />
                          </button>
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();

                              setSessionModalServerId(server.id);
                              setIsLoadingSessions(true);
                              setShowSessionModal(true);

                              try {
                                // Get SDK server connection
                                let sdkServer = opencodeSDKService.listSDKServers().find(s => s.port === server.port);
                                if (!sdkServer) {
                                  sdkServer = await opencodeSDKService.connectToServerWithSDK(server.port, selectedModel);
                                }

                                // Fetch existing sessions
                                const sessions = await opencodeSDKService.listSessionsForServer(sdkServer.id);
                                setAvailableSessions(sessions || []);
                              } catch (error) {
                                console.error('Failed to fetch sessions:', error);
                                setAvailableSessions([]);
                              } finally {
                                setIsLoadingSessions(false);
                              }
                            }}
                            className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-white"
                          >
                            Session
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStopServer(server.id);
                            }}
                            className="text-gray-400 hover:text-red-400 transition-colors"
                          >
                            <XMarkIcon className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Terminal and Sensei Content */}
            <div className="flex-1 bg-gray-900 flex min-h-0">
              <div className="flex-1 flex flex-col min-h-0">
              {activeServerId && sessionReady[activeServerId] ? (
                <Terminal
                  key={`${activeServerId}-${sessionIds[activeServerId]}`}
                  serverId={activeServerId}
                  sessionId={sessionIds[activeServerId]}
                  isNewSession={isNewSession[activeServerId] || false}
                  onClose={() => setActiveServerId(null)}
                  enableSensei={senseiEnabled[activeServerId] || false}
                />
              ) : activeServerId ? (
                <div className="flex items-center justify-center h-full text-gray-500">
                  <div className="text-center">
                    <ServerIcon className="h-12 w-12 mx-auto mb-4" />
                    <p className="mb-4">Server is ready on port {servers.find(s => s.id === activeServerId)?.port}</p>
                    <button
                      onClick={async () => {
                        // First check for existing sessions
                        const server = servers.find(s => s.id === activeServerId);
                        if (!server) return;

                        setSessionModalServerId(activeServerId);
                        setIsLoadingSessions(true);
                        setShowSessionModal(true);

                        try {
                          // Get SDK server connection
                          let sdkServer = opencodeSDKService.listSDKServers().find(s => s.port === server.port);
                          if (!sdkServer) {
                            sdkServer = await opencodeSDKService.connectToServerWithSDK(server.port, selectedModel);
                          }

                          // Fetch existing sessions
                          const sessions = await opencodeSDKService.listSessionsForServer(sdkServer.id);
                          setAvailableSessions(sessions || []);
                        } catch (error) {
                          console.error('Failed to fetch sessions:', error);
                          setAvailableSessions([]);
                        } finally {
                          setIsLoadingSessions(false);
                        }
                      }}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                    >
                      Manage Sessions
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500">
                  <div className="text-center">
                    <ServerIcon className="h-12 w-12 mx-auto mb-4" />
                    <p>Select a server tab to view its terminal</p>
                  </div>
                </div>
              )}
              </div>
              {showSenseiPanel && (
                <div className="w-96">
                  {activeServerId && sessionIds[activeServerId] ? (
                    <SenseiPanel
                      serverId={activeServerId}
                      sessionId={sessionIds[activeServerId]}
                      onExecuteCommand={(command) => {
                        // Command will be executed through event system
                        console.log('Executing Sensei command:', command);
                      }}
                      onOpenSettings={() => setShowSenseiSettings(true)}
                    />
                  ) : (
                    <div className="flex flex-col h-full bg-gray-800 border-l border-gray-700">
                      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
                        <div className="flex items-center gap-2">
                          <Brain className="h-5 w-5 text-gray-500" />
                          <span className="font-medium text-gray-200">Sensei AI Assistant</span>
                        </div>
                      </div>
                      <div className="flex-1 flex items-center justify-center p-4">
                        <div className="text-center">
                          <Brain className="h-12 w-12 text-gray-600 mb-3" />
                          <p className="text-gray-400 mb-2">{!activeServerId ? 'No server selected' : 'No session active'}</p>
                          <p className="text-sm text-gray-500">
                            {!activeServerId ? 'Select a server to use Sensei' : 'Create or connect to a session to use Sensei'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <ServerIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400">No servers running</p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
                Click "Spawn Server" to create your first OpenCode server
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Project Selection Modal */}
      {showProjectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-[500px] max-w-full max-h-[70vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4 text-gray-100">Select Project</h3>

            <div className="space-y-2 mb-4">
              {projects.length > 0 ? (
                <>
                  {projects.map(project => (
                    <button
                      key={project.id}
                      onClick={() => {
                        setSelectedProject(project);
                        spawnServerWithProject(project);
                      }}
                      className="w-full p-3 bg-gray-800/50 hover:bg-gray-800 border border-gray-700 rounded-lg transition-all text-left group"
                    >
                      <div className="flex items-center space-x-3">
                        <div
                          className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: project.color || '#3b82f6' }}
                        >
                          <FolderIcon className="w-4 h-4 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-gray-100">{project.name}</h4>
                          {project.description && (
                            <p className="text-xs text-gray-400 truncate">{project.description}</p>
                          )}
                          <p className="text-xs text-gray-500 truncate mt-1">{project.path}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </>
              ) : (
                <div className="text-center py-4 text-gray-500">
                  No projects yet. Create one in the Projects tab.
                </div>
              )}

              {/* Option to select custom directory */}
              <button
                onClick={() => spawnServerWithProject(null)}
                className="w-full p-3 bg-gray-800/50 hover:bg-gray-800 border border-gray-700 border-dashed rounded-lg transition-all text-left"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-md bg-gray-700 flex items-center justify-center flex-shrink-0">
                    <FolderIcon className="w-4 h-4 text-gray-400" />
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-300">Select Custom Directory...</h4>
                    <p className="text-xs text-gray-500">Browse for a directory without creating a project</p>
                  </div>
                </div>
              </button>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setShowProjectModal(false)}
                className="px-4 py-2 text-gray-400 hover:text-gray-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Session Selection Modal */}
      {showSessionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-white mb-4">
              Manage Sessions
            </h3>

            {isLoadingSessions ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-gray-400">Loading sessions...</div>
              </div>
            ) : (
              <>
                {availableSessions.length > 0 && (
                  <div className="mb-4">
                    <p className="text-sm text-gray-400 mb-2">
                      Existing sessions (from current or previous server runs):
                    </p>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {availableSessions.map((session) => (
                        <button
                          key={session.id}
                          onClick={async () => {
                            if (sessionModalServerId) {
                              const server = servers.find(s => s.id === sessionModalServerId);
                              if (!server) return;

                              try {
                                // Get SDK server connection
                                let sdkServer = opencodeSDKService.listSDKServers().find(s => s.port === server.port);
                                if (!sdkServer) {
                                  sdkServer = await opencodeSDKService.connectToServerWithSDK(server.port, selectedModel);
                                }

                                // Connect to existing session
                                const connected = await opencodeSDKService.connectToExistingSession(sdkServer.id, session.id);
                                if (connected) {
                                  setSessionReady(prev => ({ ...prev, [sessionModalServerId]: true }));
                                  setSessionIds(prev => ({ ...prev, [sessionModalServerId]: session.id }));
                                  setIsNewSession(prev => ({ ...prev, [sessionModalServerId]: false })); // Mark as existing session
                                  setNotification({
                                    message: `Connected to session: ${session.title || session.id}`,
                                    type: 'success'
                                  });
                                  setShowSessionModal(false);
                                }
                              } catch (error) {
                                console.error('Failed to connect to session:', error);
                                setNotification({
                                  message: `Failed to connect to session`,
                                  type: 'error'
                                });
                              }
                            }
                          }}
                          className="w-full text-left px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white transition-colors"
                        >
                          <div className="font-medium">{session.title || `Session ${session.id}`}</div>
                          <div className="text-xs text-gray-400 mt-1">
                            {session.created ? (
                              <>Created: {new Date(session.created).toLocaleString()}</>
                            ) : (
                              <>Session ID: {session.id.substring(0, 12)}...</>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      if (sessionModalServerId) {
                        const server = servers.find(s => s.id === sessionModalServerId);
                        if (!server) return;

                        try {
                          // Get SDK server connection
                          let sdkServer = opencodeSDKService.listSDKServers().find(s => s.port === server.port);
                          if (!sdkServer) {
                            sdkServer = await opencodeSDKService.connectToServerWithSDK(server.port, selectedModel);
                          }

                          // Create new session
                          const newSession = await opencodeSDKService.createSDKSession(sdkServer.id);
                          setSessionReady(prev => ({ ...prev, [sessionModalServerId]: true }));
                          setSessionIds(prev => ({ ...prev, [sessionModalServerId]: newSession.session.id }));
                          setIsNewSession(prev => ({ ...prev, [sessionModalServerId]: true })); // Mark as new session
                          setNotification({
                            message: `New session created successfully!`,
                            type: 'success'
                          });
                          setShowSessionModal(false);
                        } catch (error) {
                          console.error('Failed to create session:', error);
                          setNotification({
                            message: `Failed to create session`,
                            type: 'error'
                          });
                        }
                      }
                    }}
                    className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                  >
                    Create New Session
                  </button>
                  <button
                    onClick={() => setShowSessionModal(false)}
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Sensei Settings Modal */}
      {showSenseiSettings && activeServerId && sessionIds[activeServerId] && (
        <SenseiSettings
          serverId={activeServerId}
          sessionId={sessionIds[activeServerId]}
          isOpen={showSenseiSettings}
          onClose={() => setShowSenseiSettings(false)}
        />
      )}
    </div>
  );
};

const ServerIcon: React.FC<{ className?: string }> = ({ className = "h-6 w-6" }) => {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
    </svg>
  );
};

export default ServerControl;