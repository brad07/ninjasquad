import React, { useState, useEffect } from 'react';
import { Server, Cpu, CheckCircle, XCircle, Activity, Zap, Database, Wifi, Bot, MessageSquare } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import ClaudeIcon from './icons/ClaudeIcon';
import type { OpenCodeServer, OrchestratorSession } from '../types';
import { apiKeyService } from '../services/ApiKeyService';

interface DashboardProps {
  servers: OpenCodeServer[];
  sessions: OrchestratorSession[];
}

interface SlackStatus {
  initialized: boolean;
  service_running: boolean;
  port?: number;
  connected_channels?: number;
}

interface ClaudeAgentStatus {
  configured: boolean;
  sessions?: number;
}

const Dashboard: React.FC<DashboardProps> = ({ servers, sessions }) => {
  const [slackStatus, setSlackStatus] = useState<SlackStatus>({ initialized: false, service_running: false });
  const [claudeAgentStatus, setClaudeAgentStatus] = useState<ClaudeAgentStatus>({ configured: false });
  const [loadingSlack, setLoadingSlack] = useState(true);
  const [slackActionLoading, setSlackActionLoading] = useState(false);

  useEffect(() => {
    loadServiceStatuses();
    // Refresh status every 5 seconds
    const interval = setInterval(loadServiceStatuses, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadServiceStatuses = async () => {
    // Load Slack status - call service directly instead of through Rust
    try {
      const response = await fetch('http://localhost:3456/status');
      if (response.ok) {
        const status = await response.json();
        setSlackStatus({
          initialized: status.initialized || false,
          service_running: status.service_running || false,
          port: status.port || 3456,
          connected_channels: status.connected_channels || 0
        });
      } else {
        setSlackStatus({ initialized: false, service_running: false });
      }
    } catch (error) {
      // Slack service not running - this is expected if not configured
      setSlackStatus({ initialized: false, service_running: false });
    } finally {
      setLoadingSlack(false);
    }

    // Claude Agent status - check if API key is configured
    const apiKey = apiKeyService.getKey('anthropic');
    setClaudeAgentStatus({
      configured: !!apiKey,
      sessions: 0 // Would need to track this if needed
    });
  };

  const handleStartSlack = async () => {
    setSlackActionLoading(true);
    try {
      await invoke('start_slack_service');
      // Wait a bit for service to start
      await new Promise(resolve => setTimeout(resolve, 1000));
      await loadServiceStatuses();
    } catch (error) {
      console.error('Failed to start Slack service:', error);
      alert('Failed to start Slack service: ' + (error as any).toString());
    } finally {
      setSlackActionLoading(false);
    }
  };

  const handleStopSlack = async () => {
    setSlackActionLoading(true);
    try {
      await invoke('stop_slack_service');
      // Wait a bit for service to stop
      await new Promise(resolve => setTimeout(resolve, 500));
      await loadServiceStatuses();
    } catch (error) {
      console.error('Failed to stop Slack service:', error);
      alert('Failed to stop Slack service: ' + (error as any).toString());
    } finally {
      setSlackActionLoading(false);
    }
  };
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

      {/* Services Status */}
      <div className="mt-6">
        <div className="bg-white border-4 border-black rounded-lg shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
          <div className="p-4 bg-gradient-to-r from-rose-100 to-orange-100 border-b-4 border-black">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white border-2 border-black rounded shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                <Activity className="text-orange-700 w-5 h-5" />
              </div>
              <h3 className="text-lg font-black text-black uppercase">Services</h3>
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
                  <Bot className="w-8 h-8 text-blue-600" />
                  {claudeAgentStatus.configured ? (
                    <span className="px-2 py-1 bg-green-300 border border-black rounded text-xs font-bold uppercase">Ready</span>
                  ) : (
                    <span className="px-2 py-1 bg-yellow-300 border border-black rounded text-xs font-bold uppercase">Need API Key</span>
                  )}
                </div>
                <h4 className="font-bold text-sm mb-1">Claude Agent</h4>
                <p className="text-xs text-gray-600">
                  {claudeAgentStatus.configured
                    ? 'Direct SDK integration • API key configured'
                    : 'Configure API key in plugin settings'
                  }
                </p>
              </div>
              <div className="p-4 bg-purple-50 border-2 border-black rounded hover:bg-purple-100 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <MessageSquare className="w-8 h-8 text-purple-600" />
                  {loadingSlack ? (
                    <span className="px-2 py-1 bg-gray-300 border border-black rounded text-xs font-bold uppercase">Loading...</span>
                  ) : slackStatus.service_running && slackStatus.initialized ? (
                    <span className="px-2 py-1 bg-green-300 border border-black rounded text-xs font-bold uppercase">Connected</span>
                  ) : slackStatus.service_running ? (
                    <span className="px-2 py-1 bg-yellow-300 border border-black rounded text-xs font-bold uppercase">Not Configured</span>
                  ) : (
                    <span className="px-2 py-1 bg-gray-300 border border-black rounded text-xs font-bold uppercase">Offline</span>
                  )}
                </div>
                <h4 className="font-bold text-sm mb-1">Slack Service</h4>
                <p className="text-xs text-gray-600 mb-3">
                  {slackStatus.service_running && slackStatus.initialized
                    ? `Port ${slackStatus.port || 3456} • ${slackStatus.connected_channels || 0} channels`
                    : slackStatus.service_running
                    ? 'Service running - configure in Admin → Notifications'
                    : 'Approval and notification service'
                  }
                </p>
                <div className="flex gap-2">
                  {slackStatus.service_running ? (
                    <button
                      onClick={handleStopSlack}
                      disabled={slackActionLoading}
                      className="flex-1 px-3 py-1 bg-red-500 hover:bg-red-600 disabled:bg-gray-300 text-white text-xs font-bold border-2 border-black rounded transition-colors disabled:cursor-not-allowed"
                    >
                      {slackActionLoading ? 'STOPPING...' : 'STOP'}
                    </button>
                  ) : (
                    <button
                      onClick={handleStartSlack}
                      disabled={slackActionLoading}
                      className="flex-1 px-3 py-1 bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white text-xs font-bold border-2 border-black rounded transition-colors disabled:cursor-not-allowed"
                    >
                      {slackActionLoading ? 'STARTING...' : 'START'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;