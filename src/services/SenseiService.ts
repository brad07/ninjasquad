import { senseiAPI } from '../api/sensei';

export interface SenseiConfig {
  enabled: boolean;
  model: string;
  systemPrompt: string;
  autoExecute: boolean;
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface SenseiRecommendation {
  id: string;
  timestamp: Date;
  input: string;
  recommendation: string;
  command?: string;
  confidence: number;
  executed?: boolean;
}

export interface SenseiSession {
  serverId: string;
  sessionId: string;
  config: SenseiConfig;
  recommendations: SenseiRecommendation[];
  outputBuffer: string[];
  lastAnalyzedIndex: number;
}

const DEFAULT_SYSTEM_PROMPT = `You are Sensei, an AI assistant helping developers with OpenCode sessions.
Analyze the terminal output and provide helpful recommendations for what to do next.
When suggesting commands, format them clearly so they can be optionally executed automatically.

Guidelines:
- Be concise and actionable
- Focus on the most recent output
- Suggest specific commands when appropriate
- Consider the context of the current task
- Identify errors and suggest fixes
- Recommend next steps in the development workflow

Format your response as JSON with the following structure:
{
  "recommendation": "Your recommendation text here",
  "command": "optional command to execute",
  "confidence": 0.0 to 1.0
}`;

class SenseiService {
  private sessions: Map<string, SenseiSession> = new Map();
  private bufferSize = 50; // Keep last 50 lines of output
  private analysisThrottle = 2000; // Analyze every 2 seconds max
  private lastAnalysis: Map<string, number> = new Map();

  constructor() {
    this.loadConfigurations();
  }

  private loadConfigurations() {
    // Load saved configurations from localStorage
    const saved = localStorage.getItem('sensei-configs');
    if (saved) {
      try {
        // const configs = JSON.parse(saved);
        // Restore configurations if needed
        JSON.parse(saved); // Parse to validate but don't use yet
      } catch (error) {
        console.error('Failed to load Sensei configurations:', error);
      }
    }
  }

  private saveConfigurations() {
    // Save configurations to localStorage
    const configs: Record<string, SenseiConfig> = {};
    this.sessions.forEach((session, key) => {
      configs[key] = session.config;
    });
    localStorage.setItem('sensei-configs', JSON.stringify(configs));
  }

  public initializeSession(serverId: string, sessionId: string, config?: Partial<SenseiConfig>) {
    const defaultConfig: SenseiConfig = {
      enabled: false,
      model: 'gpt-4-turbo-preview',
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      autoExecute: false,
      temperature: 0.7,
      maxTokens: 500,
      ...config
    };

    const session: SenseiSession = {
      serverId,
      sessionId,
      config: defaultConfig,
      recommendations: [],
      outputBuffer: [],
      lastAnalyzedIndex: 0
    };

    const key = `${serverId}-${sessionId}`;
    this.sessions.set(key, session);
    this.saveConfigurations();

    return session;
  }

  public updateConfig(serverId: string, sessionId: string, config: Partial<SenseiConfig>) {
    const key = `${serverId}-${sessionId}`;
    const session = this.sessions.get(key);
    if (!session) return;

    session.config = { ...session.config, ...config };
    this.saveConfigurations();
  }

  public async appendOutput(serverId: string, sessionId: string, output: string) {
    const key = `${serverId}-${sessionId}`;
    const session = this.sessions.get(key);
    if (!session || !session.config.enabled) return;

    // Add to buffer
    const lines = output.split('\n').filter(line => line.trim());
    session.outputBuffer.push(...lines);

    // Keep buffer size limited
    if (session.outputBuffer.length > this.bufferSize) {
      session.outputBuffer = session.outputBuffer.slice(-this.bufferSize);
    }

    // Check if we should analyze (throttled)
    const now = Date.now();
    const lastTime = this.lastAnalysis.get(key) || 0;

    if (now - lastTime > this.analysisThrottle) {
      this.lastAnalysis.set(key, now);
      await this.analyzeOutput(serverId, sessionId);
    }
  }

