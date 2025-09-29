import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import Dashboard from './components/Dashboard';
import ServerControl from './components/ServerControl';
import SessionView from './components/SessionView';
import TaskDistribution from './components/TaskDistribution';
import { Projects } from './components/Projects';
import ProjectView from './components/ProjectView';
import ProjectSidebar from './components/ProjectSidebar';
import AdminPage from './components/AdminPage';
import LinearPage from './components/LinearPage';
import TopNav, { type MainView } from './components/TopNav';
import ModeToggle, { type ServerMode } from './components/ModeToggle';
import Terminal from './components/Terminal';
import RetroUIShowcase from './components/RetroUIShowcase';
import { opencodeSDKService } from './services/OpenCodeSDKService';
import { projectsService } from './services/ProjectsService';
import type { OpenCodeServer, OrchestratorSession } from './types';
import type { Project } from './types/project';
import { FolderOpen, Plus } from 'lucide-react';

interface TerminalTab {
  id: string;
  serverId?: string;
  sessionId?: string;
  title: string;
}

function App() {
  const [currentView, setCurrentView] = useState<MainView>('projects');
  const [servers, setServers] = useState<OpenCodeServer[]>([]);
  const [sessions, setSessions] = useState<OrchestratorSession[]>([]);
  // Default to SDK mode since we're only using that now
  const [serverMode] = useState<ServerMode>('sdk');
  const [terminalTabs, setTerminalTabs] = useState<TerminalTab[]>([]);
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null);
  const [showTerminal, setShowTerminal] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectPath, setNewProjectPath] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');
  const [selectedColor, setSelectedColor] = useState('#3b82f6');

  const colors = [
    '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
    '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#a855f7'
  ];

  // Load sessions function that can be called globally
  const loadSessions = async () => {
    try {
      // Get Process Mode sessions from Tauri
      const tauriSessions = await invoke<OrchestratorSession[]>('list_sessions');

      // Get SDK Mode sessions
      const sdkSessions = opencodeSDKService.listSDKSessions();

      // Convert SDK sessions to OrchestratorSession format
      const sdkOrchestratorSessions: OrchestratorSession[] = sdkSessions.map(extSession => ({
        id: extSession.session.id,
        server_id: extSession.serverId,
        status: extSession.status,
        task: undefined,
        agent_id: extSession.session.id
      }));

      // Combine both lists
      const allSessions = [...tauriSessions, ...sdkOrchestratorSessions];
      console.log('Sessions loaded:', allSessions);
      setSessions(allSessions);
    } catch (error) {
      console.error('Failed to load sessions:', error);
    }
  };

  // Initialize plugins on app start
  const initializePlugins = async () => {
    // Check if already initialized using a window flag
    if ((window as any).pluginsInitialized) {
      console.log('Plugins already initialized');
      return;
    }

    try {
      await invoke('initialize_plugins');
      (window as any).pluginsInitialized = true;
      console.log('Plugins initialized successfully');
    } catch (error) {
      console.error('Failed to initialize plugins:', error);
    }
  };

  // Initialize Slack service on app start if configured
  const initializeSlack = async () => {
    // Check if already initialized
    if ((window as any).slackInitialized) {
      console.log('Slack already initialized');
      return;
    }

    try {
      // Import dynamically to avoid circular dependencies
      const { slackService } = await import('./services/SlackService');
      const { apiKeyService } = await import('./services/ApiKeyService');

      // Check if Slack credentials and channel are configured
      const botToken = apiKeyService.getKey('slack-bot-token');
      const signingSecret = apiKeyService.getKey('slack-signing-secret');
      const appToken = apiKeyService.getKey('slack-app-token');
      const channel = localStorage.getItem('slack-channel');

      if (botToken && signingSecret && appToken && channel) {
        console.log('🔧 Auto-connecting to Slack (credentials found)...');

        // Set enabled to true automatically
        localStorage.setItem('slack-enabled', 'true');

        const success = await slackService.initialize({
          botToken,
          signingSecret,
          appToken,
          channel,
          enabled: true
        });

        if (success) {
          console.log('✅ Slack auto-connected successfully');
          (window as any).slackInitialized = true;
        } else {
          console.log('⚠️ Slack failed to connect');
        }
      } else {
        console.log('⏭️ Slack credentials not configured, skipping auto-connect');
      }
    } catch (error) {
      console.error('Failed to auto-connect to Slack:', error);
    }
  };

  // Make loadSessions available globally and initialize plugins
  useEffect(() => {
    (window as any).loadSessions = loadSessions;
    // Initialize plugins
    initializePlugins();
    // Initialize Slack service if configured
    initializeSlack();
    // Load sessions initially
    loadSessions();
  }, []);

  // Function to open a terminal for a server
  const openTerminalForServer = (serverId: string, serverTitle: string) => {
    const terminalId = `terminal-${Date.now()}`;
    const newTab: TerminalTab = {
      id: terminalId,
      serverId,
      title: serverTitle
    };
    setTerminalTabs(prev => [...prev, newTab]);
    setActiveTerminalId(terminalId);
    setShowTerminal(true);
  };

  // Function to close a terminal tab
  const closeTerminalTab = (tabId: string) => {
    setTerminalTabs(prev => prev.filter(tab => tab.id !== tabId));
    if (activeTerminalId === tabId) {
      const remainingTabs = terminalTabs.filter(tab => tab.id !== tabId);
      if (remainingTabs.length > 0) {
        setActiveTerminalId(remainingTabs[remainingTabs.length - 1].id);
      } else {
        setActiveTerminalId(null);
        setShowTerminal(false);
      }
    }
  };

  // Make openTerminalForServer available globally
  useEffect(() => {
    (window as any).openTerminalForServer = openTerminalForServer;
  }, []);

  const handleBrowsePath = async () => {
    const selectedPath = await open({
      directory: true,
      multiple: false,
      title: 'Select project directory'
    });
    if (selectedPath) {
      setNewProjectPath(selectedPath as string);
    }
  };

  const handleCreateProject = async () => {
    if (!newProjectName || !newProjectPath) return;

    try {
      const exists = await projectsService.projectExists(newProjectPath);
      if (exists) {
        const existing = await projectsService.getProjectByPath(newProjectPath);
        if (existing) {
          alert('A project already exists at this location.');
          return;
        }
      }

      const project = await projectsService.createProject({
        name: newProjectName,
        path: newProjectPath,
        description: newProjectDescription || undefined,
        color: selectedColor
      });

      if (project) {
        setSelectedProject(project);
        setShowNewProjectDialog(false);
        setNewProjectName('');
        setNewProjectPath('');
        setNewProjectDescription('');
        setSelectedColor('#3b82f6');
      }
    } catch (error) {
      console.error('Failed to create project:', error);
      alert('Failed to create project. Please try again.');
    }
  };

  const renderMainView = () => {
    if (selectedProject) {
      return (
        <ProjectView
          project={selectedProject}
          onBack={() => setSelectedProject(null)}
          onEdit={(updatedProject) => setSelectedProject(updatedProject)}
          onDelete={(project) => {
            projectsService.deleteProject(project.id);
            setSelectedProject(null);
          }}
        />
      );
    }

    switch (currentView) {
      case 'dashboard':
        return <Dashboard servers={servers} sessions={sessions} />;
      case 'linear':
        return <LinearPage />;
      case 'servers':
        return (
          <div className="h-full flex flex-col">
            <ServerControl servers={servers} onServersUpdate={setServers} serverMode={serverMode} onOpenTerminal={openTerminalForServer} />
          </div>
        );
      case 'sessions':
        return <SessionView sessions={sessions} onSessionsUpdate={setSessions} />;
      case 'tasks':
        return <TaskDistribution sessions={sessions} serverMode={serverMode} />;
      case 'admin':
        return <AdminPage />;
      case 'retroui':
        return <RetroUIShowcase />;
      default:
        return <Dashboard servers={servers} sessions={sessions} />;
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 overflow-hidden">
      {/* Top Navigation */}
      <div className="flex-shrink-0 z-50">
        <TopNav
          currentView={currentView}
          onViewChange={(view) => {
            setCurrentView(view);
            setSelectedProject(null); // Clear selected project when switching tabs
          }}
        />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Project Sidebar - Only show on projects page or when a project is selected */}
        {(currentView === 'projects' || selectedProject) && (
          <ProjectSidebar
            selectedProjectId={selectedProject?.id || null}
            onProjectSelect={setSelectedProject}
            onNewProject={() => setShowNewProjectDialog(true)}
          />
        )}

        {/* Main Content */}
        <main className="flex-1 flex flex-col overflow-hidden">
          <div className={`${showTerminal && currentView !== 'servers' ? 'h-1/2' : 'flex-1'} flex flex-col overflow-hidden`}>
            {(currentView === 'servers' || selectedProject) ? (
              // For servers view or project view, use full height
              <div className="h-full flex flex-col overflow-hidden">
                <div className="flex-1 overflow-hidden">
                  {renderMainView()}
                </div>
              </div>
            ) : (
              // For other views, use the original container layout
              <div className="overflow-y-auto">
                <div className="container mx-auto px-6 py-8">
                  {renderMainView()}
                </div>
              </div>
            )}
          </div>
          {showTerminal && terminalTabs.length > 0 && (
            <div className="h-1/2 flex flex-col border-t border-gray-700">
              <div className="flex bg-gray-800 border-b border-gray-700 overflow-x-auto">
                {terminalTabs.map(tab => (
                  <div
                    key={tab.id}
                    className={`flex items-center px-4 py-2 cursor-pointer border-r border-gray-700 ${
                      activeTerminalId === tab.id ? 'bg-gray-700 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-750'
                    }`}
                    onClick={() => setActiveTerminalId(tab.id)}
                  >
                    <span className="text-sm">{tab.title}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        closeTerminalTab(tab.id);
                      }}
                      className="ml-2 text-gray-500 hover:text-white"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex-1 relative">
                {terminalTabs.map(tab => (
                  <div
                    key={tab.id}
                    className={`absolute inset-0 ${activeTerminalId === tab.id ? 'block' : 'hidden'}`}
                  >
                    <Terminal
                      serverId={tab.serverId}
                      sessionId={tab.sessionId}
                      onClose={() => closeTerminalTab(tab.id)}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* New Project Dialog */}
      {showNewProjectDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white border-4 border-black rounded-lg p-6 w-96 max-w-full shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
            <h3 className="text-2xl font-bold mb-4 text-black">New Project</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Project Name
                </label>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  className="w-full px-3 py-2 bg-white border-2 border-black rounded text-gray-900 focus:outline-none focus:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                  placeholder="My Awesome Project"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Project Path
                </label>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={newProjectPath}
                    onChange={(e) => setNewProjectPath(e.target.value)}
                    className="flex-1 px-3 py-2 bg-gray-100 border-2 border-black rounded text-gray-900 focus:outline-none focus:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                    placeholder="/path/to/project"
                    readOnly
                  />
                  <button
                    onClick={handleBrowsePath}
                    className="px-4 py-2 bg-orange-400 hover:bg-orange-500 text-black font-bold border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] transition-all flex items-center space-x-2 rounded"
                  >
                    <FolderOpen size={18} />
                    <span>Browse</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Description (optional)
                </label>
                <textarea
                  value={newProjectDescription}
                  onChange={(e) => setNewProjectDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-white border-2 border-black rounded text-gray-900 focus:outline-none focus:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                  placeholder="A brief description of your project"
                  rows={3}
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Color
                </label>
                <div className="flex space-x-2">
                  {colors.map((color) => (
                    <button
                      key={color}
                      onClick={() => setSelectedColor(color)}
                      className={`w-8 h-8 rounded border-2 transition-all ${
                        selectedColor === color ? 'border-black scale-110 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]' : 'border-gray-400'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => {
                  setShowNewProjectDialog(false);
                  setNewProjectName('');
                  setNewProjectPath('');
                  setNewProjectDescription('');
                  setSelectedColor('#3b82f6');
                }}
                className="px-4 py-2 bg-gray-200 text-black font-bold border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all rounded"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateProject}
                disabled={!newProjectName || !newProjectPath}
                className="px-4 py-2 bg-green-400 hover:bg-green-500 text-black font-bold border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] disabled:opacity-50 disabled:cursor-not-allowed transition-all rounded"
              >
                Create Project
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;