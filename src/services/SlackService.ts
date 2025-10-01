import { invoke } from '@tauri-apps/api/core';
import { apiKeyService } from './ApiKeyService';
import { senseiService, type SenseiRecommendation } from './SenseiService';

export interface SlackConfig {
  botToken: string;
  signingSecret: string;
  appToken: string; // For socket mode
  channel: string;
  enabled: boolean;
}

export interface SlackApprovalRequest {
  recommendation: SenseiRecommendation;
  serverId: string;
  sessionId: string;
  projectName?: string;
}

class SlackService {
  private static instance: SlackService;
  private config: SlackConfig | null = null;
  private isInitialized = false;
  private serviceStarted = false;

  private constructor() {}

  static getInstance(): SlackService {
    if (!SlackService.instance) {
      SlackService.instance = new SlackService();
    }
    return SlackService.instance;
  }

  async initialize(config?: SlackConfig): Promise<boolean> {
    try {
      console.log('🔧 Initializing Slack service...');

      // Get config from API key service if not provided
      if (!config) {
        console.log('📖 Loading credentials from storage...');
        const botToken = apiKeyService.getKey('slack-bot-token');
        const signingSecret = apiKeyService.getKey('slack-signing-secret');
        const appToken = apiKeyService.getKey('slack-app-token');
        const channel = localStorage.getItem('slack-channel') || 'sensei-approvals';
        const enabled = localStorage.getItem('slack-enabled') === 'true';

        console.log('📋 Loaded from storage:', {
          botToken: botToken ? `${botToken.substring(0, 10)}... (${botToken.length} chars)` : 'MISSING',
          signingSecret: signingSecret ? `${signingSecret.substring(0, 10)}... (${signingSecret.length} chars)` : 'MISSING',
          appToken: appToken ? `${appToken.substring(0, 10)}... (${appToken.length} chars)` : 'MISSING',
          channel,
          enabled
        });

        if (!botToken || !signingSecret || !appToken) {
          console.log('❌ Slack credentials not configured - missing tokens');
          return false;
        }

        config = {
          botToken,
          signingSecret,
          appToken,
          channel,
          enabled
        };
      } else {
        console.log('📋 Using provided config:', {
          botToken: config.botToken ? `${config.botToken.substring(0, 10)}... (${config.botToken.length} chars)` : 'MISSING',
          signingSecret: config.signingSecret ? `${config.signingSecret.substring(0, 10)}... (${config.signingSecret.length} chars)` : 'MISSING',
          appToken: config.appToken ? `${config.appToken.substring(0, 10)}... (${config.appToken.length} chars)` : 'MISSING',
          channel: config.channel,
          enabled: config.enabled
        });
      }

      if (!config.enabled) {
        console.log('⚠️ Slack integration is disabled in config');
        return false;
      }

      this.config = config;

      // Check if service is already running by checking the status endpoint
      console.log('🔍 Checking if Slack service is already running...');
      try {
        const statusResponse = await fetch('http://localhost:3456/status');
        if (statusResponse.ok) {
          console.log('✅ Slack service is already running');
          this.serviceStarted = true;
        } else {
          throw new Error('Service not responding');
        }
      } catch (error) {
        // Service not running, try to start it
        console.log('🚀 Starting Slack service process...');
        try {
          await invoke('start_slack_service');
          this.serviceStarted = true;
          console.log('⏳ Waiting for Slack service to be ready (3s)...');
          // Give the service time to start
          await new Promise(resolve => setTimeout(resolve, 3000));
          console.log('✅ Slack service process started');
        } catch (startError) {
          console.error('❌ Failed to start Slack service process:', startError);
          console.error('💡 Make sure Node.js is installed and dependencies are installed:');
          console.error('   cd src-tauri/scripts && npm install');
          return false;
        }
      }

      // Initialize Slack with config - call service directly
      try {
        console.log('📤 Sending initialization request to Slack service...');
        const payload = {
          bot_token: config.botToken,
          signing_secret: config.signingSecret,
          app_token: config.appToken,
          channel: config.channel,
          enabled: config.enabled
        };
        console.log('📋 Payload:', {
          bot_token: config.botToken ? `${config.botToken.substring(0, 10)}...` : 'MISSING',
          signing_secret: config.signingSecret ? 'present' : 'MISSING',
          app_token: config.appToken ? `${config.appToken.substring(0, 10)}...` : 'MISSING',
          channel: config.channel,
          enabled: config.enabled
        });

        const response = await fetch('http://localhost:3456/initialize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        console.log('📬 Response status:', response.status);

        if (response.ok) {
          const result = await response.json();
          console.log('📬 Response body:', result);
          if (result.success) {
            this.isInitialized = true;
            console.log('⚡️ Slack integration initialized successfully!');
            return true;
          } else {
            const errorMsg = result.error || result.message || 'Unknown error';
            console.error('❌ Slack initialization failed:', errorMsg);
            throw new Error(errorMsg);
          }
        } else {
          let errorMsg = 'Unknown error';
          try {
            const result = await response.json();
            errorMsg = result.error || result.message || `HTTP ${response.status}`;
          } catch {
            errorMsg = await response.text() || `HTTP ${response.status}`;
          }
          console.error('❌ Slack initialization request failed:', response.status, errorMsg);
          throw new Error(errorMsg);
        }
      } catch (error) {
        console.error('❌ Failed to initialize Slack:', error);
        this.isInitialized = false;
        throw error;
      }
    } catch (error) {
      console.error('Failed to initialize Slack:', error);
      this.isInitialized = false;
      throw error;
    }
  }

  async sendApprovalRequest(request: SlackApprovalRequest): Promise<boolean> {
    console.log('📨 sendApprovalRequest called:', {
      isInitialized: this.isInitialized,
      hasConfig: !!this.config,
      configEnabled: this.config?.enabled
    });

    if (!this.isInitialized || !this.config) {
      console.error('❌ Slack not initialized, cannot send approval request');
      return false;
    }

    try {
      console.log('📤 Sending approval request to Slack service...', {
        serverId: request.serverId,
        sessionId: request.sessionId,
        projectName: request.projectName,
        recommendationId: request.recommendation.id
      });

      // Convert the recommendation to a JSON-serializable format with snake_case for Rust
      const serializedRequest = {
        recommendation: {
          id: request.recommendation.id,
          input: request.recommendation.input,
          recommendation: request.recommendation.recommendation,
          command: request.recommendation.command,
          confidence: request.recommendation.confidence,
          executed: request.recommendation.executed,
          timestamp: request.recommendation.timestamp
        },
        server_id: request.serverId || 'unknown',      // snake_case for Rust
        session_id: request.sessionId || 'unknown',    // snake_case for Rust
        project_name: request.projectName || 'Unknown Project' // snake_case for Rust
      };

      // Call service directly instead of through Rust
      const response = await fetch('http://localhost:3456/send-approval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(serializedRequest)
      });

      if (response.ok) {
        console.log('Slack approval request sent');
        return true;
      } else {
        console.error('Failed to send Slack approval, status:', response.status);
        return false;
      }
    } catch (error) {
      console.error('Failed to send Slack approval:', error);
      return false;
    }
  }

