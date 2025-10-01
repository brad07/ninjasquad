import React from 'react';
import { Brain, Trash2, Settings, Zap, ZapOff, Power, MessageSquare, MessageSquareOff, Bell, BellOff, GitBranch } from 'lucide-react';
import { desktopNotificationService } from '../../services/DesktopNotificationService';
import { slackService } from '../../services/SlackService';

interface SenseiHeaderProps {
  isEnabled: boolean;
  autoApprove: boolean;
  isAnalyzing: boolean;
  slackConnected: boolean;
  desktopNotificationsEnabled: boolean;
  onToggleSensei: () => void;
  onToggleAutoApprove: () => void;
  onOpenSettings?: () => void;
  onClearRecommendations: () => void;
  onSlackToggle: (connected: boolean) => void;
  onDesktopNotificationsToggle: (enabled: boolean) => void;
  onOpenDiffViewer?: () => void;
}

export const SenseiHeader: React.FC<SenseiHeaderProps> = ({
  isEnabled,
  autoApprove,
  isAnalyzing,
  slackConnected,
  desktopNotificationsEnabled,
  onToggleSensei,
  onToggleAutoApprove,
  onOpenSettings,
  onClearRecommendations,
  onSlackToggle,
  onDesktopNotificationsToggle,
  onOpenDiffViewer
}) => {
  const handleDesktopNotificationToggle = async () => {
    console.log('Desktop notification button clicked');
    if (desktopNotificationsEnabled) {
      alert('To disable desktop notifications, go to your browser settings');
    } else {
      try {
        console.log('Requesting notification permission...');
        const granted = await desktopNotificationService.requestPermission();
        console.log('Permission granted:', granted);
        onDesktopNotificationsToggle(granted);
        if (granted) {
          console.log('Showing test notification');
          await desktopNotificationService.sendNotification(
            {
              id: 'test',
              timestamp: new Date(),
              source: 'sensei',
              input: '',
              recommendation: 'Desktop notifications are now enabled! You\'ll receive notifications here when you\'re active.',
              confidence: 1.0,
              executed: false
            },
            'Test'
          );
        }
      } catch (error) {
        console.error('Error enabling notifications:', error);
        alert('Failed to enable notifications: ' + error);
      }
    }
  };

  const handleSlackToggle = async () => {
    if (slackConnected) {
      await slackService.shutdown();
      onSlackToggle(false);
    } else {
      const success = await slackService.initialize();
      onSlackToggle(success);
    }
  };

  return (
    <div className={`flex-shrink-0 flex items-center justify-between px-4 py-3 border-b-4 border-black ${
      isAnalyzing ? 'bg-transparent' : 'bg-gradient-to-r from-violet-100 to-purple-100'
    }`}>
      <div className="flex items-center gap-2">
        <Brain className={`h-5 w-5 ${isEnabled ? 'text-purple-700' : 'text-gray-500'}`} strokeWidth={2.5} />
        <span className="font-bold text-black">SensAI Chat</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onOpenDiffViewer}
          className="p-2 bg-white text-blue-600 border-2 border-blue-400 hover:border-blue-600 hover:bg-blue-50 hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all rounded"
          title="View code changes"
        >
          <GitBranch className="h-4 w-4" />
        </button>
        <button
          onClick={handleDesktopNotificationToggle}
          className={`p-2 transition-all rounded ${
            desktopNotificationsEnabled
              ? 'bg-blue-400 text-black border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:bg-blue-500'
              : 'bg-white text-gray-600 border-2 border-gray-400 hover:border-black hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
          }`}
          title={desktopNotificationsEnabled
            ? 'Desktop notifications enabled (when active)'
            : 'Desktop notifications disabled - Click to enable'}
        >
          {desktopNotificationsEnabled ? (
            <Bell className="h-4 w-4" fill="currentColor" />
          ) : (
            <BellOff className="h-4 w-4" />
          )}
        </button>
        <button
          onClick={handleSlackToggle}
          className={`p-2 transition-all rounded ${
            slackConnected
              ? 'bg-green-400 text-black border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:bg-green-500'
              : 'bg-white text-gray-600 border-2 border-gray-400 hover:border-black hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
          }`}
          title={slackConnected
            ? 'Slack connected (when away) - Click to disconnect'
            : 'Slack disconnected - Click to reconnect'}
        >
          {slackConnected ? (
            <MessageSquare className="h-4 w-4" fill="currentColor" />
          ) : (
            <MessageSquareOff className="h-4 w-4" />
          )}
        </button>
        <button
          onClick={onToggleAutoApprove}
          className={`p-2 transition-all rounded ${
            autoApprove
              ? 'bg-yellow-400 text-black border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:bg-yellow-500'
              : 'bg-white text-gray-600 border-2 border-gray-400 hover:border-black hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
          }`}
          title={autoApprove ? 'Auto-approve enabled' : 'Auto-approve disabled'}
        >
          {autoApprove ? <Zap className="h-4 w-4" /> : <ZapOff className="h-4 w-4" />}
        </button>
        <button
          onClick={onOpenSettings}
          className="p-2 bg-white text-black border-2 border-gray-400 hover:border-black hover:bg-gray-50 hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all rounded"
          title="Settings"
        >
          <Settings className="h-4 w-4" />
        </button>
        <button
          onClick={onClearRecommendations}
          className="p-2 bg-white text-red-600 border-2 border-red-400 hover:border-red-600 hover:bg-red-50 hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all rounded"
          title="Clear recommendations"
        >
          <Trash2 className="h-4 w-4" />
        </button>
        <button
          onClick={onToggleSensei}
          className={`p-2 transition-all border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] rounded ${
            isEnabled
              ? 'bg-purple-500 text-white hover:bg-purple-600'
              : 'bg-white text-gray-700 hover:bg-gray-100'
          }`}
          title={isEnabled ? 'Sensei enabled - Click to disable' : 'Sensei disabled - Click to enable'}
        >
          <Power className="h-4 w-4" strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
};