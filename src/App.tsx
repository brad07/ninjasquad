import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import Dashboard from './components/Dashboard';
import ServerControl from './components/ServerControl';
import SessionView from './components/SessionView';
import TaskDistribution from './components/TaskDistribution';
import { Projects } from './components/Projects';
import Sidebar from './components/Sidebar';
import ModeToggle, { type ServerMode } from './components/ModeToggle';
import Terminal from './components/Terminal';
import { opencodeSDKService } from './services/OpenCodeSDKService';
import type { OpenCodeServer, OrchestratorSession } from './types';

type View = 'dashboard' | 'servers' | 'sessions' | 'tasks' | 'projects';

interface TerminalTab {
  id: string;
  serverId?: string;
  sessionId?: string;
  title: string;
}

function App() {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [servers, setServers] = useState<OpenCodeServer[]>([]);
  const [sessions, setSessions] = useState<OrchestratorSession[]>([]);
  // Default to SDK mode since we're only using that now
  const [serverMode] = useState<ServerMode>('sdk');
  const [terminalTabs, setTerminalTabs] = useState<TerminalTab[]>([]);
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null);
  const [showTerminal, setShowTerminal] = useState(false);

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


  // Make loadSessions available globally
  useEffect(() => {
    (window as any).loadSessions = loadSessions;
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

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard servers={servers} sessions={sessions} />;
      case 'projects':
        return <Projects />;
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
      default:
        return <Dashboard servers={servers} sessions={sessions} />;
    }
  };

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar currentView={currentView} onViewChange={setCurrentView} />
      <main className="flex-1 flex flex-col overflow-hidden">
        <div className={`${showTerminal ? 'h-1/2' : 'flex-1'} flex flex-col`}>
          {(currentView === 'servers' || currentView === 'projects') ? (
            // For servers view, use full height without container
            <div className="h-full flex flex-col">
              <div className="px-6 py-8">
                <h1 className="text-3xl font-bold text-gray-800 dark:text-white">
                  Ninja Squad
                </h1>
              </div>
              <div className="flex-1 overflow-hidden">
                {renderView()}
              </div>
            </div>
          ) : (
            // For other views, use the original container layout
            <div className="overflow-y-auto">
              <div className="container mx-auto px-6 py-8">
                <div className="mb-8">
                  <h1 className="text-3xl font-bold text-gray-800 dark:text-white">
                    Ninja Squad
                  </h1>
                </div>
                {renderView()}
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
  );
}

export default App;