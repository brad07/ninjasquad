import { invoke } from '@tauri-apps/api/core';

// Claude Agent SDK service interfaces
// Uses Claude CLI (which uses the Agent SDK internally)
export interface ClaudeCodeSession {
  id: string;
  workingDirectory?: string;
  conversationHistory: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
  }>;
  processId?: number;
}

export interface ClaudeCodeConfig {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  workingDirectory?: string;
}

class ClaudeCodeSDKService {
  private sessions: Map<string, ClaudeCodeSession> = new Map();
  private model: string = 'claude-sonnet-4-20250514';

  async initialize(config: ClaudeCodeConfig): Promise<void> {
    if (config.model) {
      this.model = config.model;
    }
  }

  async createSession(sessionId?: string, workingDirectory?: string): Promise<string> {
    // If we have a sessionId, check if it already exists locally
    if (sessionId && this.sessions.has(sessionId)) {
      console.log('Session already exists locally:', sessionId);
      return sessionId;
    }

    const projectId = sessionId || `project-${Date.now()}`;

    console.log('Creating Claude Code session:', {
      projectId,
      workingDirectory,
      model: this.model
    });

    try {
      // Always create a new session on backend, even if we have an old ID
      // The backend will generate a new unique session ID
      const backendSessionId = await invoke<string>('claude_create_session', {
        projectId,
        workingDirectory,
        model: this.model
      });

      const session: ClaudeCodeSession = {
        id: backendSessionId,
        workingDirectory,
        conversationHistory: []
      };

      // Store with the backend's session ID
      this.sessions.set(backendSessionId, session);
      console.log('Session created with backend ID:', backendSessionId);

      // IMPORTANT: Return the backend's session ID, not the requested one
      return backendSessionId;
    } catch (error) {
      console.error('Failed to create Claude session:', error);
      // Fallback to local session if backend fails
      const id = sessionId || `claude-session-${Date.now()}`;
      const session: ClaudeCodeSession = {
        id,
        workingDirectory,
        conversationHistory: []
      };
      this.sessions.set(id, session);
      return id;
    }
  }

  async sendMessage(sessionId: string, message: string): Promise<string> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    console.log('Claude sendMessage - session details:', {
      sessionId,
      hasWorkingDirectory: !!session.workingDirectory,
      workingDirectory: session.workingDirectory,
      fullSession: session,
      allSessions: Array.from(this.sessions.keys())
    });

