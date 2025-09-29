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
        const botToken = apiKeyService.getKey('slack-bot-token');
        const signingSecret = apiKeyService.getKey('slack-signing-secret');
        const appToken = apiKeyService.getKey('slack-app-token');
        const channel = localStorage.getItem('slack-channel') || 'sensei-approvals';
        const enabled = localStorage.getItem('slack-enabled') === 'true';

        console.log('📋 Slack config from storage:', {
          hasBotToken: !!botToken,
          hasSigningSecret: !!signingSecret,
          hasAppToken: !!appToken,
          channel,
          enabled
        });

        if (!botToken || !signingSecret || !appToken) {
          console.log('❌ Slack credentials not configured');
          return false;
        }

        config = {
          botToken,
          signingSecret,
          appToken,
          channel,
          enabled
        };
      }

      if (!config.enabled) {
        console.log('⚠️ Slack integration is disabled in config');
        return false;
      }

      this.config = config;

      // Start the Node.js Slack service if not already started
      if (!this.serviceStarted) {
        try {
          console.log('🚀 Starting Slack service process...');
          await invoke('start_slack_service');
          this.serviceStarted = true;
          console.log('⏳ Waiting for Slack service to be ready (2s)...');
          // Give the service time to start
          await new Promise(resolve => setTimeout(resolve, 2000));
          console.log('✅ Slack service process started');
        } catch (error) {
          console.error('❌ Failed to start Slack service process:', error);
          console.error('💡 Make sure Node.js is installed and dependencies are installed:');
          console.error('   cd src-tauri/scripts && npm install');
          return false;
        }
      }

      // Initialize Slack with config (convert to snake_case for Rust)
      try {
        await invoke('initialize_slack', {
          config: {
            bot_token: config.botToken,
            signing_secret: config.signingSecret,
            app_token: config.appToken,
            channel: config.channel,
            enabled: config.enabled
          }
        });
        this.isInitialized = true;
        console.log('⚡️ Slack integration initialized successfully!');

        return true;
      } catch (error) {
        console.error('Failed to initialize Slack:', error);
        return false;
      }
    } catch (error) {
      console.error('Failed to initialize Slack:', error);
      this.isInitialized = false;
      return false;
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
      console.log('📤 Sending approval request to Slack service...');
      // Convert the recommendation to a JSON-serializable format
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
        serverId: request.serverId,
        sessionId: request.sessionId,
        projectName: request.projectName
      };

      await invoke('send_slack_approval', { request: serializedRequest });
      console.log('Slack approval request sent');
      return true;
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
      await invoke('send_slack_message', { message: options });
      return true;
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
      return await invoke('get_slack_status');
    } catch (error) {
      console.error('Failed to get Slack status:', error);
      return null;
    }
  }
}

export const slackService = SlackService.getInstance();