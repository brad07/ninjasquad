import React, { useEffect, useRef, useState } from 'react';
import { Zap, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { SenseiHeader } from './sensei/SenseiHeader';
import { SenseiRecommendationCard } from './sensei/SenseiRecommendationCard';
import { SenseiEmptyState } from './sensei/SenseiEmptyState';
import { DiffDrawer } from './sensei/DiffDrawer';
import { useSenseiSession } from '../hooks/useSenseiSession';
import { useSenseiNotifications } from '../hooks/useSenseiNotifications';
import { ollamaService } from '../services/OllamaService';
import '../styles/sensei-animations.css';

interface SenseiPanelProps {
  serverId: string;
  sessionId: string;
  workingDirectory?: string;
  onExecuteCommand?: (command: string) => void;
  onOpenSettings?: () => void;
  onPendingCountChange?: (count: number) => void;
  // Dev Server integration
  devServerLogs?: string[];
  devServerRunning?: boolean;
  devServerId?: string; // Dev server ID for Ollama analysis tracking
  onClearDevServerLogs?: () => void;
  onStopDevServer?: () => void;
}

export const SenseiPanel: React.FC<SenseiPanelProps> = ({
  serverId,
  sessionId,
  workingDirectory,
  onExecuteCommand,
  onOpenSettings,
  onPendingCountChange,
  devServerLogs = [],
  devServerRunning = false,
  devServerId,
  onClearDevServerLogs,
  onStopDevServer
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const devServerLogsEndRef = useRef<HTMLDivElement>(null);
  const [isDiffDrawerOpen, setIsDiffDrawerOpen] = useState(false);
  const [showTokenUsage, setShowTokenUsage] = useState(false);
  const [showDevServerLogs, setShowDevServerLogs] = useState(false);
  const [ollamaAnalyzing, setOllamaAnalyzing] = useState(false);

  // Custom hooks
  const {
    recommendations,
    isEnabled,
    autoApprove,
    isAnalyzing,
    newRecommendationIds,
    tokenUsage,
    toggleSensei,
    toggleAutoApprove,
    approveRecommendation,
    denyRecommendation,
    clearRecommendations,
    resetTokenUsage
  } = useSenseiSession(serverId, sessionId);

  const {
    slackConnected,
    desktopNotificationsEnabled,
    setSlackConnected,
    setDesktopNotificationsEnabled
  } = useSenseiNotifications(serverId, sessionId);

  // Track pending recommendations count
  useEffect(() => {
    const pendingCount = recommendations.filter(rec =>
      !rec.executed && rec.source === 'sensei'
    ).length;
    if (onPendingCountChange) {
      onPendingCountChange(pendingCount);
    }
  }, [recommendations, onPendingCountChange]);

  // Auto-scroll to bottom when new recommendations arrive or analyzing starts
  useEffect(() => {
    if (scrollContainerRef.current) {
      setTimeout(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
        }
      }, 100);
    }
  }, [recommendations.length, isAnalyzing]);

  // Auto-scroll dev server logs
  useEffect(() => {
    if (devServerLogsEndRef.current && showDevServerLogs) {
      devServerLogsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [devServerLogs, showDevServerLogs]);

  // Subscribe to Ollama analysis state changes
  useEffect(() => {
    if (!devServerId) return;

    const unsubscribe = ollamaService.onAnalysisStateChange(devServerId, (analyzing) => {
      setOllamaAnalyzing(analyzing);
    });

    return unsubscribe;
  }, [devServerId]);

  return (
    <div className={`flex flex-col h-full border-l-4 border-black transition-all duration-500 ${isAnalyzing ? 'sensei-analyzing-bg' : 'bg-white'}`}>
      <SenseiHeader
        isEnabled={isEnabled}
        autoApprove={autoApprove}
        isAnalyzing={isAnalyzing}
        slackConnected={slackConnected}
        desktopNotificationsEnabled={desktopNotificationsEnabled}
        onToggleSensei={toggleSensei}
        onToggleAutoApprove={toggleAutoApprove}
        onOpenSettings={onOpenSettings}
        onClearRecommendations={clearRecommendations}
        onSlackToggle={setSlackConnected}
        onDesktopNotificationsToggle={setDesktopNotificationsEnabled}
        onOpenDiffViewer={() => setIsDiffDrawerOpen(true)}
      />

      {/* Content */}
      <div
        ref={scrollContainerRef}
        className={`flex-1 overflow-y-auto p-4 min-h-0 ${
          isAnalyzing ? 'bg-transparent' : 'bg-gradient-to-b from-gray-50 to-white'
        }`}
      >
        {!isEnabled ? (
          <SenseiEmptyState type="disabled" onEnable={toggleSensei} />
        ) : recommendations.length === 0 && !isAnalyzing ? (
          <SenseiEmptyState type="waiting" />
        ) : (
          <div className="space-y-3">
            {recommendations.map((rec) => (
              <SenseiRecommendationCard
                key={rec.id}
                recommendation={rec}
                isNew={newRecommendationIds.has(rec.id)}
                onApprove={approveRecommendation}
                onDeny={denyRecommendation}
              />
            ))}

            {/* Show analyzing indicator when processing */}
            {isAnalyzing && <SenseiEmptyState type="analyzing" />}
          </div>
        )}
      </div>

      {/* Token Usage Panel */}
      <div className="border-t-4 border-black bg-gray-800">
        <div
          className="px-3 py-1 bg-gradient-to-r from-green-600 to-green-700 border-b-2 border-black flex items-center justify-between cursor-pointer hover:from-green-500 hover:to-green-600"
          onClick={() => setShowTokenUsage(!showTokenUsage)}
        >
          <div className="flex items-center space-x-2">
            {showTokenUsage ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span className="text-xs font-mono font-bold text-white">TOKEN USAGE</span>
            <span className="text-xs font-mono text-green-200">
              ({tokenUsage.requestCount} reqs · {tokenUsage.promptTokens.toLocaleString()} in · {tokenUsage.completionTokens.toLocaleString()} out)
            </span>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              resetTokenUsage();
            }}
            className="text-xs font-mono text-white hover:text-red-300 px-2 py-0.5 border border-white/30 rounded"
          >
            RESET
          </button>
        </div>

        {showTokenUsage && (
          <div className="bg-black/95 p-3 font-mono text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-gray-900 p-2 rounded border border-blue-500/30">
                <div className="text-blue-400 font-bold mb-1">PROMPT TOKENS</div>
                <div className="text-white text-lg">{tokenUsage.promptTokens.toLocaleString()}</div>
              </div>
              <div className="bg-gray-900 p-2 rounded border border-green-500/30">
                <div className="text-green-400 font-bold mb-1">COMPLETION TOKENS</div>
                <div className="text-white text-lg">{tokenUsage.completionTokens.toLocaleString()}</div>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-gray-700">
              <div className="flex justify-between text-gray-400">
                <span>Total Tokens:</span>
                <span className="text-white font-bold">
                  {tokenUsage.totalTokens.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between text-gray-400 mt-1">
                <span>Requests:</span>
                <span className="text-white font-bold">
                  {tokenUsage.requestCount}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Dev Server Logs Panel */}
      {devServerLogs.length > 0 && (
        <div className="border-t-4 border-black bg-gray-800">
          <div
            className="px-3 py-1 bg-gradient-to-r from-blue-600 to-blue-700 border-b-2 border-black flex items-center justify-between cursor-pointer hover:from-blue-500 hover:to-blue-600"
            onClick={() => setShowDevServerLogs(!showDevServerLogs)}
          >
            <div className="flex items-center space-x-2">
              {showDevServerLogs ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <span className="text-xs font-mono font-bold text-white">DEV SERVER LOGS</span>
              {ollamaAnalyzing && (
                <Loader2 className="w-3 h-3 text-yellow-300 animate-spin" />
              )}
              <span className="text-xs font-mono text-blue-200">
                ({devServerLogs.length} lines{devServerRunning ? ' • Running' : ''}{ollamaAnalyzing ? ' • AI Analyzing...' : ''})
              </span>
            </div>
            <div className="flex gap-2">
              {devServerRunning && onStopDevServer && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onStopDevServer();
                  }}
                  className="text-xs font-mono text-white hover:text-red-300 px-2 py-0.5 border border-white/30 rounded"
                >
                  STOP
                </button>
              )}
              {onClearDevServerLogs && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onClearDevServerLogs();
                  }}
                  className="text-xs font-mono text-white hover:text-red-300 px-2 py-0.5 border border-white/30 rounded"
                >
                  CLEAR
                </button>
              )}
            </div>
          </div>

          {showDevServerLogs && (
            <div className="bg-black/95 p-3 font-mono text-xs max-h-64 overflow-y-auto">
              {devServerLogs.length === 0 ? (
                <div className="text-gray-500">No logs yet...</div>
              ) : (
                devServerLogs.map((log, i) => (
                  <div key={i} className="text-gray-300 whitespace-pre-wrap break-words">
                    {log}
                  </div>
                ))
              )}
              <div ref={devServerLogsEndRef} />
            </div>
          )}
        </div>
      )}

      {/* Status bar */}
      {isEnabled && (
        <div className={`flex-shrink-0 px-4 py-2 border-t-4 border-black ${
          isAnalyzing ? 'bg-transparent' : 'bg-gradient-to-r from-violet-50 to-purple-50'
        }`}>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-800 font-bold">
              {recommendations.length} recommendation{recommendations.length !== 1 ? 's' : ''}
            </span>
            {autoApprove && (
              <span className="flex items-center gap-1 bg-yellow-100 px-2 py-0.5 rounded-full border border-yellow-600 text-yellow-800 font-bold">
                <Zap className="h-3 w-3" strokeWidth={2} />
                Auto-approve active
              </span>
            )}
          </div>
        </div>
      )}

      {/* Diff Drawer */}
      <DiffDrawer
        isOpen={isDiffDrawerOpen}
        onClose={() => setIsDiffDrawerOpen(false)}
        workingDirectory={workingDirectory || process.cwd()}
      />
    </div>
  );
};

export default SenseiPanel;