import React, { useState } from 'react';
import Dashboard from './components/Dashboard';
import ServerControl from './components/ServerControl';
import SessionView from './components/SessionView';
import TaskDistribution from './components/TaskDistribution';
import Sidebar from './components/Sidebar';
import type { OpenCodeServer, OrchestratorSession } from './types';

type View = 'dashboard' | 'servers' | 'sessions' | 'tasks';

function App() {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [servers, setServers] = useState<OpenCodeServer[]>([]);
  const [sessions, setSessions] = useState<OrchestratorSession[]>([]);

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard servers={servers} sessions={sessions} />;
      case 'servers':
        return <ServerControl servers={servers} onServersUpdate={setServers} />;
      case 'sessions':
        return <SessionView sessions={sessions} onSessionsUpdate={setSessions} />;
      case 'tasks':
        return <TaskDistribution sessions={sessions} />;
      default:
        return <Dashboard servers={servers} sessions={sessions} />;
    }
  };

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar currentView={currentView} onViewChange={setCurrentView} />
      <main className="flex-1 overflow-y-auto">
        <div className="container mx-auto px-6 py-8">
          <h1 className="text-3xl font-bold text-gray-800 dark:text-white mb-8">
            OpenCode Orchestrator
          </h1>
          {renderView()}
        </div>
      </main>
    </div>
  );
}

export default App;