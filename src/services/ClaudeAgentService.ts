/**
 * Claude Agent Service
 * Manages communication with the Claude Agent HTTP service via Tauri commands
 */

import { invoke } from '@tauri-apps/api/core';

export interface ClaudeAgentHealth {
  success: boolean;
  status: string;
  sessions: number;
  api_key_configured: boolean;
}

class ClaudeAgentService {
  private static instance: ClaudeAgentService;

  private constructor() {}

  public static getInstance(): ClaudeAgentService {
    if (!ClaudeAgentService.instance) {
      ClaudeAgentService.instance = new ClaudeAgentService();
    }
    return ClaudeAgentService.instance;
  }

  /**
   * Initialize the Claude Agent service with an API key
   */
  async initialize(apiKey: string, defaultModel?: string): Promise<void> {
    try {
      await invoke('initialize_claude_agent', {
        apiKey,
        model: defaultModel
      });
      console.log('Claude Agent service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Claude Agent:', error);
      throw error;
    }
  }

  /**
   * Check the health status of the Claude Agent service
   */
  async healthCheck(): Promise<ClaudeAgentHealth> {
    try {
      const health = await invoke<ClaudeAgentHealth>('get_claude_agent_health');
      return health;
    } catch (error) {
      console.error('Health check failed:', error);
      throw error;
    }
  }

  /**
   * Check if the service is configured with an API key
   */
  async isConfigured(): Promise<boolean> {
    try {
      const health = await this.healthCheck();
      return health.api_key_configured;
    } catch (error) {
      console.error('Failed to check if service is configured:', error);
      return false;
    }
  }
}

// Export singleton instance
export const claudeAgentService = ClaudeAgentService.getInstance();