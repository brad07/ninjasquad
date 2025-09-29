#!/usr/bin/env node

const { App } = require('@slack/bolt');
const { WebClient } = require('@slack/web-api');
const express = require('express');
const cors = require('cors');

// Express server for communication with Tauri frontend
const server = express();
server.use(cors());
server.use(express.json());

let slackApp = null;
let slackClient = null;
let config = null;
let isInitialized = false;
const pendingApprovals = new Map();

// Initialize Slack
server.post('/initialize', async (req, res) => {
  try {
    // Convert snake_case from Rust to camelCase for JavaScript
    const rawConfig = req.body;
    config = {
      botToken: rawConfig.bot_token || rawConfig.botToken,
      signingSecret: rawConfig.signing_secret || rawConfig.signingSecret,
      appToken: rawConfig.app_token || rawConfig.appToken,
      channel: rawConfig.channel,
      enabled: rawConfig.enabled
    };

    if (!config.enabled) {
      return res.json({ success: false, message: 'Slack is disabled' });
    }

    // Initialize Slack Bolt app with Socket Mode
    slackApp = new App({
      token: config.botToken,
      signingSecret: config.signingSecret,
      socketMode: true,
      appToken: config.appToken,
    });

    slackClient = new WebClient(config.botToken);

    // Set up event handlers
    setupEventHandlers();

    // Start the app
    await slackApp.start();

    isInitialized = true;
    console.log('⚡️ Slack Bolt app is running!');

    res.json({ success: true, message: 'Slack initialized successfully' });
  } catch (error) {
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
    const { recommendation, sessionId, projectName, serverId } = req.body;
    const actionId = `approval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Store the request
    pendingApprovals.set(actionId, {
      recommendation,
      sessionId,
      serverId,
      projectName
    });

    // Build confidence indicator
    const confidencePercent = Math.round(recommendation.confidence * 100);
    const confidenceEmoji =
      recommendation.confidence > 0.7 ? '🟢' :
      recommendation.confidence > 0.4 ? '🟡' : '🔴';

    // Build message blocks
    const blocks = [
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
          text: `*Project:* ${projectName || 'Unknown'}\n*Session:* \`${sessionId}\`\n*Confidence:* ${confidenceEmoji} ${confidencePercent}%\n*Time:* <!date^${Math.floor(Date.now() / 1000)}^{date_short} {time}^|${new Date().toLocaleString()}>`
        }
      }
    ];

    // Add recommendation
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Recommendation:*\n${recommendation.recommendation.substring(0, 1000)}${recommendation.recommendation.length > 1000 ? '...' : ''}`
      }
    });

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

    // Add action buttons
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
            text: '❌ Decline',
            emoji: true
          },
          style: 'danger',
          action_id: 'decline_recommendation',
          value: actionId
        }
      ]
    });

    const result = await slackClient.chat.postMessage({
      channel: config.channel,
      text: `🧠 SensAI approval required (${confidencePercent}% confidence)`,
      blocks
    });

    res.json({ success: true, messageTs: result.ts });
  } catch (error) {
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
  } catch (error) {
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
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Status check
server.get('/status', (req, res) => {
  res.json({
    initialized: isInitialized,
    pendingApprovals: pendingApprovals.size,
    config: config ? { channel: config.channel, enabled: config.enabled } : null
  });
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

async function handleApproval(body, client, approved) {
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
  const statusText = approved ? 'Approved' : 'Declined';

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

  // Send approval status back to frontend
  // This would be handled by polling or websocket in real implementation

  pendingApprovals.delete(actionId);
}

// Start the Express server
const PORT = process.env.SLACK_SERVICE_PORT || 3456;
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