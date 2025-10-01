import React from 'react';
import clsx from 'clsx';
import {
  HomeIcon,
  ServerIcon,
  RectangleGroupIcon,
  QueueListIcon,
  FolderIcon,
  KeyIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/solid';
import senseiLogo from '../assets/sensei_logo.png';

export type MainView = 'dashboard' | 'servers' | 'sessions' | 'tasks' | 'projects' | 'admin' | 'linear';

interface TopNavProps {
  currentView: MainView;
  onViewChange: (view: MainView) => void;
}

const TopNav: React.FC<TopNavProps> = ({ currentView, onViewChange }) => {
  const tabs = [
    { id: 'dashboard' as MainView, label: 'Dashboard', icon: HomeIcon },
    { id: 'projects' as MainView, label: 'Projects', icon: FolderIcon },
    { id: 'linear' as MainView, label: 'Issues', icon: CheckCircleIcon },
    { id: 'admin' as MainView, label: 'Admin', icon: KeyIcon },
  ];

  return (
    <div className="bg-white border-b-4 border-black">
      <div className="grid grid-cols-3 items-center px-6 py-4 bg-gradient-to-r from-yellow-100 via-orange-50 to-pink-100">
        <div className="flex items-center gap-3">
          <img src={senseiLogo} alt="SensAI" className="h-12 w-auto" />
          <h1 className="text-2xl font-black text-black">SensAI</h1>
        </div>
        <nav className="flex justify-center space-x-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => onViewChange(tab.id)}
                className={clsx(
                  'flex items-center space-x-2 px-4 py-2 transition-all text-sm font-bold border-2 rounded',
                  currentView === tab.id
                    ? 'bg-purple-300 text-black border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]'
                    : 'bg-white text-gray-700 border-transparent hover:border-black hover:text-black hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:bg-purple-50'
                )}
              >
                <Icon className="h-4 w-4" strokeWidth={2.5} />
                <span className="uppercase tracking-wider text-xs">{tab.label}</span>
              </button>
            );
          })}
        </nav>
        <div></div> {/* Empty third column for grid balance */}
      </div>
    </div>
  );
};

export default TopNav;