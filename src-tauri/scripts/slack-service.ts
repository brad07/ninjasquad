#!/usr/bin/env node

import pkg from '@slack/bolt';
const { App } = pkg;
import webApi from '@slack/web-api';
const { WebClient } = webApi;
import express from 'express';
import cors from 'cors';

interface SlackConfig {
  botToken: string;
  signingSecret: string;
  appToken: string;
  channel: string;
  enabled: boolean;
}

interface Recommendation {
  recommendation: string;
  command?: string;
  confidence: number;
}

interface PendingApproval {
  recommendation: Recommendation;
  sessionId: string;
  serverId: string;
  projectName?: string;
  messageTs?: string; // Track the message timestamp for thread replies
}

interface RecentApproval {
  actionId: string;
  approved: boolean;
  sessionId: string;
  serverId: string;
  projectName?: string;
  recommendation: Recommendation;
  timestamp: number;
}

// Express server for communication with Tauri frontend
const server = express();
server.use(cors());
server.use(express.json());

let slackApp: App | null = null;
let slackClient: WebClient | null = null;
let config: SlackConfig | null = null;
let isInitialized = false;
const pendingApprovals = new Map<string, PendingApproval>();
const recentApprovals: RecentApproval[] = [];
const recentLogs: string[] = []; // Store recent logs
const MAX_LOGS = 200; // Keep last 200 log entries

// Helper to log and store
function logAndStore(message: string) {
  console.log(message);
  recentLogs.push(`[${new Date().toISOString()}] ${message}`);
  if (recentLogs.length > MAX_LOGS) {
    recentLogs.shift();
  }
}