  private async analyzeOutput(serverId: string, sessionId: string) {
    const key = `${serverId}-${sessionId}`;
    const session = this.sessions.get(key);
    if (!session) return;

    // Get unanalyzed output
    const newOutput = session.outputBuffer.slice(session.lastAnalyzedIndex);
    if (newOutput.length === 0) return;

    session.lastAnalyzedIndex = session.outputBuffer.length;

    try {
      // Prepare context
      const context = newOutput.join('\n');

      // Use the API to analyze (it will handle missing API key)
      const response = await senseiAPI.analyzeOutput({
        output: context,
        systemPrompt: session.config.systemPrompt,
        model: session.config.model,
        temperature: session.config.temperature || 0.7,
        maxTokens: session.config.maxTokens || 500,
        apiKey: session.config.apiKey || '',
      });

      // Create recommendation from response
      const recommendation: SenseiRecommendation = {
        id: `rec-${Date.now()}`,
        timestamp: new Date(),
        input: context,
        recommendation: response.recommendation,
        command: response.command,
        confidence: response.confidence,
        executed: false
      };

      session.recommendations.push(recommendation);

      // Emit event for UI update
      this.emitRecommendation(serverId, sessionId, recommendation);

      // Auto-execute if enabled and confidence is high
      if (session.config.autoExecute && recommendation.command && recommendation.confidence > 0.7) {
        await this.executeRecommendation(serverId, sessionId, recommendation.id);
      }

    } catch (error) {
      console.error('Failed to analyze output:', error);

      // Create an error recommendation to show in the UI
      const errorRecommendation: SenseiRecommendation = {
        id: `rec-${Date.now()}`,
        timestamp: new Date(),
        input: '',
        recommendation: `Analysis error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        confidence: 0,
        executed: false
      };

      session.recommendations.push(errorRecommendation);
      this.emitRecommendation(serverId, sessionId, errorRecommendation);
    }
  }

  public async executeRecommendation(serverId: string, sessionId: string, recommendationId: string) {
    const key = `${serverId}-${sessionId}`;
    const session = this.sessions.get(key);
    if (!session) return;

    const recommendation = session.recommendations.find(r => r.id === recommendationId);
    if (!recommendation || !recommendation.command) return;

    // Mark as executed
    recommendation.executed = true;

    // Emit event for terminal to execute command
    window.dispatchEvent(new CustomEvent('sensei-execute', {
      detail: {
        serverId,
        sessionId,
        command: recommendation.command
      }
    }));
  }

  private emitRecommendation(serverId: string, sessionId: string, recommendation: SenseiRecommendation) {
    window.dispatchEvent(new CustomEvent('sensei-recommendation', {
      detail: {
        serverId,
        sessionId,
        recommendation
      }
    }));
  }

  public getSession(serverId: string, sessionId: string): SenseiSession | undefined {
    return this.sessions.get(`${serverId}-${sessionId}`);
  }

  public getRecommendations(serverId: string, sessionId: string): SenseiRecommendation[] {
    const session = this.getSession(serverId, sessionId);
    return session?.recommendations || [];
  }

  public clearRecommendations(serverId: string, sessionId: string) {
    const session = this.getSession(serverId, sessionId);
    if (session) {
      session.recommendations = [];
    }
  }

  public toggleSensei(serverId: string, sessionId: string, enabled: boolean) {
    const session = this.getSession(serverId, sessionId);
    if (session) {
      session.config.enabled = enabled;
      this.saveConfigurations();
    }
  }

  public isEnabled(serverId: string, sessionId: string): boolean {
    const session = this.getSession(serverId, sessionId);
    return session?.config.enabled || false;
  }

  public cleanup(serverId: string, sessionId: string) {
    const key = `${serverId}-${sessionId}`;
    this.sessions.delete(key);
    this.lastAnalysis.delete(key);
  }
}

// Export singleton instance
export const senseiService = new SenseiService();