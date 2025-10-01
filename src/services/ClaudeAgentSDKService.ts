import type {
  AgentSession,
  ConversationMessage,
  StreamChunk,
  PermissionMode,
  SDKServiceConfig,
  ToolUseInfo
} from '../types/claude-agent-sdk';
import { conversationHistoryService } from './ConversationHistoryService';

/**
 * Service for Claude Agent SDK integration via Node.js backend
 * Communicates with claude-agent-service.ts running on localhost
 */
class ClaudeAgentSDKService {
  private sessions: Map<string, AgentSession> = new Map();
  private serviceUrl: string = 'http://localhost:3457';
  private apiKey: string | null = null;
  private defaultModel: string = 'claude-sonnet-4-5-20250929';
  private defaultPermissionMode: PermissionMode = 'default';

  /**
   * Initialize the service with API key and configuration
   */
  async initialize(config: SDKServiceConfig): Promise<void> {
    this.apiKey = config.apiKey;
    if (config.defaultModel) {
      this.defaultModel = config.defaultModel;
    }
    if (config.defaultPermissionMode) {
      this.defaultPermissionMode = config.defaultPermissionMode;
    }

    // Initialize the backend service
    const response = await fetch(`${this.serviceUrl}/initialize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: this.apiKey,
        default_model: this.defaultModel,
        default_permission_mode: this.defaultPermissionMode
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to initialize service');
    }

    console.log('[ClaudeAgentSDK] Initialized with model:', this.defaultModel);
  }

  /**
   * Check if service is configured
   */
  isConfigured(): boolean {
    return this.apiKey !== null;
  }

  /**
   * Check if the backend service is available
   */
  async checkServiceHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.serviceUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(2000) // 2 second timeout
      });
      return response.ok;
    } catch (error) {
      console.warn('[ClaudeAgentSDK] Service health check failed:', error);
      return false;
    }
  }

  /**
   * Create a new session
   * @param restore - If true, backend will restore conversation history from disk
   */
  async createSession(workingDirectory: string, model?: string, sessionId?: string, restore?: boolean): Promise<string> {
    const id = sessionId || `agent-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    const response = await fetch(`${this.serviceUrl}/create-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: id,
        working_directory: workingDirectory,
        model: model || this.defaultModel,
        restore: restore || false
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create session');
    }

    const responseData = await response.json();

    const session: AgentSession = {
      id,
      workingDirectory,
      model: model || this.defaultModel,
      permissionMode: this.defaultPermissionMode,
      conversationHistory: [],
      createdAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString()
    };

    this.sessions.set(id, session);
    console.log('[ClaudeAgentSDK] Created session:', id, 'in', workingDirectory);
    if (responseData.restored_messages > 0) {
      console.log('[ClaudeAgentSDK] Restored', responseData.restored_messages, 'messages from disk');
    }

    return id;
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): AgentSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Update session permission mode
   */
  updatePermissionMode(sessionId: string, mode: PermissionMode): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.permissionMode = mode;
      console.log('[ClaudeAgentSDK] Updated permission mode for', sessionId, 'to', mode);
    }
  }

  /**
   * Stream a message and get responses via SSE from backend
   */
  async *streamMessage(
    sessionId: string,
    message: string,
    onToolUse?: (toolUse: ToolUseInfo) => Promise<boolean>
  ): AsyncGenerator<StreamChunk, void, undefined> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    try {
      console.log('[ClaudeAgentSDK] Starting stream for session:', sessionId);

      const response = await fetch(`${this.serviceUrl}/send-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          message: message
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to send message');
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      // Parse SSE stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE messages
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));

            if (data.type === 'content') {
              yield {
                type: 'content',
                content: data.content,
                timestamp: data.timestamp
              } as StreamChunk;
            } else if (data.type === 'tool_use') {
              yield {
                type: 'tool_use',
                toolUse: data.tool_use,
                timestamp: data.timestamp
              } as StreamChunk;
            } else if (data.type === 'tool_result') {
              yield {
                type: 'tool_result',
                toolId: data.tool_id,
                result: data.result,
                isError: data.is_error,
                timestamp: data.timestamp
              } as StreamChunk;
            } else if (data.type === 'usage') {
              yield {
                type: 'usage',
                usage: data.usage,
                timestamp: data.timestamp
              } as StreamChunk;
            } else if (data.type === 'error') {
              yield {
                type: 'error',
                error: data.error,
                timestamp: data.timestamp
              } as StreamChunk;
            } else if (data.type === 'done') {
              // Save conversation history to database
              const userMessageId = `msg-${Date.now()}-user`;
              const userTimestamp = new Date().toISOString();

              await conversationHistoryService.addMessage(
                userMessageId,
                sessionId,
                'user',
                message,
                userTimestamp
              );

              await conversationHistoryService.addMessage(
                data.message.id,
                sessionId,
                'assistant',
                data.message.content,
                data.message.timestamp
              );

              // Also update in-memory history for compatibility
              session.conversationHistory.push({
                id: userMessageId,
                role: 'user',
                content: message,
                timestamp: userTimestamp
              });
              session.conversationHistory.push(data.message);

              console.log('[ClaudeAgentSDK] Stream completed, messages saved to database');
              return;
            }
          }
        }
      }
    } catch (error) {
      console.error('[ClaudeAgentSDK] Error in query:', error);
      yield {
        type: 'error',
        error: {
          message: error instanceof Error ? error.message : String(error),
          type: error instanceof Error ? error.constructor.name : 'Error'
        },
        timestamp: new Date().toISOString()
      } as StreamChunk;
    }
  }

  /**
   * Close a session
   */
  async closeSession(sessionId: string): Promise<void> {
    try {
      const response = await fetch(`${this.serviceUrl}/session/${sessionId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        console.error('[ClaudeAgentSDK] Failed to delete session on backend');
      }

      // Remove session locally
      this.sessions.delete(sessionId);
      console.log('[ClaudeAgentSDK] Closed session:', sessionId);
    } catch (error) {
      console.error('[ClaudeAgentSDK] Close session error:', error);
      // Still remove locally even if backend call fails
      this.sessions.delete(sessionId);
    }
  }

  /**
   * List all sessions
   */
  listSessions(): AgentSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get conversation history for a session
   * Loads from database instead of in-memory
   */
  async getConversationHistory(sessionId: string): Promise<ConversationMessage[]> {
    try {
      return await conversationHistoryService.getHistory(sessionId);
    } catch (error) {
      console.error('[ClaudeAgentSDK] Failed to load history from database:', error);
      // Fallback to in-memory if database fails
      const session = this.sessions.get(sessionId);
      return session ? session.conversationHistory : [];
    }
  }
}

// Export singleton instance
export const claudeAgentSDKService = new ClaudeAgentSDKService();