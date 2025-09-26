import React from 'react';
import { ServerIcon, CpuChipIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';
import type { OpenCodeServer, OrchestratorSession } from '../types';

interface DashboardProps {
  servers: OpenCodeServer[];
  sessions: OrchestratorSession[];
}

const Dashboard: React.FC<DashboardProps> = ({ servers, sessions }) => {
  const runningServers = servers.filter(s => s.status === 'Running').length;
  const activeSessions = sessions.filter(s => s.status === 'Working').length;
  const idleSessions = sessions.filter(s => s.status === 'Idle').length;
  // const failedSessions = sessions.filter(s => typeof s.status === 'object' && 'Failed' in s.status).length;

  const stats = [
    {
      label: 'Total Servers',
      value: servers.length,
      icon: ServerIcon,
      color: 'bg-blue-500',
    },
    {
      label: 'Running Servers',
      value: runningServers,
      icon: CheckCircleIcon,
      color: 'bg-green-500',
    },
    {
      label: 'Active Sessions',
      value: activeSessions,
      icon: CpuChipIcon,
      color: 'bg-yellow-500',
    },
    {
      label: 'Idle Sessions',
      value: idleSessions,
      icon: XCircleIcon,
      color: 'bg-gray-500',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{stat.label}</p>
                  <p className="text-2xl font-bold mt-1">{stat.value}</p>
                </div>
                <div className={`p-3 rounded-lg ${stat.color} bg-opacity-10`}>
                  <Icon className={`h-6 w-6 ${stat.color.replace('bg-', 'text-')}`} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Server Status */}
        <div className="card">
          <h3 className="text-lg font-semibold mb-4">Server Status</h3>
          <div className="space-y-2">
            {servers.slice(0, 5).map((server) => (
              <div key={server.id} className="flex items-center justify-between py-2 border-b dark:border-gray-700 last:border-0">
                <div>
                  <p className="font-medium">{server.id}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {server.host}:{server.port}
                  </p>
                </div>
                <span className={`px-2 py-1 rounded text-xs font-medium ${
                  server.status === 'Running' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                  server.status === 'Stopped' ? 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200' :
                  'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                }`}>
                  {typeof server.status === 'string' ? server.status : 'Error'}
                </span>
              </div>
            ))}
            {servers.length === 0 && (
              <p className="text-gray-500 text-center py-4">No servers running</p>
            )}
          </div>
        </div>

        {/* Session Activity */}
        <div className="card">
          <h3 className="text-lg font-semibold mb-4">Session Activity</h3>
          <div className="space-y-2">
            {sessions.slice(0, 5).map((session) => (
              <div key={session.id} className="flex items-center justify-between py-2 border-b dark:border-gray-700 last:border-0">
                <div>
                  <p className="font-medium">{session.id}</p>
                  {session.task && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 truncate max-w-xs">
                      {session.task.prompt}
                    </p>
                  )}
                </div>
                <span className={`px-2 py-1 rounded text-xs font-medium ${
                  session.status === 'Working' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                  session.status === 'Idle' ? 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200' :
                  session.status === 'Completed' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                  'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                }`}>
                  {typeof session.status === 'string' ? session.status : 'Failed'}
                </span>
              </div>
            ))}
            {sessions.length === 0 && (
              <p className="text-gray-500 text-center py-4">No active sessions</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;