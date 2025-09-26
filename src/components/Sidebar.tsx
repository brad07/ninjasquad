import React from 'react';
import {
  HomeIcon,
  ServerIcon,
  RectangleGroupIcon,
  QueueListIcon,
} from '@heroicons/react/24/outline';
import clsx from 'clsx';

type View = 'dashboard' | 'servers' | 'sessions' | 'tasks';

interface SidebarProps {
  currentView: View;
  onViewChange: (view: View) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentView, onViewChange }) => {
  const menuItems = [
    { id: 'dashboard' as View, label: 'Dashboard', icon: HomeIcon },
    { id: 'servers' as View, label: 'Servers', icon: ServerIcon },
    { id: 'sessions' as View, label: 'Sessions', icon: RectangleGroupIcon },
    { id: 'tasks' as View, label: 'Tasks', icon: QueueListIcon },
  ];

  return (
    <aside className="bg-gray-800 text-white w-64 min-h-screen p-4">
      <nav className="space-y-2">
        {menuItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={clsx(
                'w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors',
                currentView === item.id
                  ? 'bg-blue-600 text-white'
                  : 'hover:bg-gray-700 text-gray-300'
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="text-sm font-medium">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
};

export default Sidebar;