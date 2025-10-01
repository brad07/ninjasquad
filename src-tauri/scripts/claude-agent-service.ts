#!/usr/bin/env node

// Ensure PATH includes node bin directory for spawned processes
// Use process.execPath to get the current node binary location
const nodeDir = process.execPath.substring(0, process.execPath.lastIndexOf('/'));
if (nodeDir && !process.env.PATH?.includes(nodeDir)) {
  process.env.PATH = `${nodeDir}:${process.env.PATH}`;
  console.log('[ClaudeAgentService] Added node to PATH:', nodeDir);
}

console.log('[ClaudeAgentService] Current PATH:', process.env.PATH);
console.log('[ClaudeAgentService] Node executable:', process.execPath);

import { query } from '@anthropic-ai/claude-agent-sdk';
import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import os from 'os';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Session directory for conversation history
const SESSION_DIR = path.join(os.homedir(), '.ninjasquad', 'sessions');

// Ensure session directory exists
if (!existsSync(SESSION_DIR)) {
  mkdirSync(SESSION_DIR, { recursive: true });
  console.log('[ClaudeAgentService] Created session directory:', SESSION_DIR);
}

// Types
interface AgentSession {
  id: string;
  workingDirectory: string;
  model: string;
  permissionMode: string;
  conversationHistory: ConversationMessage[];
  createdAt: string;
  lastUsedAt: string;
}

interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  toolUses?: ToolUseInfo[];
}

interface ToolUseInfo {
  id: string;
  name: string;
  input: any;
  status: 'pending' | 'running' | 'completed' | 'error';
  output?: string;
  error?: string;
  timestamp: string;
}

// Express server for communication with Tauri frontend
const server = express();
server.use(cors());
server.use(express.json());

// Session storage
const sessions = new Map<string, AgentSession>();
const activeQueries = new Map<string, any>();

// Configuration
let apiKey: string | null = null;
let defaultModel = 'claude-sonnet-4-5-20250929';
let defaultPermissionMode = 'default';

// Helper functions for conversation history persistence
function saveConversationHistory(sessionId: string, history: ConversationMessage[]): void {
  try {
    const filePath = path.join(SESSION_DIR, `${sessionId}.json`);
    writeFileSync(filePath, JSON.stringify(history, null, 2));
    console.log(`[ClaudeAgentService] Saved ${history.length} messages for session ${sessionId}`);
  } catch (error) {
    console.error(`[ClaudeAgentService] Failed to save conversation history for ${sessionId}:`, error);
  }
}

function loadConversationHistory(sessionId: string): ConversationMessage[] | null {
  try {
    const filePath = path.join(SESSION_DIR, `${sessionId}.json`);
    if (existsSync(filePath)) {
      const data = readFileSync(filePath, 'utf-8');
      const history = JSON.parse(data);
      console.log(`[ClaudeAgentService] Loaded ${history.length} messages for session ${sessionId}`);
      return history;
    }
    return null;
  } catch (error) {
    console.error(`[ClaudeAgentService] Failed to load conversation history for ${sessionId}:`, error);
    return null;
  }
}

function sessionFileExists(sessionId: string): boolean {
  const filePath = path.join(SESSION_DIR, `${sessionId}.json`);
  return existsSync(filePath);
}

// Initialize service
server.post('/initialize', async (req: Request, res: Response) => {
  try {
    const { api_key, default_model, default_permission_mode } = req.body;

    apiKey = api_key || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(400).json({
        success: false,
        error: 'API key not provided and ANTHROPIC_API_KEY not set'
      });
    }

    if (default_model) {
      defaultModel = default_model;
    }

    if (default_permission_mode) {
      defaultPermissionMode = default_permission_mode;
    }

    console.log('[ClaudeAgentService] Initialized with model:', defaultModel);
    res.json({ success: true, message: 'Claude Agent service initialized' });
  } catch (error: any) {
    console.error('[ClaudeAgentService] Initialization error:', error);
    res.status(500).json({ success: false, error: error?.message || String(error) });
  }
});

