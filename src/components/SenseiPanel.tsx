import React, { useEffect, useState } from 'react';
import { Brain, Trash2, Settings, Zap, ZapOff, ChevronDown, ChevronUp, Loader2, Power } from 'lucide-react';
import { senseiService, type SenseiRecommendation } from '../services/SenseiService';
import { slackService } from '../services/SlackService';
import { emit } from '@tauri-apps/api/event';
import '../styles/sensei-animations.css';

interface SenseiPanelProps {
  serverId: string;
  sessionId: string;
  onExecuteCommand?: (command: string) => void;
  onOpenSettings?: () => void;
  onPendingCountChange?: (count: number) => void;
}

export const SenseiPanel: React.FC<SenseiPanelProps> = ({
  serverId,
  sessionId,
  onExecuteCommand,
  onOpenSettings,
  onPendingCountChange
}) => {
  const [recommendations, setRecommendations] = useState<SenseiRecommendation[]>([]);
  const [isEnabled, setIsEnabled] = useState(true);  // Enabled by default
  const [autoExecute, setAutoExecute] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [expandedRecommendations, setExpandedRecommendations] = useState<Set<string>>(new Set());

  // Track pending recommendations count
  useEffect(() => {
    const pendingCount = recommendations.filter(rec => !rec.executed).length;
    if (onPendingCountChange) {
      onPendingCountChange(pendingCount);
    }
  }, [recommendations, onPendingCountChange]);

  // Note: Agent responses are now directly added as Sensei recommendations
  // via senseiService.addAgentRecommendation() to avoid redundant API calls

  useEffect(() => {
    // Initialize session if it doesn't exist
    const effectiveServerId = serverId || 'agent';
    const effectiveSessionId = sessionId || 'default';

    let session = senseiService.getSession(effectiveServerId, effectiveSessionId);
    if (!session) {
      session = senseiService.initializeSession(effectiveServerId, effectiveSessionId);
      // Enable by default for new sessions
      senseiService.toggleSensei(effectiveServerId, effectiveSessionId, true);
    }

    // Use default enabled state (true) if session doesn't specify
    setIsEnabled(session.config.enabled !== false);  // Default to true
    setAutoExecute(session.config.autoExecute);

    // Load existing recommendations, but filter out any duplicates
    const uniqueRecommendations = session.recommendations.filter((rec, index, self) =>
      index === self.findIndex(r => r.id === rec.id)
    );
    setRecommendations(uniqueRecommendations);

    // Listen for new recommendations
    const handleRecommendation = async (event: CustomEvent) => {
      console.log('SenseiPanel received recommendation event:', {
        eventServerId: event.detail.serverId,
        eventSessionId: event.detail.sessionId,
        effectiveServerId,
        effectiveSessionId,
        serverId,
        sessionId,
        match: (event.detail.serverId === effectiveServerId || event.detail.serverId === serverId) &&
               (event.detail.sessionId === effectiveSessionId || event.detail.sessionId === sessionId)
      });

      if ((event.detail.serverId === effectiveServerId || event.detail.serverId === serverId) &&
          (event.detail.sessionId === effectiveSessionId || event.detail.sessionId === sessionId)) {
        // Instead of adding the recommendation directly, reload from the session
        // since SenseiService already adds it to the session
        const updatedSession = senseiService.getSession(effectiveServerId, effectiveSessionId);
        if (updatedSession) {
          // Filter out duplicates when setting recommendations
          const uniqueRecommendations = updatedSession.recommendations.filter((rec, index, self) =>
            index === self.findIndex(r => r.id === rec.id)
          );
          setRecommendations(uniqueRecommendations);
          console.log('Updated recommendations:', uniqueRecommendations.length);

          // Send Slack notification for new recommendations that need approval
          const newRecommendation = event.detail.recommendation;
          if (newRecommendation) {
            console.log('🔍 Slack notification check:', {
              source: newRecommendation.source,
              isFromSensei: newRecommendation.source === 'sensei',
              autoExecute: autoExecute,
              confidence: newRecommendation.confidence,
              slackEnabled: slackService.isEnabled(),
              shouldSend: newRecommendation.source === 'sensei' && !autoExecute && slackService.isEnabled()
            });

            if (newRecommendation.source === 'sensei' &&
                !autoExecute &&
                slackService.isEnabled()) {

              console.log('📤 Sending Slack approval request...');
              const result = await slackService.sendApprovalRequest({
                recommendation: newRecommendation,
                serverId: effectiveServerId,
                sessionId: effectiveSessionId,
                projectName: window.location.pathname
              });
              console.log('📬 Slack approval request result:', result);
            } else {
              console.log('⏭️ Skipping Slack notification - conditions not met');
            }
          }
        }
        setIsAnalyzing(false);
      }
    };

    // Listen for execution requests
    const handleExecute = (event: CustomEvent) => {
      if ((event.detail.serverId === effectiveServerId || event.detail.serverId === serverId) &&
          (event.detail.sessionId === effectiveSessionId || event.detail.sessionId === sessionId)) {
        if (onExecuteCommand) {
          onExecuteCommand(event.detail.command);
        }
      }
    };

    // Listen for analyzing state changes
    const handleAnalyzing = (event: CustomEvent) => {
      if ((event.detail.serverId === effectiveServerId || event.detail.serverId === serverId) &&
          (event.detail.sessionId === effectiveSessionId || event.detail.sessionId === sessionId)) {
        setIsAnalyzing(event.detail.analyzing);
      }
    };

    // Listen for Slack approval events
    const handleSlackApproval = (event: CustomEvent) => {
      if ((event.detail.serverId === effectiveServerId || event.detail.serverId === serverId) &&
          (event.detail.sessionId === effectiveSessionId || event.detail.sessionId === sessionId)) {
        // Update the recommendation status
        setRecommendations(prev => prev.map(rec => {
          if (rec.id === event.detail.recommendationId) {
            return { ...rec, executed: true };
          }
          return rec;
        }));
      }
    };

    window.addEventListener('sensei-recommendation', handleRecommendation as unknown as EventListener);
    window.addEventListener('sensei-execute', handleExecute as EventListener);
    window.addEventListener('sensei-analyzing', handleAnalyzing as EventListener);
    window.addEventListener('slack-approval', handleSlackApproval as EventListener);

    return () => {
      window.removeEventListener('sensei-recommendation', handleRecommendation as unknown as EventListener);
      window.removeEventListener('sensei-execute', handleExecute as EventListener);
      window.removeEventListener('sensei-analyzing', handleAnalyzing as EventListener);
      window.removeEventListener('slack-approval', handleSlackApproval as EventListener);
    };
  }, [serverId, sessionId]);

  const toggleSensei = () => {
    const newEnabled = !isEnabled;
    const effectiveServerId = serverId || 'agent';
    const effectiveSessionId = sessionId || 'default';
    senseiService.toggleSensei(effectiveServerId, effectiveSessionId, newEnabled);
    setIsEnabled(newEnabled);
    if (newEnabled) {
      setIsAnalyzing(true);
    }
  };

  const toggleAutoExecute = () => {
    const newAutoExecute = !autoExecute;
    const effectiveServerId = serverId || 'agent';
    const effectiveSessionId = sessionId || 'default';
    senseiService.updateConfig(effectiveServerId, effectiveSessionId, { autoExecute: newAutoExecute });
    setAutoExecute(newAutoExecute);
  };

  const executeRecommendation = (recommendationId: string) => {
    const effectiveServerId = serverId || 'agent';
    const effectiveSessionId = sessionId || 'default';
    senseiService.executeRecommendation(effectiveServerId, effectiveSessionId, recommendationId);
  };

  const clearRecommendations = () => {
    const effectiveServerId = serverId || 'agent';
    const effectiveSessionId = sessionId || 'default';
    senseiService.clearRecommendations(effectiveServerId, effectiveSessionId);
    setRecommendations([]);
    setExpandedRecommendations(new Set());
  };

  const toggleRecommendationExpansion = (recId: string) => {
    setExpandedRecommendations(prev => {
      const newSet = new Set(prev);
      if (newSet.has(recId)) {
        newSet.delete(recId);
      } else {
        newSet.add(recId);
      }
      return newSet;
    });
  };


  const truncateText = (text: string, maxLength: number = 200) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  return (
    <div className={`flex flex-col h-full border-l-4 border-black transition-all duration-500 ${isAnalyzing ? 'sensei-analyzing-bg' : 'bg-white'}`}>
      {/* Header */}
      <div className={`flex-shrink-0 flex items-center justify-between px-4 py-3 border-b-4 border-black ${
        isAnalyzing ? 'bg-transparent' : 'bg-gradient-to-r from-violet-100 to-purple-100'
      }`}>
        <div className="flex items-center gap-2">
          <Brain className={`h-5 w-5 ${isEnabled ? 'text-purple-700' : 'text-gray-500'}`} strokeWidth={2.5} />
          <span className="font-bold text-black">SensAI Assistant</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleAutoExecute}
            className={`p-2 transition-all rounded ${
              autoExecute
                ? 'bg-yellow-400 text-black border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:bg-yellow-500'
                : 'bg-white text-gray-600 border-2 border-gray-400 hover:border-black hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
            }`}
            title={autoExecute ? 'Auto-execute enabled' : 'Auto-execute disabled'}
          >
            {autoExecute ? <Zap className="h-4 w-4" /> : <ZapOff className="h-4 w-4" />}
          </button>
          <button
            onClick={onOpenSettings}
            className="p-2 bg-white text-black border-2 border-gray-400 hover:border-black hover:bg-gray-50 hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all rounded"
            title="Settings"
          >
            <Settings className="h-4 w-4" />
          </button>
          <button
            onClick={clearRecommendations}
            className="p-2 bg-white text-red-600 border-2 border-red-400 hover:border-red-600 hover:bg-red-50 hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all rounded"
            title="Clear recommendations"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <button
            onClick={toggleSensei}
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

      {/* Content */}
      <div className={`flex-1 overflow-y-auto p-4 min-h-0 ${
        isAnalyzing ? 'bg-transparent' : 'bg-gradient-to-b from-gray-50 to-white'
      }`}>
        {/* Sensei Recommendations */}
        {!isEnabled ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Brain className="h-12 w-12 text-gray-400 mb-3" strokeWidth={1.5} />
            <p className="text-gray-700 font-bold mb-4">
              SensAI is disabled
            </p>
            <p className="text-sm text-gray-600 mb-4 max-w-xs">
              Enable SensAI to get AI-powered recommendations based on your terminal output
            </p>
            <button
              onClick={toggleSensei}
              className="px-4 py-2 bg-purple-500 text-white font-bold border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:bg-purple-600 transition-all rounded"
            >
              Enable SensAI
            </button>
          </div>
        ) : recommendations.length === 0 && !isAnalyzing ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Brain className="h-12 w-12 text-purple-500 mb-3 animate-pulse" strokeWidth={1.5} />
            <p className="text-gray-700 font-bold">
              Waiting for terminal output...
            </p>
            <p className="text-sm text-gray-600 mt-2">
              SensAI will analyze your session and provide recommendations
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Show analyzing indicator when processing */}
            {isAnalyzing && (
              <div className="bg-purple-100 p-4 border-2 border-purple-600 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] rounded-lg animate-pulse">
                <div className="flex items-center gap-3">
                  <Loader2 className="h-5 w-5 text-purple-600 animate-spin" strokeWidth={2.5} />
                  <div className="flex-1">
                    <p className="text-sm font-bold text-purple-900">
                      SensAI is analyzing the agent output
                    </p>
                    <p className="text-xs text-purple-700 mt-1">
                      Processing conversation to provide intelligent recommendations
                    </p>
                  </div>
                </div>
              </div>
            )}

            {recommendations.map((rec) => {
              const isExpanded = expandedRecommendations.has(rec.id);
              const needsTruncation = rec.recommendation.length > 200;

              return (
                <div
                  key={rec.id}
                  className="bg-white p-4 border-2 border-gray-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-1px] hover:translate-y-[-1px] transition-all rounded-lg"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {/* Source label */}
                      <span className={`text-xs px-2 py-1 rounded-md border-2 font-bold ${
                        rec.source === 'sensei' ? 'bg-purple-100 border-purple-600 text-purple-800' :
                        rec.source === 'claude-code' ? 'bg-orange-100 border-orange-600 text-orange-800' :
                        rec.source === 'agent' ? 'bg-blue-100 border-blue-600 text-blue-800' :
                        'bg-indigo-100 border-indigo-600 text-indigo-800'
                      }`}>
                        {rec.source === 'sensei' ? '✨ SensAI' :
                         rec.source === 'claude-code' ? '🤖 Claude Code' :
                         rec.source === 'agent' ? '🤖 Agent' :
                         '🤖 ' + rec.source.replace('-', ' ').toUpperCase()}
                      </span>

                      <div
                        className={`w-3 h-3 rounded-full border-2 ${
                          rec.confidence > 0.7 ? 'bg-green-400 border-green-600' :
                          rec.confidence > 0.4 ? 'bg-yellow-400 border-yellow-600' :
                          'bg-orange-400 border-orange-600'
                        }`}
                        title={`Confidence: ${(rec.confidence * 100).toFixed(0)}%`}
                      />
                      <span className="text-xs text-gray-600 font-medium">
                        {rec.timestamp.toLocaleTimeString()}
                      </span>
                      {rec.executed && (
                        <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full border-2 border-green-600 font-bold">
                          Approved
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Show user input if available */}
                  {rec.input && (
                    <div className="mb-3 p-2 bg-gray-50 rounded border border-gray-300">
                      <p className="text-xs text-gray-600 font-semibold mb-1">User asked:</p>
                      <p className="text-xs text-gray-700">{truncateText(rec.input, 100)}</p>
                    </div>
                  )}

                  {/* Recommendation */}
                  <p className="text-sm text-gray-800 mb-3 font-medium">
                    {isExpanded ? rec.recommendation : truncateText(rec.recommendation)}
                  </p>

                  {needsTruncation && (
                    <button
                      onClick={() => toggleRecommendationExpansion(rec.id)}
                      className="mb-3 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
                    >
                      {isExpanded ? (
                        <>
                          <ChevronUp className="h-3 w-3" />
                          Show less
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-3 w-3" />
                          Show more
                        </>
                      )}
                    </button>
                  )}

                  {rec.command && (
                    <div className="mt-3 p-3 bg-gray-900 rounded-lg border-2 border-gray-900 overflow-hidden">
                      <code className="text-xs text-gray-100 font-mono font-medium overflow-x-auto whitespace-nowrap scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-gray-900">
                        Suggested command: {rec.command}
                      </code>
                    </div>
                  )}

                  <div className="mt-3 flex items-center justify-between gap-4">
                    <span className="text-xs text-gray-600 font-medium">
                      Confidence: {(rec.confidence * 100).toFixed(0)}%
                    </span>

                    {!rec.executed && rec.source === 'sensei' && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={async () => {
                            // Mark as approved
                            const updatedRec = { ...rec, executed: true };
                            setRecommendations(recommendations.map(r =>
                              r.id === rec.id ? updatedRec : r
                            ));

                            // Send the approved recommendation back to the agent
                            await emit('sensei-approved', {
                              sessionId: sessionId || 'default',
                              recommendation: rec.recommendation,
                              confidence: rec.confidence,
                              timestamp: new Date().toISOString()
                            });

                            // If there's a command, execute it
                            if (rec.command) {
                              executeRecommendation(rec.id);
                            }
                          }}
                          className="px-3 py-1.5 bg-green-400 text-black font-bold text-xs border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:bg-green-500 transition-all rounded"
                          title="Approve recommendation"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => {
                            // Mark as declined
                            const updatedRec = { ...rec, executed: true };
                            setRecommendations(recommendations.map(r =>
                              r.id === rec.id ? updatedRec : r
                            ));
                          }}
                          className="px-3 py-1.5 bg-red-400 text-black font-bold text-xs border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:bg-red-500 transition-all rounded"
                          title="Decline recommendation"
                        >
                          Decline
                        </button>
                      </div>
                    )}

                    {rec.executed && (
                      <span className="text-xs text-gray-500 italic">
                        Approved
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Status bar */}
      {isEnabled && (
        <div className={`flex-shrink-0 px-4 py-2 border-t-4 border-black ${
          isAnalyzing ? 'bg-transparent' : 'bg-gradient-to-r from-violet-50 to-purple-50'
        }`}>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-800 font-bold">
              {recommendations.length} recommendation{recommendations.length !== 1 ? 's' : ''}
            </span>
            {autoExecute && (
              <span className="flex items-center gap-1 bg-yellow-100 px-2 py-0.5 rounded-full border border-yellow-600 text-yellow-800 font-bold">
                <Zap className="h-3 w-3" strokeWidth={2} />
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