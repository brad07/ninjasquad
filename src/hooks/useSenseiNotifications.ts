import { useEffect, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { slackService } from '../services/SlackService';
import { senseiService } from '../services/SenseiService';
import { eventBus } from '../services/EventBus';

export const useSenseiNotifications = (serverId: string, sessionId: string) => {
  const [slackConnected, setSlackConnected] = useState(false);
  const [desktopNotificationsEnabled, setDesktopNotificationsEnabled] = useState(false);
  const [forceUpdate, setForceUpdate] = useState(0);

  const effectiveServerId = serverId || 'agent';
  const effectiveSessionId = sessionId || 'default';

  // Check desktop notification permission on mount
  useEffect(() => {
    const checkPermission = async () => {
      try {
        const { isPermissionGranted } = await import('@tauri-apps/plugin-notification');
        const granted = await isPermissionGranted();
        setDesktopNotificationsEnabled(granted);
      } catch (error) {
        console.error('Error checking notification permission:', error);
      }
    };
    checkPermission();
  }, []);

  // Check Slack connection and poll for approvals
  useEffect(() => {
    let lastPollTime = Date.now();

    const checkSlackStatus = async () => {
      // Check if service is running by calling status endpoint directly
      try {
        const status = await slackService.getStatus();
        // Service is connected if it's running AND initialized with credentials
        setSlackConnected(status?.service_running && status?.initialized);
      } catch (error) {
        setSlackConnected(false);
      }
    };

    const pollApprovals = async () => {
      if (!slackService.isEnabled()) return;

      try {
        const result = await invoke<{ approvals: any[] }>('get_slack_approvals', {
          since: lastPollTime
        });

        if (result.approvals && result.approvals.length > 0) {
          console.log('📬 Received approvals from Slack:', result.approvals);

          result.approvals.forEach((approval: any) => {
            if (approval.approved) {
              const session = senseiService.getSession(approval.serverId, approval.sessionId);
              if (session) {
                const rec = session.recommendations.find((r: any) => r.id === approval.recommendation.id);
                if (rec) {
                  rec.executed = true;
                  console.log('✅ Marked recommendation as executed:', rec.id);
                  setForceUpdate(prev => prev + 1);
                }
              }

              const approvalData = {
                sessionId: approval.sessionId,
                serverId: approval.serverId,
                recommendation: approval.recommendation.recommendation,
                command: approval.recommendation.command,
                confidence: approval.recommendation.confidence,
                timestamp: new Date(approval.timestamp).toISOString(),
                autoApproved: false
              };

              // Emit through EventBus (for Claude Agent and other EventBus listeners)
              eventBus.emit('sensei-approved', approvalData);
              console.log('✅ Emitted sensei-approved event via EventBus for:', approval.sessionId);

              // Also emit as window event for backward compatibility
              window.dispatchEvent(new CustomEvent('sensei-approved', {
                detail: approvalData
              }));
              console.log('✅ Emitted sensei-approved window event for:', approval.sessionId);
            }

            if (approval.timestamp > lastPollTime) {
              lastPollTime = approval.timestamp;
            }
          });
        }
      } catch (error) {
        console.error('Failed to poll Slack approvals:', error);
      }
    };

    checkSlackStatus();

    const interval = setInterval(() => {
      checkSlackStatus();
      pollApprovals();
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  // Handle new recommendations and send notifications
  useEffect(() => {
    const handleRecommendation = async (event: CustomEvent) => {
      // Match by sessionId only - we want ALL recommendations in this session to trigger Slack,
      // regardless of which serverId they came from (e.g., dev-server monitor, agent, etc.)
      if (event.detail.sessionId === effectiveSessionId || event.detail.sessionId === sessionId) {
        const newRecommendation = event.detail.recommendation;
        const recServerId = event.detail.serverId; // The serverId from the recommendation

        // Send Slack notifications for all recommendations that were NOT auto-approved
        if (newRecommendation && !newRecommendation.autoApproved) {
          console.log('🔍 Notification check:', {
            source: newRecommendation.source,
            autoApproved: newRecommendation.autoApproved,
            slackEnabled: slackService.isEnabled(),
            recServerId,
            effectiveServerId,
            recommendation: newRecommendation.recommendation.substring(0, 50)
          });

          // Use the recommendation's serverId for routing back, or fall back to effectiveServerId
          const actualServerId = recServerId || effectiveServerId;
          const projectName = actualServerId.startsWith('dev-server-')
            ? 'Dev Server Monitor'
            : actualServerId === 'claude-code'
            ? 'Claude Code Session'
            : actualServerId;

          if (slackService.isEnabled()) {
            console.log('📤 Sending Slack notification for source:', newRecommendation.source, 'with serverId:', actualServerId);
            const result = await slackService.sendApprovalRequest({
              recommendation: newRecommendation,
              serverId: actualServerId, // Use actual serverId so approval routes back correctly
              sessionId: effectiveSessionId,
              projectName: projectName
            });
            console.log('📬 Slack approval request result:', result);
          } else {
            console.log('⏭️ Slack not enabled - notification not sent (enable Slack in Admin → Notifications)');
          }
        } else if (newRecommendation?.autoApproved) {
          console.log('⏭️ Skipping Slack notification - recommendation was auto-approved');
        }
      }
    };

    window.addEventListener('sensei-recommendation', handleRecommendation as EventListener);

    return () => {
      window.removeEventListener('sensei-recommendation', handleRecommendation as EventListener);
    };
  }, [serverId, sessionId, effectiveServerId, effectiveSessionId]);

  return {
    slackConnected,
    desktopNotificationsEnabled,
    forceUpdate,
    setSlackConnected,
    setDesktopNotificationsEnabled
  };
};