// Create session
server.post('/create-session', async (req: Request, res: Response) => {
  try {
    const { session_id, working_directory, model, restore } = req.body;

    if (!session_id) {
      return res.status(400).json({ success: false, error: 'session_id required' });
    }

    // Try to load existing conversation history if restore=true
    let conversationHistory: ConversationMessage[] = [];
    if (restore && sessionFileExists(session_id)) {
      const loadedHistory = loadConversationHistory(session_id);
      if (loadedHistory) {
        conversationHistory = loadedHistory;
        console.log('[ClaudeAgentService] Restored', conversationHistory.length, 'messages for session:', session_id);
      }
    }

    const session = {
      id: session_id,
      workingDirectory: working_directory || process.cwd(),
      model: model || defaultModel,
      permissionMode: defaultPermissionMode,
      conversationHistory,
      createdAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString()
    };

    sessions.set(session_id, session);
    console.log('[ClaudeAgentService] Created session:', session_id, 'in', session.workingDirectory);

    res.json({
      success: true,
      session_id: session_id,
      working_directory: session.workingDirectory,
      restored_messages: conversationHistory.length
    });
  } catch (error) {
    console.error('[ClaudeAgentService] Create session error:', error);
    res.status(500).json({ success: false, error: (error as any)?.message || String(error) });
  }
});

// Restore session endpoint - check if session exists and load history
server.get('/restore-session/:session_id', async (req: Request, res: Response) => {
  try {
    const { session_id } = req.params;

    console.log('[ClaudeAgentService] Checking for session:', session_id);

    // Always check disk first for most up-to-date history
    if (sessionFileExists(session_id)) {
      console.log('[ClaudeAgentService] Found session file on disk for:', session_id);

      // Load conversation history from disk
      const history = loadConversationHistory(session_id);

      if (history) {
        const inMemory = sessions.has(session_id);
        console.log('[ClaudeAgentService] Loaded', history.length, 'messages from disk. In memory:', inMemory);

        return res.json({
          success: true,
          exists: true,
          in_memory: inMemory,
          message_count: history.length,
          conversation_history: history
        });
      }
    }

    // Check if session exists in memory (but no disk file)
    if (sessions.has(session_id)) {
      const session = sessions.get(session_id)!;
      console.log('[ClaudeAgentService] Session in memory but no disk file. Messages:', session.conversationHistory.length);
      return res.json({
        success: true,
        exists: true,
        in_memory: true,
        message_count: session.conversationHistory.length,
        conversation_history: session.conversationHistory
      });
    }

    // Session not found
    console.log('[ClaudeAgentService] No session found for:', session_id);
    res.json({
      success: true,
      exists: false,
      in_memory: false,
      message_count: 0
    });
  } catch (error) {
    console.error('[ClaudeAgentService] Restore session error:', error);
    res.status(500).json({ success: false, error: (error as any)?.message || String(error) });
  }
});

// Get session
server.get('/session/:session_id', async (req: Request, res: Response) => {
  try {
    const { session_id } = req.params;
    const session = sessions.get(session_id);

    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    res.json({
      success: true,
      session: {
        id: session.id,
        working_directory: session.workingDirectory,
        model: session.model,
        permission_mode: session.permissionMode,
        conversation_history: session.conversationHistory,
        created_at: session.createdAt,
        last_used_at: session.lastUsedAt
      }
    });
  } catch (error) {
    console.error('[ClaudeAgentService] Get session error:', error);
    res.status(500).json({ success: false, error: (error as any)?.message || String(error) });
  }
});

