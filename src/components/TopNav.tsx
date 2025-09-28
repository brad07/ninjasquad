import React from 'react';
import clsx from 'clsx';
import {
  HomeIcon,
  ServerIcon,
  RectangleGroupIcon,
  QueueListIcon,
  BeakerIcon,
  CommandLineIcon,
} from '@heroicons/react/24/outline';

export type MainView = 'dashboard' | 'servers' | 'sessions' | 'tasks' | 'distributed-test' | 'sdk-test' | 'projects' | 'tmux-lab';

interface TopNavProps {
  currentView: MainView;
  onViewChange: (view: MainView) => void;
}

const TopNav: React.FC<TopNavProps> = ({ currentView, onViewChange }) => {
  const tabs = [
    { id: 'dashboard' as MainView, label: 'Dashboard', icon: HomeIcon },
    { id: 'servers' as MainView, label: 'Servers', icon: ServerIcon },
    { id: 'sessions' as MainView, label: 'Sessions', icon: RectangleGroupIcon },
    { id: 'tasks' as MainView, label: 'Tasks', icon: QueueListIcon },
    { id: 'distributed-test' as MainView, label: 'Test Mode', icon: BeakerIcon },
    { id: 'sdk-test' as MainView, label: 'SDK Test', icon: CommandLineIcon },
    { id: 'tmux-lab' as MainView, label: 'Tmux Lab', icon: BeakerIcon },
  ];

  return (
    <div className="bg-gray-900 border-b border-gray-800">
      <div className="flex items-center justify-between px-6 py-3">
        <h1 className="text-xl font-bold text-white">Ninja Squad</h1>
        <nav className="flex space-x-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => onViewChange(tab.id)}
                className={clsx(
                  'flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors text-sm font-medium',
                  currentView === tab.id
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
};

export default TopNav;