// Initialize Slack
server.post('/initialize', async (req, res) => {
  try {
    console.log('[Slack Service] Received initialization request');
    console.log('[Slack Service] Raw body keys:', Object.keys(req.body));

    // Convert snake_case from Rust to camelCase for JavaScript
    const rawConfig = req.body;
    config = {
      botToken: rawConfig.bot_token || rawConfig.botToken,
      signingSecret: rawConfig.signing_secret || rawConfig.signingSecret,
      appToken: rawConfig.app_token || rawConfig.appToken,
      channel: rawConfig.channel,
      enabled: rawConfig.enabled
    };

    console.log('[Slack Service] Parsed config:', {
      botToken: config.botToken ? `${config.botToken.substring(0, 10)}... (${config.botToken.length} chars)` : 'MISSING',
      signingSecret: config.signingSecret ? `${config.signingSecret.substring(0, 10)}... (${config.signingSecret.length} chars)` : 'MISSING',
      appToken: config.appToken ? `${config.appToken.substring(0, 10)}... (${config.appToken.length} chars)` : 'MISSING',
      channel: config.channel,
      enabled: config.enabled
    });

    if (!config.enabled) {
      console.log('[Slack Service] Slack is disabled in config');
      return res.json({ success: false, message: 'Slack is disabled' });
    }

    // Initialize Slack Bolt app with Socket Mode
    slackApp = new App({
      token: config.botToken,
      signingSecret: config.signingSecret,
      socketMode: true,
      appToken: config.appToken,
      logLevel: 'ERROR', // Reduce log noise
      socketModeOptions: {
        // Handle disconnections gracefully
        autoReconnectEnabled: true,
      }
    });

    slackClient = new WebClient(config.botToken);

    // Set up event handlers
    setupEventHandlers();

    // Add error handlers for socket mode disconnections
    slackApp.error(async (error) => {
      console.error('[Slack] App error:', error);
      // Don't crash the process on connection errors
    });

    // Handle uncaught errors to prevent crashes
    process.on('uncaughtException', (error) => {
      if (error.message.includes('Unhandled event')) {
        console.error('[Slack] Socket mode error (non-fatal):', error.message);
        // Don't crash - just log it
      } else {
        throw error; // Re-throw other errors
      }
    });

    // Start the app
    await slackApp.start();

    isInitialized = true;
    console.log('⚡️ Slack Bolt app is running!');

    res.json({ success: true, message: 'Slack initialized successfully' });
  } catch (error: any) {
    console.error('Failed to initialize Slack:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Send approval request
server.post('/send-approval', async (req, res) => {
  if (!isInitialized || !slackClient || !config) {
    return res.status(400).json({ success: false, message: 'Slack not initialized' });
  }

  try {
    // Rust sends snake_case, so destructure accordingly
    const { recommendation, session_id, project_name, server_id } = req.body;
    const actionId = `approval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Store the request (using camelCase internally for consistency)
    const sessionId = session_id;
    const serverId = server_id;
    const projectName = project_name;

    // We'll store the messageTs after we send the message
    const pendingApproval: PendingApproval = {
      recommendation,
      sessionId,
      serverId,
      projectName
    };

    // Check if this is an analysis error (confidence = 0 and message starts with "Analysis error:")
    const isAnalysisError = recommendation.confidence === 0 &&
                            recommendation.recommendation.startsWith('Analysis error:');

    // Build confidence indicator
    const confidencePercent = Math.round(recommendation.confidence * 100);
    const confidenceEmoji =
      recommendation.confidence > 0.7 ? '🟢' :
      recommendation.confidence > 0.4 ? '🟡' : '🔴';

    // Build message blocks
    let blocks: any[];
    let fallbackText: string;

    if (isAnalysisError) {
      // Error message format
      blocks = [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '⚠️ SensAI Analysis Failed',
            emoji: true
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Project:* ${projectName || 'Unknown'}\n*Session:* \`${sessionId}\`\n*Time:* ${new Date().toLocaleString()}`
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Error:*\n\`\`\`${recommendation.recommendation}\`\`\``
          }
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: '_SensAI encountered an error while analyzing the agent response. Please check the configuration and try again._'
            }
          ]
        }
      ];
      fallbackText = '⚠️ SensAI analysis failed';
    } else {
      // Normal approval message format
      blocks = [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '🧠 SensAI Approval Required',
            emoji: true
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Project:* ${projectName || 'Unknown'}\n*Session:* \`${sessionId}\`\n*Confidence:* ${confidenceEmoji} ${confidencePercent}%\n*Time:* ${new Date().toLocaleString()}`
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Recommendation:*\n${recommendation.recommendation.substring(0, 1000)}${recommendation.recommendation.length > 1000 ? '...' : ''}`
          }
        }
      ];

      // Add command if available
      if (recommendation.command) {
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Suggested Command:*\n\`\`\`${recommendation.command}\`\`\``
          }
        });
      }

      // Add action buttons for normal recommendations
      blocks.push({
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '✅ Approve',
              emoji: true
            },
            style: 'primary',
            action_id: 'approve_recommendation',
            value: actionId
          },
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '❌ Deny',
              emoji: true
            },
            style: 'danger',
            action_id: 'decline_recommendation',
            value: actionId
          }
        ]
      });

      fallbackText = `🧠 SensAI approval required (${confidencePercent}% confidence)`;
    }

    const result = await slackClient.chat.postMessage({
      channel: config.channel,
      text: fallbackText,
      blocks
    });

    // Store the message timestamp with the pending approval
    pendingApproval.messageTs = result.ts as string;
    pendingApprovals.set(actionId, pendingApproval);

    console.log(`[Slack] Sent approval request ${actionId} with message ts: ${result.ts}`);

    res.json({ success: true, messageTs: result.ts });
  } catch (error: any) {
    console.error('Failed to send Slack message:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Send general message
server.post('/send-message', async (req, res) => {
  if (!isInitialized || !slackClient || !config) {
    return res.status(400).json({ success: false, message: 'Slack not initialized' });
  }

  try {
    const { text, blocks } = req.body;
    await slackClient.chat.postMessage({
      channel: config.channel,
      text,
      blocks
    });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Shutdown
server.post('/shutdown', async (req, res) => {
  try {
    if (slackApp) {
      await slackApp.stop();
      slackApp = null;
    }
    slackClient = null;
    isInitialized = false;
    pendingApprovals.clear();
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Status check
server.get('/status', (req, res) => {
  res.json({
    initialized: isInitialized,
    service_running: true, // Always true when this server is responding
    port: PORT,
    connected_channels: isInitialized ? 1 : 0, // 1 channel when initialized
    pendingApprovals: pendingApprovals.size,
    config: config ? { channel: config.channel, enabled: config.enabled } : null
  });
});

// Get recent approvals
server.get('/approvals', (req, res) => {
  const since = parseInt(req.query.since as string) || 0;
  const recent = recentApprovals.filter(a => a.timestamp > since);
  res.json({ approvals: recent });
});

// Get recent logs
server.get('/logs', (req, res) => {
  const limit = parseInt(req.query.limit as string) || 100;
  const logs = recentLogs.slice(-limit);
  res.json({ logs, total: recentLogs.length });
});

function setupEventHandlers() {
  if (!slackApp) return;

  // Handle button interactions
  slackApp.action('approve_recommendation', async ({ body, ack, client }) => {
    await ack();
    await handleApproval(body, client, true);
  });

  slackApp.action('decline_recommendation', async ({ body, ack, client }) => {
    await ack();
    await handleApproval(body, client, false);
  });

  // Handle thread replies - listen for messages in threads
  slackApp.message(async ({ message, client }) => {
    logAndStore(`[Slack] 📨 Message received: type=${message.type}, subtype=${'subtype' in message ? message.subtype : 'none'}, thread_ts=${'thread_ts' in message ? message.thread_ts : 'none'}, text=${'text' in message ? message.text?.substring(0, 50) : 'none'}`);

    // Only process thread replies (messages with thread_ts)
    if (!('thread_ts' in message) || !message.thread_ts) {
      logAndStore('[Slack] ⏭️ Skipping - not a thread reply');
      return;
    }

    // Ignore bot messages (to avoid loops)
    if (message.subtype === 'bot_message' || ('bot_id' in message)) {
      logAndStore('[Slack] ⏭️ Skipping - bot message');
      return;
    }

    // Check if this is a reply to one of our approval messages
    const threadTs = message.thread_ts;
    logAndStore(`[Slack] 🔍 Checking if thread_ts ${threadTs} matches any pending approvals...`);
    logAndStore(`[Slack] 📋 Pending approvals count: ${pendingApprovals.size}`);

    // Debug: log all pending approvals
    for (const [actionId, approval] of pendingApprovals.entries()) {
      logAndStore(`[Slack]   - ${actionId}: messageTs=${approval.messageTs}, sessionId=${approval.sessionId}`);
    }

    let matchingApproval: PendingApproval | undefined;
    let matchingActionId: string | undefined;

    for (const [actionId, approval] of pendingApprovals.entries()) {
      if (approval.messageTs === threadTs) {
        matchingApproval = approval;
        matchingActionId = actionId;
        logAndStore(`[Slack] ✅ Found matching approval: ${actionId}`);
        break;
      }
    }

    if (!matchingApproval) {
      logAndStore(`[Slack] ⚠️ No matching approval found for thread_ts: ${threadTs}`);
      return;
    }

    if (matchingApproval && 'text' in message && message.text) {
      logAndStore(`[Slack] 🎯 Thread reply detected on approval ${matchingActionId}`);
      logAndStore(`[Slack] 📝 Reply text: ${message.text}`);

      // Create an auto-approved recommendation from the thread reply
      const threadRecommendation: Recommendation = {
        recommendation: message.text,
        confidence: 1.0 // Thread replies are assumed to be user-approved
      };

      logAndStore(`[Slack] 💾 Creating approval record...`);
      const approvalRecord = {
        actionId: `thread_${matchingActionId}_${Date.now()}`,
        approved: true,
        sessionId: matchingApproval.sessionId,
        serverId: matchingApproval.serverId,
        projectName: matchingApproval.projectName,
        recommendation: threadRecommendation,
        timestamp: Date.now()
      };
      logAndStore(`[Slack] 💾 Approval record: sessionId=${approvalRecord.sessionId}, serverId=${approvalRecord.serverId}`);

      // Store as approved
      recentApprovals.push(approvalRecord);
      logAndStore(`[Slack] ✅ Added to recentApprovals (now ${recentApprovals.length} total)`);

      // Keep only last 100 approvals
      if (recentApprovals.length > 100) {
        recentApprovals.shift();
      }

      // React to the message and post confirmation
      try {
        const channel = 'channel' in message ? message.channel : '';
        const ts = 'ts' in message ? message.ts : '';

        logAndStore(`[Slack] 👍 Adding reaction to message (channel: ${channel}, ts: ${ts})`);
        await client.reactions.add({
          channel,
          timestamp: ts,
          name: 'white_check_mark'
        });
        logAndStore(`[Slack] ✅ Reaction added`);

        // Post confirmation in thread
        logAndStore(`[Slack] 💬 Posting confirmation in thread (thread_ts: ${threadTs})`);
        await client.chat.postMessage({
          channel,
          thread_ts: threadTs,
          text: '✅ Got it! Sending this to the agent...'
        });
        logAndStore(`[Slack] ✅ Confirmation posted`);
      } catch (err) {
        logAndStore(`[Slack] ❌ Failed to add reaction/reply: ${err}`);
      }

      logAndStore(`[Slack] 🎉 Auto-approved thread reply for session ${matchingApproval.sessionId}`);
    }
  });

  // Handle slash commands
  slackApp.command('/sensei-status', async ({ ack, say }) => {
    await ack();
    await say({
      text: `SensAI Status: ${pendingApprovals.size} pending approvals`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*SensAI Status*\n• Pending Approvals: ${pendingApprovals.size}\n• Integration: ${isInitialized ? '✅ Active' : '❌ Inactive'}`
          }
        }
      ]
    });
  });
}

async function handleApproval(body: any, client: WebClient, approved: boolean) {
  const actionId = body.actions?.[0]?.value;
  if (!actionId) return;

  const request = pendingApprovals.get(actionId);
  if (!request) {
    await client.chat.postMessage({
      channel: body.channel?.id || config?.channel || '',
      thread_ts: body.message?.ts,
      text: '❌ This approval request has expired or was already processed.'
    });
    return;
  }

  // Update the original message
  const statusEmoji = approved ? '✅' : '❌';
  const statusText = approved ? 'Approved' : 'Denied';

  await client.chat.update({
    channel: body.channel?.id || config?.channel || '',
    ts: body.message?.ts,
    text: `${statusEmoji} Recommendation ${statusText.toLowerCase()}`,
    blocks: [
      ...body.message.blocks.slice(0, -1), // Keep all blocks except action block
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `_${statusEmoji} ${statusText} by <@${body.user?.id}> at <!date^${Math.floor(Date.now() / 1000)}^{date_short} {time}^|${new Date().toLocaleString()}>_`
        }
      }
    ]
  });

  // Store approval in recent approvals for frontend to poll
  recentApprovals.push({
    actionId,
    approved,
    sessionId: request.sessionId,
    serverId: request.serverId,
    projectName: request.projectName,
    recommendation: request.recommendation,
    timestamp: Date.now()
  });

  // Keep only last 100 approvals
  if (recentApprovals.length > 100) {
    recentApprovals.shift();
  }

  pendingApprovals.delete(actionId);
}

// Start the Express server
const PORT = parseInt(process.env.SLACK_SERVICE_PORT || '3456');
server.listen(PORT, () => {
  console.log(`Slack service running on port ${PORT}`);
});

// Handle shutdown gracefully
process.on('SIGTERM', async () => {
  if (slackApp) {
    await slackApp.stop();
  }
  process.exit(0);
});