// Send message (streaming)
server.post('/send-message', async (req: Request, res: Response) => {
  try {
    const { session_id, message } = req.body;

    if (!session_id || !message) {
      return res.status(400).json({ success: false, error: 'session_id and message required' });
    }

    const session = sessions.get(session_id);
    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    if (!apiKey) {
      return res.status(400).json({ success: false, error: 'Service not initialized with API key' });
    }

    // Update last used timestamp
    session.lastUsedAt = new Date().toISOString();

    // Add user message to history
    const userMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: message,
      timestamp: new Date().toISOString()
    };
    session.conversationHistory.push(userMessage);

    // Set up Server-Sent Events for streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const queryId = `query-${Date.now()}`;
    let assistantMessage = {
      id: `msg-${Date.now() + 1}`,
      role: 'assistant',
      content: '',
      toolUses: [],
      timestamp: new Date().toISOString()
    };

    try {
      console.log('[ClaudeAgentService] Starting query for session:', session_id);

      // Set API key in environment
      process.env.ANTHROPIC_API_KEY = apiKey;

      // Stream the query response
      console.log('[ClaudeAgentService] Calling query() with prompt:', message.substring(0, 50));

      // Set up environment with correct PATH for child processes
      const queryEnv = {
        ...process.env,
        ANTHROPIC_API_KEY: apiKey
      };

      // Get the path to the Claude Agent SDK CLI
      const cliPath = path.join(__dirname, 'node_modules/@anthropic-ai/claude-agent-sdk/cli.js');

      // Use the exact same node binary that's running this service
      // This avoids version mismatches and path issues
      const nodeExecutable = process.execPath;

      console.log('[ClaudeAgentService] Using CLI path:', cliPath);
      console.log('[ClaudeAgentService] CLI exists:', existsSync(cliPath));
      console.log('[ClaudeAgentService] Using node executable:', nodeExecutable);
      console.log('[ClaudeAgentService] Node exists:', existsSync(nodeExecutable));
      console.log('[ClaudeAgentService] Node version:', process.version);
      console.log('[ClaudeAgentService] Session permission mode:', session.permissionMode);

      // Validate working directory exists (don't create it - use /tmp as fallback)
      // spawn() fails with ENOENT if cwd doesn't exist, even if executable exists
      let workingDir = session.workingDirectory;
      if (!existsSync(workingDir)) {
        console.log('[ClaudeAgentService] Working directory does not exist:', workingDir);
        console.log('[ClaudeAgentService] Using /tmp as fallback');
        workingDir = '/tmp';
      }
      console.log('[ClaudeAgentService] Using working directory:', workingDir);

      const queryResult = query({
        prompt: message,
        options: {
          pathToClaudeCodeExecutable: cliPath,
          executable: nodeExecutable, // Use the same node running this service
          model: session.model,
          cwd: workingDir,
          permissionMode: session.permissionMode as any,
          allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
          systemPrompt: {
            type: 'preset' as const,
            preset: 'claude_code' as const
          },
          settingSources: ['user' as const, 'project' as const],
          env: queryEnv
        }
      });
      console.log('[ClaudeAgentService] Query object created, starting iteration...');
      let chunkCount = 0;
      for await (const message of queryResult) {
        chunkCount++;
        console.log('[ClaudeAgentService] Received message #', chunkCount, '- Type:', message.type);

        // Handle assistant messages - these contain the actual content
        if (message.type === 'assistant') {
          console.log('[ClaudeAgentService] Assistant message:', JSON.stringify(message).substring(0, 200));

          // Extract content from the assistant message
          const apiMessage = (message as any).message;

          // Check for usage data
          if (apiMessage && apiMessage.usage) {
            console.log('[ClaudeAgentService] Token usage:', apiMessage.usage);
            // Send usage data to frontend
            res.write(`data: ${JSON.stringify({
              type: 'usage',
              usage: apiMessage.usage,
              timestamp: new Date().toISOString()
            })}\n\n`);
          }

          if (apiMessage && apiMessage.content) {
            for (const contentBlock of apiMessage.content) {
              if (contentBlock.type === 'text') {
                console.log('[ClaudeAgentService] Sending text content:', contentBlock.text.substring(0, 100));
                assistantMessage.content += contentBlock.text;
                // Send content chunk
                res.write(`data: ${JSON.stringify({
                  type: 'content',
                  content: contentBlock.text,
                  timestamp: new Date().toISOString()
                })}\n\n`);
              } else if (contentBlock.type === 'tool_use') {
                console.log('[ClaudeAgentService] Tool use:', contentBlock.name);
                const toolUse = {
                  id: contentBlock.id,
                  name: contentBlock.name,
                  input: contentBlock.input,
                  status: 'running',
                  timestamp: new Date().toISOString()
                };
                assistantMessage.toolUses.push(toolUse);
                // Send tool use chunk
                res.write(`data: ${JSON.stringify({
                  type: 'tool_use',
                  tool_use: toolUse,
                  timestamp: new Date().toISOString()
                })}\n\n`);
              }
            }
          }
        } else if (message.type === 'result') {
          console.log('[ClaudeAgentService] Result message');
          // Handle tool results
          const resultMsg = message as any;
          if (resultMsg.tool_use_id) {
            const toolUse = assistantMessage.toolUses.find((t: any) => t.id === resultMsg.tool_use_id);
            if (toolUse) {
              toolUse.status = resultMsg.is_error ? 'error' : 'completed';
              toolUse.output = resultMsg.result;
              if (resultMsg.is_error) {
                toolUse.error = String(resultMsg.result);
              }
            }
            // Send tool result chunk
            res.write(`data: ${JSON.stringify({
              type: 'tool_result',
              tool_id: resultMsg.tool_use_id,
              result: resultMsg.result,
              is_error: resultMsg.is_error || false,
              timestamp: new Date().toISOString()
            })}\n\n`);
          }
        }
      }

      // Add assistant message to history
      session.conversationHistory.push(assistantMessage);

      // Save conversation history to disk
      saveConversationHistory(session_id, session.conversationHistory);

      console.log('[ClaudeAgentService] Query loop finished. Total chunks:', chunkCount);

      // Send completion
      res.write(`data: ${JSON.stringify({
        type: 'done',
        message: assistantMessage,
        timestamp: new Date().toISOString()
      })}\n\n`);

      res.end();
      console.log('[ClaudeAgentService] Query completed for session:', session_id);
    } catch (error) {
      console.error('[ClaudeAgentService] Error in query:', error);
      res.write(`data: ${JSON.stringify({
        type: 'error',
        error: {
          message: (error as any)?.message || String(error),
          type: (error as any)?.constructor?.name || 'Error'
        },
        timestamp: new Date().toISOString()
      })}\n\n`);
      res.end();
    }
  } catch (error) {
    console.error('[ClaudeAgentService] Send message error:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: (error as any)?.message || String(error) });
    }
  }
});