    try {
      // Add user message to history
      session.conversationHistory.push({
        role: 'user',
        content: message,
        timestamp: new Date().toISOString()
      });

      // Use Claude CLI through a Tauri command
      // This will use the system's installed Claude with its existing authentication
      // (Claude CLI uses the Agent SDK internally)
      const response = await this.executeClaudeCommand(message, session.workingDirectory, sessionId);

      // Add assistant response to history
      session.conversationHistory.push({
        role: 'assistant',
        content: response,
        timestamp: new Date().toISOString()
      });

      return response;
    } catch (error) {
      console.error('Error sending message to Claude Code:', error);
      throw error;
    }
  }

  async streamMessage(sessionId: string, message: string, onChunk: (chunk: string) => void): Promise<string> {
    console.log('streamMessage called with:', {
      sessionId,
      message: message.substring(0, 100),
      sessionsAvailable: Array.from(this.sessions.keys()),
      sessionExists: this.sessions.has(sessionId)
    });

    let session = this.sessions.get(sessionId);
    if (!session) {
      console.warn('Session not found locally, checking backend:', sessionId);

      // Try to get session info from backend
      try {
        const backendSession = await invoke<any>('claude_get_session', { sessionId });
        if (backendSession) {
          // Recreate local session from backend info
          session = {
            id: sessionId,
            workingDirectory: backendSession.working_directory,
            conversationHistory: []
          };
          this.sessions.set(sessionId, session);
          console.log('Session recovered from backend');
        }
      } catch (error) {
        console.error('Failed to get session from backend:', error);
      }

      if (!session) {
        console.error('Session not found:', {
          sessionId,
          availableSessions: Array.from(this.sessions.keys())
        });
        throw new Error(`Session ${sessionId} not found`);
      }
    }

    console.log('Session found:', {
      sessionId,
      workingDirectory: session.workingDirectory,
      historyLength: session.conversationHistory.length
    });

    try {
      // Add user message to history
      session.conversationHistory.push({
        role: 'user',
        content: message,
        timestamp: new Date().toISOString()
      });

      console.log('Calling executeClaudeCommand...');
      // For now, use non-streaming until we implement proper streaming with Claude CLI
      const response = await this.executeClaudeCommand(message, session.workingDirectory, sessionId);
      console.log('executeClaudeCommand returned:', {
        responseLength: response.length,
        responsePreview: response.substring(0, 100)
      });

      // Simulate streaming by chunking the response
      const chunkSize = 50;
      let fullResponse = '';
      for (let i = 0; i < response.length; i += chunkSize) {
        const chunk = response.slice(i, Math.min(i + chunkSize, response.length));
        onChunk(chunk);
        fullResponse += chunk;
        await new Promise(resolve => setTimeout(resolve, 10)); // Small delay to simulate streaming
      }

      // Add assistant response to history
      session.conversationHistory.push({
        role: 'assistant',
        content: fullResponse,
        timestamp: new Date().toISOString()
      });

      return fullResponse;
    } catch (error) {
      console.error('Error streaming message to Claude Agent:', error);
      throw error;
    }
  }

  private async executeClaudeCommand(prompt: string, workingDirectory?: string, sessionId?: string): Promise<string> {
    try {
      console.log('executeClaudeCommand called with:', {
        sessionId,
        promptLength: prompt.length,
        promptPreview: prompt.substring(0, 200)
      });

      if (!sessionId) {
        throw new Error('Session ID required for Claude command execution');
      }

      // Use the persistent session
      try {
        console.time('claude_send_message');
        const response = await invoke<string>('claude_send_message', {
          sessionId,
          message: prompt
        });
        console.timeEnd('claude_send_message');
        console.log('Claude response received, length:', response.length);
        return response;
      } catch (invokeError) {
        console.timeEnd('claude_send_message');
        console.error('Invoke error:', invokeError);

        // Fallback to legacy execute_claude_code if new API fails
        console.warn('Falling back to legacy execute_claude_code');
        const response = await invoke<string>('execute_claude_code', {
          prompt,
          model: this.model,
          workingDirectory
        });
        return response;
      }
    } catch (error) {
      console.error('Error calling Claude backend:', error);
      throw error;
    }
  }

  async executeCommand(sessionId: string, command: string, args?: any): Promise<any> {
    // For now, all commands go through the regular message interface
    return await this.sendMessage(sessionId, command);
  }

  getSession(sessionId: string): ClaudeCodeSession | undefined {
    return this.sessions.get(sessionId);
  }

  updateSessionWorkingDirectory(sessionId: string, workingDirectory: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.workingDirectory = workingDirectory;
      console.log(`Updated session ${sessionId} working directory to: ${workingDirectory}`);
    } else {
      console.warn(`Session ${sessionId} not found for working directory update`);
    }
  }

  listSessions(): string[] {
    return Array.from(this.sessions.keys());
  }

  async closeSession(sessionId: string): Promise<void> {
    try {
      // Close the backend session
      await invoke('claude_close_session', { sessionId });
      console.log('Backend session closed:', sessionId);
    } catch (error) {
      console.error('Failed to close backend session:', error);
    }
    this.sessions.delete(sessionId);
  }

  isConfigured(): boolean {
    // Claude CLI handles its own authentication
    // Check if Claude CLI is available on the system
    return true; // Assume it's configured if the user selected this plugin
  }

  getModel(): string {
    return this.model;
  }

  setModel(model: string): void {
    this.model = model;
  }
}

// Export singleton instance
export const claudeCodeSDKService = new ClaudeCodeSDKService();