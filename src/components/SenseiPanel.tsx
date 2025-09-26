import React, { useEffect, useState } from 'react';
import { Brain, Send, Trash2, Settings, Zap, ZapOff } from 'lucide-react';
import { senseiService, type SenseiRecommendation } from '../services/SenseiService';

interface SenseiPanelProps {
  serverId: string;
  sessionId: string;
  onExecuteCommand?: (command: string) => void;
  onOpenSettings?: () => void;
}

export const SenseiPanel: React.FC<SenseiPanelProps> = ({
  serverId,
  sessionId,
  onExecuteCommand,
  onOpenSettings
}) => {
  const [recommendations, setRecommendations] = useState<SenseiRecommendation[]>([]);
  const [isEnabled, setIsEnabled] = useState(false);
  const [autoExecute, setAutoExecute] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  useEffect(() => {
    // Initialize session if it doesn't exist
    let session = senseiService.getSession(serverId, sessionId);
    if (!session) {
      session = senseiService.initializeSession(serverId, sessionId);
    }

    setIsEnabled(session.config.enabled);
    setAutoExecute(session.config.autoExecute);
    setRecommendations(session.recommendations);

    // Listen for new recommendations
    const handleRecommendation = (event: CustomEvent) => {
      if (event.detail.serverId === serverId && event.detail.sessionId === sessionId) {
        setRecommendations(prev => [...prev, event.detail.recommendation]);
        setIsAnalyzing(false);
      }
    };

    // Listen for execution requests
    const handleExecute = (event: CustomEvent) => {
      if (event.detail.serverId === serverId && event.detail.sessionId === sessionId) {
        if (onExecuteCommand) {
          onExecuteCommand(event.detail.command);
        }
      }
    };

    window.addEventListener('sensei-recommendation', handleRecommendation as EventListener);
    window.addEventListener('sensei-execute', handleExecute as EventListener);

    return () => {
      window.removeEventListener('sensei-recommendation', handleRecommendation as EventListener);
      window.removeEventListener('sensei-execute', handleExecute as EventListener);
    };
  }, [serverId, sessionId]);

  const toggleSensei = () => {
    const newEnabled = !isEnabled;
    senseiService.toggleSensei(serverId, sessionId, newEnabled);
    setIsEnabled(newEnabled);
    if (newEnabled) {
      setIsAnalyzing(true);
    }
  };

  const toggleAutoExecute = () => {
    const newAutoExecute = !autoExecute;
    senseiService.updateConfig(serverId, sessionId, { autoExecute: newAutoExecute });
    setAutoExecute(newAutoExecute);
  };

  const executeRecommendation = (recommendationId: string) => {
    senseiService.executeRecommendation(serverId, sessionId, recommendationId);
  };

  const clearRecommendations = () => {
    senseiService.clearRecommendations(serverId, sessionId);
    setRecommendations([]);
  };

  return (
    <div className="flex flex-col h-full bg-gray-800 border-l border-gray-700">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <Brain className={`h-5 w-5 ${isEnabled ? 'text-blue-400' : 'text-gray-500'}`} />
          <span className="font-medium text-gray-200">Sensei AI Assistant</span>
          {isAnalyzing && (
            <div className="ml-2 flex items-center gap-1">
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
              <span className="text-xs text-gray-400">Analyzing...</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleAutoExecute}
            className={`p-1.5 rounded transition-colors ${
              autoExecute
                ? 'bg-yellow-600/20 text-yellow-400 hover:bg-yellow-600/30'
                : 'text-gray-500 hover:text-gray-300 hover:bg-gray-700'
            }`}
            title={autoExecute ? 'Auto-execute enabled' : 'Auto-execute disabled'}
          >
            {autoExecute ? <Zap className="h-4 w-4" /> : <ZapOff className="h-4 w-4" />}
          </button>
          <button
            onClick={onOpenSettings}
            className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded transition-colors"
            title="Settings"
          >
            <Settings className="h-4 w-4" />
          </button>
          <button
            onClick={clearRecommendations}
            className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded transition-colors"
            title="Clear recommendations"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <button
            onClick={toggleSensei}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
              isEnabled
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {isEnabled ? 'Enabled' : 'Disabled'}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {!isEnabled ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Brain className="h-12 w-12 text-gray-600 mb-3" />
            <p className="text-gray-400 mb-4">
              Sensei is disabled
            </p>
            <p className="text-sm text-gray-500 mb-4 max-w-xs">
              Enable Sensei to get AI-powered recommendations based on your terminal output
            </p>
            <button
              onClick={toggleSensei}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            >
              Enable Sensei
            </button>
          </div>
        ) : recommendations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Brain className="h-12 w-12 text-gray-600 mb-3 animate-pulse" />
            <p className="text-gray-400">
              Waiting for terminal output...
            </p>
            <p className="text-sm text-gray-500 mt-2">
              Sensei will analyze your session and provide recommendations
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {recommendations.map((rec) => (
              <div
                key={rec.id}
                className="bg-gray-700/50 rounded-lg p-3 border border-gray-600 hover:border-gray-500 transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        rec.confidence > 0.7 ? 'bg-green-400' :
                        rec.confidence > 0.4 ? 'bg-yellow-400' :
                        'bg-orange-400'
                      }`}
                      title={`Confidence: ${(rec.confidence * 100).toFixed(0)}%`}
                    />
                    <span className="text-xs text-gray-400">
                      {rec.timestamp.toLocaleTimeString()}
                    </span>
                    {rec.executed && (
                      <span className="text-xs bg-green-600/20 text-green-400 px-2 py-0.5 rounded">
                        Executed
                      </span>
                    )}
                  </div>
                </div>

                <p className="text-sm text-gray-200 mb-2">
                  {rec.recommendation}
                </p>

                {rec.command && (
                  <div className="mt-2 p-2 bg-gray-900/50 rounded border border-gray-600">
                    <div className="flex items-center justify-between">
                      <code className="text-xs text-blue-300 font-mono flex-1">
                        {rec.command}
                      </code>
                      {!rec.executed && (
                        <button
                          onClick={() => executeRecommendation(rec.id)}
                          className="ml-2 p-1.5 text-blue-400 hover:text-blue-300 hover:bg-blue-600/20 rounded transition-colors"
                          title="Execute command"
                        >
                          <Send className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <div className="mt-2 flex items-center gap-4">
                  <span className="text-xs text-gray-500">
                    Confidence: {(rec.confidence * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Status bar */}
      {isEnabled && (
        <div className="px-4 py-2 border-t border-gray-700 bg-gray-900/50">
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>
              {recommendations.length} recommendation{recommendations.length !== 1 ? 's' : ''}
            </span>
            {autoExecute && (
              <span className="flex items-center gap-1 text-yellow-400">
                <Zap className="h-3 w-3" />
                Auto-execute active
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SenseiPanel;