import { senseiAPI } from '../api/sensei';
import { apiKeyService } from './ApiKeyService';

export interface SenseiConfig {
  enabled: boolean;
  model: string;
  systemPrompt: string;
  autoExecute: boolean;
  apiKey?: string; // Deprecated - kept for backward compatibility
  temperature?: number;
  maxTokens?: number;
}

export interface SenseiRecommendation {
  id: string;
  timestamp: Date;
  source: 'sensei' | 'claude-code' | 'agent' | string; // Source of the recommendation
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

const DEFAULT_SYSTEM_PROMPT = `You are SensAI, an AI assistant helping developers with OpenCode sessions.
Analyze the terminal output and provide helpful recommendations for what to do next.

Guidelines:
- Be concise and actionable
- Focus on the most recent output
- Consider the context of the current task
- Identify errors and suggest fixes
- Recommend next steps in the development workflow
- Provide clear guidance without specifying exact commands

Format your response as JSON with the following structure:
{
  "recommendation": "Your recommendation text here",
  "confidence": 0.0 to 1.0
}`;

class SenseiService {
  private sessions: Map<string, SenseiSession> = new Map();
  private bufferSize = 50; // Keep last 50 lines of output
  private analysisThrottle = 500; // Analyze every 500ms max for faster response
  private lastAnalysis: Map<string, number> = new Map();

  constructor() {
    this.loadConfigurations();
  }