// Get conversation history
server.get('/conversation/:session_id', async (req: Request, res: Response) => {
  try {
    const { session_id } = req.params;
    const session = sessions.get(session_id);

    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    res.json({
      success: true,
      conversation_history: session.conversationHistory
    });
  } catch (error) {
    console.error('[ClaudeAgentService] Get conversation error:', error);
    res.status(500).json({ success: false, error: (error as any)?.message || String(error) });
  }
});

// Delete session
server.delete('/session/:session_id', async (req: Request, res: Response) => {
  try {
    const { session_id } = req.params;
    const deleted = sessions.delete(session_id);

    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    console.log('[ClaudeAgentService] Deleted session:', session_id);
    res.json({ success: true, message: 'Session deleted' });
  } catch (error) {
    console.error('[ClaudeAgentService] Delete session error:', error);
    res.status(500).json({ success: false, error: (error as any)?.message || String(error) });
  }
});

// Health check
server.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'running',
    sessions: sessions.size,
    api_key_configured: !!apiKey
  });
});

// Start server
const PORT = process.env.CLAUDE_AGENT_SERVICE_PORT || 3457;
server.listen(PORT, '127.0.0.1', () => {
  console.log(`[ClaudeAgentService] Server running on http://localhost:${PORT}`);

  // Auto-initialize if ANTHROPIC_API_KEY is set in environment
  if (process.env.ANTHROPIC_API_KEY) {
    apiKey = process.env.ANTHROPIC_API_KEY;
    console.log('[ClaudeAgentService] Auto-initialized with API key from ANTHROPIC_API_KEY environment variable');
    console.log(`[ClaudeAgentService] Initialized with model: ${defaultModel}`);
  } else {
    console.log('[ClaudeAgentService] Waiting for initialization via /initialize endpoint...');
    console.log('[ClaudeAgentService] Set ANTHROPIC_API_KEY environment variable for auto-initialization');
  }
});