  async sendMessage(options: { text: string; blocks?: any[] }): Promise<boolean> {
    if (!this.isInitialized || !this.config) {
      return false;
    }

    try {
      // Call service directly instead of through Rust
      const response = await fetch('http://localhost:3456/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options)
      });

      if (response.ok) {
        const result = await response.json();
        return result.success;
      }
      return false;
    } catch (error) {
      console.error('Failed to send Slack message:', error);
      return false;
    }
  }

  async updateConfig(config: Partial<SlackConfig>) {
    // Save to localStorage and API key service
    if (config.botToken) {
      apiKeyService.setKey('slack-bot-token', config.botToken);
    }
    if (config.signingSecret) {
      apiKeyService.setKey('slack-signing-secret', config.signingSecret);
    }
    if (config.appToken) {
      apiKeyService.setKey('slack-app-token', config.appToken);
    }
    if (config.channel !== undefined) {
      localStorage.setItem('slack-channel', config.channel);
    }
    if (config.enabled !== undefined) {
      localStorage.setItem('slack-enabled', String(config.enabled));
    }

    // Re-initialize if enabled
    if (config.enabled) {
      await this.shutdown();
      await this.initialize();
    }
  }

  async shutdown() {
    try {
      await invoke('shutdown_slack');
      this.isInitialized = false;
      this.serviceStarted = false;
      console.log('Slack integration shut down');
    } catch (error) {
      console.error('Failed to shutdown Slack:', error);
    }
  }

  isEnabled(): boolean {
    return this.isInitialized && this.config?.enabled === true;
  }

  getConfig(): SlackConfig | null {
    return this.config;
  }

  async getStatus(): Promise<any> {
    try {
      // Call service directly instead of through Rust
      const response = await fetch('http://localhost:3456/status', {
        signal: AbortSignal.timeout(2000) // 2 second timeout
      });
      if (response.ok) {
        return await response.json();
      }
      return null;
    } catch (error) {
      // Don't log timeout/connection errors during startup - they're expected
      if (error.name !== 'AbortError' && error.name !== 'TypeError') {
        console.error('Failed to get Slack status:', error);
      }
      return null;
    }
  }
}

export const slackService = SlackService.getInstance();