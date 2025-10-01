import { useEffect, useState } from 'react';
import { senseiService, type SenseiRecommendation } from '../services/SenseiService';
import { eventBus } from '../services/EventBus';

export const useSenseiSession = (serverId: string, sessionId: string) => {
  const [recommendations, setRecommendations] = useState<SenseiRecommendation[]>([]);
  const [isEnabled, setIsEnabled] = useState(true);
  const [autoApprove, setAutoApprove] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [newRecommendationIds, setNewRecommendationIds] = useState<Set<string>>(new Set());
  const [tokenUsage, setTokenUsage] = useState({ promptTokens: 0, completionTokens: 0, totalTokens: 0, requestCount: 0 });

  const effectiveServerId = serverId || 'agent';
  const effectiveSessionId = sessionId || 'default';

  // Initialize session
  useEffect(() => {
    let session = senseiService.getSession(effectiveServerId, effectiveSessionId);
    if (!session) {
      session = senseiService.initializeSession(effectiveServerId, effectiveSessionId);
      senseiService.toggleSensei(effectiveServerId, effectiveSessionId, true);
    }

    setIsEnabled(session.config.enabled !== false);
    setAutoApprove(session.config.autoApprove);

    const uniqueRecommendations = session.recommendations.filter((rec, index, self) =>
      index === self.findIndex(r => r.id === rec.id)
    );
    setRecommendations(uniqueRecommendations);
    setTokenUsage(session.tokenUsage || { promptTokens: 0, completionTokens: 0, totalTokens: 0, requestCount: 0 });
  }, [effectiveServerId, effectiveSessionId]);

  // Listen for recommendation events using EventBus
  useEffect(() => {
    console.log('[useSenseiSession] 📝 Subscribing with serverId:', effectiveServerId, 'sessionId:', effectiveSessionId);

    // Subscribe to both sessionId variations to handle any mismatch
    const unsubscribeRecommendation = eventBus.on(effectiveSessionId, 'sensei-recommendation', (data) => {
      console.log('[useSenseiSession] 🔔 Received sensei-recommendation event:', data);

      // Use serverId from the event data, not the component prop
      // This allows multiple sources (dev servers, plugins, etc) to send to the same session
      const eventServerId = data.serverId;
      const eventSessionId = data.sessionId;

      console.log('[useSenseiSession] 🔍 Retrieving session with serverId:', eventServerId, 'sessionId:', eventSessionId);
      console.log('[useSenseiSession] 🔑 Session key will be:', `${eventServerId}-${eventSessionId}`);

      const updatedSession = senseiService.getSession(eventServerId, eventSessionId);
      console.log('[useSenseiSession] 📦 Retrieved session:', updatedSession ? `${updatedSession.recommendations.length} recommendations` : 'null');

      if (updatedSession) {
        const uniqueRecommendations = updatedSession.recommendations.filter((rec, index, self) =>
          index === self.findIndex(r => r.id === rec.id)
        );
        console.log('[useSenseiSession] ✅ Updating state with', uniqueRecommendations.length, 'recommendations');
        setRecommendations(uniqueRecommendations);
        setTokenUsage(updatedSession.tokenUsage || { promptTokens: 0, completionTokens: 0, totalTokens: 0, requestCount: 0 });

        // Mark new recommendations for highlighting
        const newRec = data.recommendation;
        if (newRec) {
          setNewRecommendationIds(prev => new Set([...prev, newRec.id]));
          setTimeout(() => {
            setNewRecommendationIds(prev => {
              const next = new Set(prev);
              next.delete(newRec.id);
              return next;
            });
          }, 3000);
        }
      }
      setIsAnalyzing(false);
    });

    const unsubscribeAnalyzing = eventBus.on(effectiveSessionId, 'sensei-analyzing', (data) => {
      setIsAnalyzing(data.analyzing);
    });

    // Keep window listener for slack-approval (not yet migrated to EventBus)
    const handleSlackApproval = (event: CustomEvent) => {
      if ((event.detail.serverId === effectiveServerId || event.detail.serverId === serverId) &&
          (event.detail.sessionId === effectiveSessionId || event.detail.sessionId === sessionId)) {
        setRecommendations(prev => prev.map(rec => {
          if (rec.id === event.detail.recommendationId) {
            return { ...rec, executed: true };
          }
          return rec;
        }));
      }
    };

    window.addEventListener('slack-approval', handleSlackApproval as EventListener);

    return () => {
      unsubscribeRecommendation();
      unsubscribeAnalyzing();
      window.removeEventListener('slack-approval', handleSlackApproval as EventListener);
    };
  }, [serverId, sessionId, effectiveServerId, effectiveSessionId]);

  const toggleSensei = () => {
    const newEnabled = !isEnabled;
    senseiService.toggleSensei(effectiveServerId, effectiveSessionId, newEnabled);
    setIsEnabled(newEnabled);
    if (newEnabled) {
      setIsAnalyzing(true);
    }
  };

  const toggleAutoApprove = () => {
    const newAutoApprove = !autoApprove;
    senseiService.updateConfig(effectiveServerId, effectiveSessionId, { autoApprove: newAutoApprove });
    setAutoApprove(newAutoApprove);
  };

  const approveRecommendation = async (recommendationId: string, editedText?: string) => {
    // Find the recommendation first to get its serverId
    const rec = recommendations.find(r => r.id === recommendationId);
    if (!rec) {
      console.warn('[useSenseiSession] Recommendation not found:', recommendationId);
      return;
    }

    // Use the serverId stored in the recommendation, or fall back to effectiveServerId
    const targetServerId = rec.serverId || effectiveServerId;

    console.log('[useSenseiSession] Approving recommendation:', {
      recommendationId,
      source: rec.source,
      storedServerId: rec.serverId,
      targetServerId,
      effectiveSessionId,
      edited: !!editedText
    });

    // If text was edited, update the recommendation in the session first
    if (editedText && editedText !== rec.recommendation) {
      const session = senseiService.getSession(targetServerId, effectiveSessionId);
      if (session) {
        const recToUpdate = session.recommendations.find(r => r.id === recommendationId);
        if (recToUpdate) {
          recToUpdate.recommendation = editedText;
          console.log('[useSenseiSession] Updated recommendation text before approval');
        }
      }
    }

    await senseiService.executeRecommendation(
      targetServerId,
      effectiveSessionId,
      recommendationId,
      false
    );

    const updatedRec = {
      ...rec,
      recommendation: editedText || rec.recommendation,
      executed: true,
      autoApproved: false
    };
    setRecommendations(recommendations.map(r =>
      r.id === recommendationId ? updatedRec : r
    ));
  };

  const denyRecommendation = (recommendationId: string) => {
    // Find the recommendation first to get its serverId
    const rec = recommendations.find(r => r.id === recommendationId);
    if (!rec) {
      console.warn('[useSenseiSession] Recommendation not found:', recommendationId);
      return;
    }

    // Use the serverId stored in the recommendation, or fall back to effectiveServerId
    const targetServerId = rec.serverId || effectiveServerId;

    console.log('[useSenseiSession] Denying recommendation:', {
      recommendationId,
      source: rec.source,
      storedServerId: rec.serverId,
      targetServerId,
      effectiveSessionId
    });

    senseiService.markRecommendationDenied(targetServerId, effectiveSessionId, recommendationId);

    const updatedRec = { ...rec, executed: true, denied: true };
    setRecommendations(recommendations.map(r =>
      r.id === recommendationId ? updatedRec : r
    ));
  };

  const clearRecommendations = () => {
    senseiService.clearRecommendations(effectiveServerId, effectiveSessionId);
    setRecommendations([]);
    setNewRecommendationIds(new Set());
  };

  const resetTokenUsage = () => {
    senseiService.resetTokenUsage(effectiveServerId, effectiveSessionId);
    setTokenUsage({ promptTokens: 0, completionTokens: 0, totalTokens: 0, requestCount: 0 });
  };

  return {
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
  };
};