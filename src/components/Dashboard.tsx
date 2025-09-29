import React from 'react';
import { Server, Cpu, CheckCircle, XCircle, Activity, Zap, Database, Wifi, Bot } from 'lucide-react';
import ClaudeIcon from './icons/ClaudeIcon';
import type { OpenCodeServer, OrchestratorSession } from '../types';

interface DashboardProps {
  servers: OpenCodeServer[];
  sessions: OrchestratorSession[];
}

const Dashboard: React.FC<DashboardProps> = ({ servers, sessions }) => {
  const runningServers = servers.filter(s => s.status === 'Running').length;
  const activeSessions = sessions.filter(s => s.status === 'Working').length;
  const idleSessions = sessions.filter(s => s.status === 'Idle').length;
  const completedSessions = sessions.filter(s => s.status === 'Completed').length;

  const stats = [
    {
      label: 'Total Servers',
      value: servers.length,
      icon: '🖥️',
      bgColor: 'bg-blue-300',
      borderColor: 'border-blue-600',
      iconBg: 'bg-blue-100',
    },
    {
      label: 'Running',
      value: runningServers,
      icon: '🟢',
      bgColor: 'bg-green-300',
      borderColor: 'border-green-600',
      iconBg: 'bg-green-100',
    },
    {
      label: 'Active Sessions',
      value: activeSessions,
      icon: '⚡',
      bgColor: 'bg-yellow-300',
      borderColor: 'border-yellow-600',
      iconBg: 'bg-yellow-100',
    },
    {
      label: 'Completed',
      value: completedSessions,
      icon: '✅',
      bgColor: 'bg-purple-300',
      borderColor: 'border-purple-600',
      iconBg: 'bg-purple-100',
    },
  ];

  return (
    <div className="p-6 bg-stone-50 min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-white border-4 border-black rounded-lg shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <Activity className="w-8 h-8 text-purple-600" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 font-mono">Dashboard</h1>
            <p className="text-sm text-gray-600">System Overview & Metrics</p>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className={`${stat.bgColor} border-4 border-black rounded-lg p-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] hover:translate-x-1 hover:translate-y-1 hover:shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition-all`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-black uppercase tracking-wider">{stat.label}</p>
                <p className="text-4xl font-black mt-2 text-black">{stat.value}</p>
              </div>
              <div className={`p-4 ${stat.iconBg} border-2 border-black rounded shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]`}>
                <span className="text-3xl">{stat.icon}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Server Status */}
        <div className="bg-white border-4 border-black rounded-lg shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
          <div className="p-4 bg-gradient-to-r from-cyan-100 to-blue-100 border-b-4 border-black">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white border-2 border-black rounded shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                <Server className="w-5 h-5 text-blue-600" />
              </div>
              <h3 className="text-lg font-black text-black uppercase">Server Status</h3>
            </div>
          </div>
          <div className="p-4">
            <div className="space-y-3">
              {servers.slice(0, 5).map((server) => (
                <div key={server.id} className="flex items-center justify-between p-3 bg-stone-50 border-2 border-black rounded hover:bg-stone-100 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="p-1.5 bg-white border-2 border-black rounded">
                      <Wifi className="w-4 h-4 text-gray-700" />
                    </div>
                    <div>
                      <p className="font-bold text-sm">{server.id}</p>
                      <p className="text-xs font-mono text-gray-600">
                        {server.host}:{server.port}
                      </p>
                    </div>
                  </div>
                  <span className={`px-3 py-1.5 border-2 border-black rounded font-bold text-xs uppercase shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] ${
                    server.status === 'Running'
                      ? 'bg-green-300 text-black'
                      : server.status === 'Stopped'
                      ? 'bg-gray-300 text-black'
                      : 'bg-red-300 text-black'
                  }`}>
                    {typeof server.status === 'string' ? server.status : 'Error'}
                  </span>
                </div>
              ))}
              {servers.length === 0 && (
                <div className="text-center py-8">
                  <div className="inline-block p-4 bg-gray-100 border-2 border-black rounded-lg mb-3">
                    <Server className="w-12 h-12 text-gray-400 mx-auto" />
                  </div>
                  <p className="text-gray-600 font-bold">No servers running</p>
                  <p className="text-xs text-gray-500 mt-1">Start a server to see it here</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Session Activity */}
        <div className="bg-white border-4 border-black rounded-lg shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
          <div className="p-4 bg-gradient-to-r from-purple-100 to-pink-100 border-b-4 border-black">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white border-2 border-black rounded shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                <Zap className="w-5 h-5 text-purple-600" />
              </div>
              <h3 className="text-lg font-black text-black uppercase">Session Activity</h3>
            </div>
          </div>
          <div className="p-4">
            <div className="space-y-3">
              {sessions.slice(0, 5).map((session) => (
                <div key={session.id} className="flex items-center justify-between p-3 bg-stone-50 border-2 border-black rounded hover:bg-stone-100 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="p-1.5 bg-white border-2 border-black rounded">
                      <Cpu className="w-4 h-4 text-gray-700" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm truncate">{session.id}</p>
                      {session.task && (
                        <p className="text-xs text-gray-600 truncate max-w-[200px]">
                          {session.task.prompt}
                        </p>
                      )}
                    </div>
                  </div>
                  <span className={`px-3 py-1.5 border-2 border-black rounded font-bold text-xs uppercase shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] ${
                    session.status === 'Working'
                      ? 'bg-yellow-300 text-black animate-pulse'
                      : session.status === 'Idle'
                      ? 'bg-gray-300 text-black'
                      : session.status === 'Completed'
                      ? 'bg-green-300 text-black'
                      : 'bg-red-300 text-black'
                  }`}>
                    {typeof session.status === 'string' ? session.status : 'Failed'}
                  </span>
                </div>
              ))}
              {sessions.length === 0 && (
                <div className="text-center py-8">
                  <div className="inline-block p-4 bg-gray-100 border-2 border-black rounded-lg mb-3">
                    <Cpu className="w-12 h-12 text-gray-400 mx-auto" />
                  </div>
                  <p className="text-gray-600 font-bold">No active sessions</p>
                  <p className="text-xs text-gray-500 mt-1">Sessions will appear here when created</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Claude Code Status */}
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* System Health */}
        <div className="bg-gradient-to-r from-yellow-100 to-orange-100 border-4 border-black rounded-lg p-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white border-2 border-black rounded shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                <Database className="w-6 h-6 text-orange-600" />
              </div>
              <div>
                <h3 className="text-lg font-black text-black uppercase">System Health</h3>
                <p className="text-sm text-gray-700">
                  {runningServers > 0
                    ? `${runningServers} server${runningServers > 1 ? 's' : ''} operational`
                    : 'No servers running'}
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="text-center">
                <div className="text-2xl font-black text-black">{idleSessions}</div>
                <div className="text-xs font-bold text-gray-600 uppercase">Idle</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-black text-green-600">{activeSessions}</div>
                <div className="text-xs font-bold text-gray-600 uppercase">Active</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-black text-purple-600">{completedSessions}</div>
                <div className="text-xs font-bold text-gray-600 uppercase">Done</div>
              </div>
            </div>
          </div>
        </div>

        {/* Claude Code Integration */}
        <div className="bg-gradient-to-r from-orange-100 to-red-100 border-4 border-black rounded-lg p-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white border-2 border-black rounded shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                <ClaudeIcon className="text-orange-600" size="24" />
              </div>
              <div>
                <h3 className="text-lg font-black text-black uppercase">Claude Code</h3>
                <p className="text-sm text-gray-700">
                  AI-powered development assistant
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-gray-600" />
                <span className="text-sm font-bold text-gray-700">Ready</span>
              </div>
              <div className="p-2 bg-green-300 border-2 border-black rounded-full shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                <div className="w-3 h-3 bg-green-600 rounded-full animate-pulse" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* AI Agents Status */}
      <div className="mt-6">
        <div className="bg-white border-4 border-black rounded-lg shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
          <div className="p-4 bg-gradient-to-r from-rose-100 to-orange-100 border-b-4 border-black">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white border-2 border-black rounded shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                  <ClaudeIcon className="text-orange-700" size="20" />
                </div>
                <h3 className="text-lg font-black text-black uppercase">AI Agents</h3>
              </div>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full" />
                  <span className="text-xs font-bold uppercase">Claude Code Active</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-blue-500 rounded-full" />
                  <span className="text-xs font-bold uppercase">OpenCode Ready</span>
                </div>
              </div>
            </div>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-orange-50 border-2 border-black rounded hover:bg-orange-100 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <ClaudeIcon className="text-orange-600" size="32" />
                  <span className="px-2 py-1 bg-green-300 border border-black rounded text-xs font-bold uppercase">Online</span>
                </div>
                <h4 className="font-bold text-sm mb-1">Claude Code</h4>
                <p className="text-xs text-gray-600">Advanced AI coding assistant</p>
              </div>
              <div className="p-4 bg-blue-50 border-2 border-black rounded hover:bg-blue-100 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-3xl">🤖</span>
                  <span className="px-2 py-1 bg-blue-300 border border-black rounded text-xs font-bold uppercase">Ready</span>
                </div>
                <h4 className="font-bold text-sm mb-1">OpenCode</h4>
                <p className="text-xs text-gray-600">Open source coding agent</p>
              </div>
              <div className="p-4 bg-purple-50 border-2 border-black rounded hover:bg-purple-100 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-3xl">🧠</span>
                  <span className="px-2 py-1 bg-gray-300 border border-black rounded text-xs font-bold uppercase">Config</span>
                </div>
                <h4 className="font-bold text-sm mb-1">Custom Agent</h4>
                <p className="text-xs text-gray-600">Configure your own agent</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;