  private loadConfigurations() {
    // Load saved configurations from localStorage
    const saved = localStorage.getItem('sensei-configs');
    if (saved) {
      try {
        const configs = JSON.parse(saved);
        // Restore configurations for each session
        Object.entries(configs).forEach(([key, config]) => {
          const [serverId, sessionId] = key.split('-');
          if (serverId && sessionId) {
            const session: SenseiSession = {
              serverId,
              sessionId,
              config: config as SenseiConfig,
              recommendations: [],
              outputBuffer: [],
              lastAnalyzedIndex: 0
            };
            this.sessions.set(key, session);
          }
        });
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
    const key = `${serverId}-${sessionId}`;

    // Check if session already exists (might be loaded from localStorage)
    const existingSession = this.sessions.get(key);
    if (existingSession) {
      // If session exists, merge with new config
      if (config) {
        existingSession.config = { ...existingSession.config, ...config };
        this.saveConfigurations();
      }
      return existingSession;
    }

    // Only use default system prompt if none provided and no saved prompt exists
    const defaultConfig: SenseiConfig = {
      enabled: false,
      model: 'gpt-5',
      systemPrompt: config?.systemPrompt !== undefined ? config.systemPrompt : DEFAULT_SYSTEM_PROMPT,
      autoExecute: false,
      temperature: 1,
      maxTokens: 5000,
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

    this.sessions.set(key, session);
    this.saveConfigurations();

    return session;
  }

  public updateConfig(serverId: string, sessionId: string, config: Partial<SenseiConfig>) {
    const key = `${serverId}-${sessionId}`;
    let session = this.sessions.get(key);

    if (!session) {
      // If session doesn't exist, create it with the provided config
      session = this.initializeSession(serverId, sessionId, config);
    } else {
      // Update existing session config
      session.config = { ...session.config, ...config };
      this.saveConfigurations();
    }
  }

  public async appendOutput(serverId: string, sessionId: string, output: string, immediate: boolean = false) {
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

    // If immediate analysis is requested (e.g., for agent complete responses), analyze now
    if (immediate) {
      this.lastAnalysis.set(key, Date.now());
      await this.analyzeOutput(serverId, sessionId);
    } else {
      // Check if we should analyze (throttled for streaming output)
      const now = Date.now();
      const lastTime = this.lastAnalysis.get(key) || 0;

      if (now - lastTime > this.analysisThrottle) {
        this.lastAnalysis.set(key, now);
        await this.analyzeOutput(serverId, sessionId);
      }
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

      // Get the appropriate API key for the model's provider
      const providerInfo = apiKeyService.getProviderForModel(session.config.model);
      const apiKey = providerInfo ? apiKeyService.getKey(providerInfo.id) :
                     session.config.apiKey || ''; // Fallback to old config for compatibility

      // Use the API to analyze (it will handle missing API key)
      const response = await senseiAPI.analyzeOutput({
        output: context,
        systemPrompt: session.config.systemPrompt,
        model: session.config.model,
        temperature: session.config.temperature || 1,
        maxTokens: session.config.maxTokens || 5000,
        apiKey: apiKey || '',
      });

      // Create recommendation from response
      const recommendation: SenseiRecommendation = {
        id: `sensei-rec-${Date.now()}`,
        timestamp: new Date(),
        source: 'sensei',
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
        id: `sensei-rec-${Date.now()}`,
        timestamp: new Date(),
        source: 'sensei',
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

  /**
   * Add an agent recommendation directly (for Claude Code responses)
   * This bypasses the analysis step since the agent already provided the recommendation
   */
  public async addAgentRecommendation(
    serverId: string,
    sessionId: string,
    agentResponse: string,
    source: string = 'claude-code'
  ) {
    const key = `${serverId}-${sessionId}`;
    const session = this.sessions.get(key);
    if (!session || !session.config.enabled) return;

    console.log('🤖 Adding agent recommendation to Sensei');

    // Use Sensei to analyze the agent's response and suggest next steps
    try {
      const providerInfo = apiKeyService.getProviderForModel(session.config.model);
      const apiKey = providerInfo ? apiKeyService.getKey(providerInfo.id) : session.config.apiKey || '';

      const analysisPrompt = `${session.config.systemPrompt}

The AI agent just responded with:
${agentResponse}

Analyze this response and provide a recommendation for what the developer should do next.`;

      const response = await senseiAPI.analyzeOutput({
        output: agentResponse,
        systemPrompt: analysisPrompt,
        model: session.config.model,
        temperature: session.config.temperature || 1,
        maxTokens: session.config.maxTokens || 5000,
        apiKey: apiKey || '',
      });

      const recommendation: SenseiRecommendation = {
        id: `sensei-agent-${Date.now()}`,
        timestamp: new Date(),
        source,
        input: agentResponse,
        recommendation: response.recommendation,
        command: response.command,
        confidence: response.confidence,
        executed: false
      };

      session.recommendations.push(recommendation);
      this.emitRecommendation(serverId, sessionId, recommendation);

      // Auto-execute if enabled and confidence is high
      if (session.config.autoExecute && recommendation.command && recommendation.confidence > 0.7) {
        await this.executeRecommendation(serverId, sessionId, recommendation.id);
      }
    } catch (error) {
      console.error('Failed to analyze agent response:', error);
    }
  }

  /**
   * Get project knowledge context for agents
   * This provides relevant project information and recent recommendations
   */
  public getProjectContext(projectPath: string): string {
    // Find all sessions for this project path
    const projectSessions: SenseiSession[] = [];
    this.sessions.forEach((session) => {
      // Sessions might be related to the project
      projectSessions.push(session);
    });

    // Gather recent recommendations and knowledge
    const recentRecommendations = projectSessions
      .flatMap(s => s.recommendations)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 5); // Get last 5 recommendations

    if (recentRecommendations.length === 0) {
      return '';
    }

    let context = '## Recent Project Activity and Recommendations\n\n';
    recentRecommendations.forEach((rec, index) => {
      context += `${index + 1}. **${rec.timestamp.toLocaleTimeString()}**: ${rec.recommendation}\n`;
      if (rec.command) {
        context += `   - Suggested command: \`${rec.command}\`\n`;
      }
    });

    return context;
  }

  /**
   * Store knowledge from agent conversations
   * This helps build up project knowledge over time
   */
  public storeAgentKnowledge(projectPath: string, question: string, answer: string, agentName: string = 'agent') {
    // Create a special session for agent knowledge
    const knowledgeKey = `${agentName}-knowledge-${projectPath}`;
    let session = this.sessions.get(knowledgeKey);

    if (!session) {
      session = this.initializeSession(agentName, projectPath, {
        enabled: true,
        model: `${agentName}-knowledge`,
        systemPrompt: `${agentName} Knowledge Base`
      });
    }

    // Store as a recommendation for now (can be enhanced later)
    const recommendation: SenseiRecommendation = {
      id: `${agentName}-${Date.now()}`,
      timestamp: new Date(),
      source: agentName,
      input: question,
      recommendation: answer,
      confidence: 1.0,
      executed: false
    };

    session.recommendations.push(recommendation);

    // Keep only last 20 Q&A pairs
    if (session.recommendations.length > 20) {
      session.recommendations = session.recommendations.slice(-20);
    }

    this.sessions.set(knowledgeKey, session);
    this.saveConfigurations();
  }

  /**
   * Add an agent/plugin response directly as a Sensei recommendation
   * This bypasses the need for an additional API call since agent responses
   * are already intelligent and actionable
   */
  public addAgentRecommendation(
    serverId: string,
    sessionId: string,
    userInput: string,
    agentResponse: string,
    agentName: string = 'agent',
    confidence: number = 0.95,
    recommendationId?: string
  ) {
    const key = `${serverId}-${sessionId}`;
    let session = this.sessions.get(key);

    if (!session) {
      // Create session if it doesn't exist
      session = this.initializeSession(serverId, sessionId, { enabled: true });
    }

    // Use provided ID or generate new one
    const recId = recommendationId || `${agentName}-rec-${Date.now()}`;

    // Check if recommendation already exists (for updates)
    const existingIndex = session.recommendations.findIndex(r => r.id === recId);

    const recommendation: SenseiRecommendation = {
      id: recId,
      timestamp: new Date(),
      source: agentName,
      input: userInput,
      recommendation: agentResponse,
      confidence: confidence,
      executed: false
    };

    if (existingIndex >= 0) {
      // Update existing recommendation
      session.recommendations[existingIndex] = recommendation;
    } else {
      // Add new recommendation
      session.recommendations.push(recommendation);
    }

    // Emit event for UI update
    this.emitRecommendation(serverId, sessionId, recommendation);
  }

  /**
   * Start a streaming agent recommendation
   * Returns an ID that can be used to update the recommendation as chunks arrive
   */
  public startStreamingRecommendation(
    serverId: string,
    sessionId: string,
    userInput: string,
    agentName: string = 'agent'
  ): string {
    const recommendationId = `${agentName}-rec-${Date.now()}`;

    // Add initial empty recommendation
    this.addAgentRecommendation(
      serverId,
      sessionId,
      userInput,
      '...',  // Placeholder while streaming
      agentName,
      0.95,
      recommendationId
    );

    return recommendationId;
  }

  /**
   * Update a streaming recommendation with new content
   */
  public updateStreamingRecommendation(
    serverId: string,
    sessionId: string,
    recommendationId: string,
    userInput: string,
    agentResponse: string,
    agentName: string = 'agent'
  ) {
    this.addAgentRecommendation(
      serverId,
      sessionId,
      userInput,
      agentResponse,
      agentName,
      0.95,
      recommendationId
    );
  }

  public cleanup(serverId: string, sessionId: string) {
    const key = `${serverId}-${sessionId}`;
    this.sessions.delete(key);
    this.lastAnalysis.delete(key);
  }
}

// Export singleton instance
export const senseiService = new SenseiService();