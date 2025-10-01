import { senseiAPI } from '../api/sensei';
import { apiKeyService } from './ApiKeyService';
import { eventBus } from './EventBus';

export interface SenseiConfig {
  enabled: boolean;
  model: string;
  systemPrompt: string;
  autoApprove: boolean;
  apiKey?: string; // Deprecated - kept for backward compatibility
  temperature?: number;
  maxTokens?: number;
  confidenceThreshold?: number; // Minimum confidence to auto-approve recommendations (0-1)
  maxConsecutiveAutoApprovals?: number; // Maximum number of consecutive auto-approvals (default: 5)
}

export interface SenseiRecommendation {
  id: string;
  timestamp: Date;
  source: 'sensei' | 'claude-code' | 'agent' | string; // Source of the recommendation
  serverId?: string; // The serverId that this recommendation belongs to (for cross-session routing)
  input: string;
  recommendation: string;
  command?: string;
  confidence: number;
  executed?: boolean;
  autoApproved?: boolean; // Whether this was auto-approved based on confidence threshold
  denied?: boolean; // Whether this was denied by the user
}

export interface SenseiSession {
  serverId: string;
  sessionId: string;
  config: SenseiConfig;
  recommendations: SenseiRecommendation[];
  outputBuffer: string[];
  lastAnalyzedIndex: number;
  consecutiveAutoApprovals: number; // Track consecutive auto-approvals
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    requestCount: number;
  };
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

IMPORTANT: Confidence Scoring Guidelines
Use the full range of confidence scores (0.0 to 1.0) based on these criteria:

HIGH CONFIDENCE (0.85-1.0):
- Clear, unambiguous errors with known solutions
- Standard development workflow next steps
- Well-established best practices
- Common patterns with obvious fixes

MEDIUM-HIGH CONFIDENCE (0.65-0.84):
- Likely issues with multiple possible solutions
- Reasonable next steps with some uncertainty
- Typical scenarios with context-dependent answers

MEDIUM CONFIDENCE (0.45-0.64):
- Ambiguous situations requiring investigation
- Multiple valid approaches
- Incomplete information but educated guess possible

LOW-MEDIUM CONFIDENCE (0.25-0.44):
- Unclear output requiring more context
- Exploratory suggestions
- Speculative recommendations

LOW CONFIDENCE (0.0-0.24):
- Highly uncertain situations
- Minimal information to work with
- Wild guesses or very speculative ideas

Be honest about uncertainty - don't default to mid-range scores. Vary your confidence based on actual certainty.

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
      autoApprove: true,
      temperature: 1,
      maxTokens: 5000,
      maxConsecutiveAutoApprovals: 5,
      ...config
    };

    const session: SenseiSession = {
      serverId,
      sessionId,
      config: defaultConfig,
      recommendations: [],
      outputBuffer: [],
      lastAnalyzedIndex: 0,
      consecutiveAutoApprovals: 0
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

    console.log('📝 [appendOutput] Called:', {
      serverId,
      sessionId,
      hasSession: !!session,
      enabled: session?.config.enabled,
      immediate,
      outputLength: output.length
    });

    if (!session || !session.config.enabled) {
      console.log('❌ [appendOutput] Session not found or not enabled');
      return;
    }

    // Add to buffer
    const lines = output.split('\n').filter(line => line.trim());
    console.log('📝 [appendOutput] Adding lines to buffer:', lines.length);
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

    console.log('🔍 [analyzeOutput] Called:', { serverId, sessionId, hasSession: !!session });

    if (!session) {
      console.log('❌ [analyzeOutput] No session found');
      return;
    }

    console.log('🔍 [analyzeOutput] Session config:', {
      enabled: session.config.enabled,
      autoApprove: session.config.autoApprove,
      confidenceThreshold: session.config.confidenceThreshold
    });

    // Get unanalyzed output
    const newOutput = session.outputBuffer.slice(session.lastAnalyzedIndex);
    console.log('🔍 [analyzeOutput] New output lines:', newOutput.length);

    if (newOutput.length === 0) {
      console.log('❌ [analyzeOutput] No new output to analyze');
      return;
    }

    session.lastAnalyzedIndex = session.outputBuffer.length;

    // Emit analyzing start event
    console.log('🚀 [analyzeOutput] Dispatching sensei-analyzing START:', { serverId, sessionId });
    eventBus.emit('sensei-analyzing', {
      serverId,
      sessionId,
      analyzing: true
    });

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

      // Update token usage
      if (response.usage) {
        console.log('[SenseiService] Token usage from API:', response.usage);
        if (!session.tokenUsage) {
          session.tokenUsage = {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            requestCount: 0
          };
        }
        session.tokenUsage.promptTokens += (response.usage.promptTokens || 0);
        session.tokenUsage.completionTokens += (response.usage.completionTokens || 0);
        session.tokenUsage.totalTokens += (response.usage.totalTokens || 0);
        session.tokenUsage.requestCount += 1;
        console.log('[SenseiService] Updated session token usage:', session.tokenUsage);
      } else {
        console.log('[SenseiService] No usage data in response');
      }

      // Create recommendation from response
      const recommendation: SenseiRecommendation = {
        id: `sensei-rec-${Date.now()}`,
        timestamp: new Date(),
        source: 'sensei',
        serverId: serverId,
        input: context,
        recommendation: response.recommendation,
        command: response.command,
        confidence: response.confidence,
        executed: false
      };

      session.recommendations.push(recommendation);

      // Emit event for UI update
      this.emitRecommendation(serverId, sessionId, recommendation);

      // Auto-approve if enabled and confidence meets threshold
      const threshold = session.config.confidenceThreshold ?? 0.8;
      console.log('🔍 [analyzeOutput] Auto-approve check:', {
        autoApprove: session.config.autoApprove,
        hasCommand: !!recommendation.command,
        command: recommendation.command,
        confidence: recommendation.confidence,
        threshold,
        meetsThreshold: recommendation.confidence >= threshold,
        willApprove: session.config.autoApprove && recommendation.command && recommendation.confidence >= threshold
      });

      if (session.config.autoApprove && recommendation.command && recommendation.confidence >= threshold) {
        console.log('✅ Auto-approving recommendation:', recommendation.id);
        await this.executeRecommendation(serverId, sessionId, recommendation.id, true);
      } else {
        console.log('❌ Not auto-approving - conditions not met');
      }

    } catch (error) {
      console.error('Failed to analyze output:', error);

      // Create an error recommendation to show in the UI
      const errorRecommendation: SenseiRecommendation = {
        id: `sensei-rec-${Date.now()}`,
        timestamp: new Date(),
        source: 'sensei',
        serverId: serverId,
        input: '',
        recommendation: `Analysis error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        confidence: 0,
        executed: false
      };

      session.recommendations.push(errorRecommendation);
      this.emitRecommendation(serverId, sessionId, errorRecommendation);
    } finally {
      // Emit analyzing complete event
      console.log('✅ [analyzeOutput] Dispatching sensei-analyzing END:', { serverId, sessionId });
      eventBus.emit('sensei-analyzing', {
        serverId,
        sessionId,
        analyzing: false
      });
    }
  }

  private emitRecommendation(serverId: string, sessionId: string, recommendation: SenseiRecommendation) {
    // Emit through EventBus for components
    eventBus.emit('sensei-recommendation', {
      serverId,
      sessionId,
      recommendation
    });

    // Also emit as window CustomEvent for useSenseiNotifications hook
    window.dispatchEvent(new CustomEvent('sensei-recommendation', {
      detail: {
        serverId,
        sessionId,
        recommendation
      }
    }));

    console.log('📢 Emitted sensei-recommendation event:', {
      serverId,
      sessionId,
      recommendationId: recommendation.id,
      source: recommendation.source,
      autoApproved: recommendation.autoApproved
    });
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

  public resetTokenUsage(serverId: string, sessionId: string) {
    const session = this.getSession(serverId, sessionId);
    if (session) {
      session.tokenUsage = {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        requestCount: 0
      };
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
   * Analyzes the agent's response and generates Sensei's recommendation
   */
  public async addAgentRecommendation(
    serverId: string,
    sessionId: string,
    agentResponse: string,
    agentName: string = 'claude-code'
  ) {
    const key = `${serverId}-${sessionId}`;
    const session = this.sessions.get(key);
    if (!session || !session.config.enabled) return;

    console.log(`🤖 Analyzing ${agentName} response with Sensei`);

    // Emit analyzing start event
    console.log('🚀 [addAgentRecommendation] Dispatching sensei-analyzing START:', { serverId, sessionId });
    eventBus.emit('sensei-analyzing', {
      serverId,
      sessionId,
      analyzing: true
    });

    // Use Sensei to analyze the agent's response and suggest next steps
    try {
      const providerInfo = apiKeyService.getProviderForModel(session.config.model);
      const apiKey = providerInfo ? apiKeyService.getKey(providerInfo.id) : session.config.apiKey || '';

      const analysisPrompt = `${session.config.systemPrompt}

The AI agent (${agentName}) just responded with:
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

      // Update token usage
      if (response.usage) {
        console.log('[SenseiService] Token usage from API:', response.usage);
        if (!session.tokenUsage) {
          session.tokenUsage = {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            requestCount: 0
          };
        }
        session.tokenUsage.promptTokens += (response.usage.promptTokens || 0);
        session.tokenUsage.completionTokens += (response.usage.completionTokens || 0);
        session.tokenUsage.totalTokens += (response.usage.totalTokens || 0);
        session.tokenUsage.requestCount += 1;
        console.log('[SenseiService] Updated session token usage:', session.tokenUsage);
      } else {
        console.log('[SenseiService] No usage data in response');
      }

      const recommendation: SenseiRecommendation = {
        id: `sensei-agent-${Date.now()}`,
        timestamp: new Date(),
        source: 'sensei',  // Source is 'sensei' since Sensei is making the recommendation
        serverId: serverId,
        input: agentResponse,
        recommendation: response.recommendation,
        command: response.command,
        confidence: response.confidence,
        executed: false
      };

      session.recommendations.push(recommendation);
      this.emitRecommendation(serverId, sessionId, recommendation);

      // Auto-approve if enabled and confidence meets threshold
      const threshold = session.config.confidenceThreshold ?? 0.8;
      const maxConsecutive = session.config.maxConsecutiveAutoApprovals ?? 5;
      const hasReachedLimit = session.consecutiveAutoApprovals >= maxConsecutive;

      console.log('🔍 [analyzeAgentRecommendation] Auto-approve check:', {
        autoApprove: session.config.autoApprove,
        confidence: recommendation.confidence,
        threshold,
        meetsThreshold: recommendation.confidence >= threshold,
        consecutiveCount: session.consecutiveAutoApprovals,
        maxConsecutive,
        hasReachedLimit,
        willAutoApprove: session.config.autoApprove && recommendation.confidence >= threshold && !hasReachedLimit
      });

      if (session.config.autoApprove && recommendation.confidence >= threshold && !hasReachedLimit) {
        console.log('✅ Auto-approving agent recommendation:', recommendation.id);
        recommendation.executed = true;
        recommendation.autoApproved = true;

        // Increment consecutive auto-approvals counter
        session.consecutiveAutoApprovals++;
        console.log(`📊 Consecutive auto-approvals: ${session.consecutiveAutoApprovals}/${maxConsecutive}`);

        // Send the approved recommendation back to the agent
        eventBus.emit('sensei-approved', {
          sessionId,
          serverId,
          recommendation: recommendation.recommendation,
          confidence: recommendation.confidence,
          timestamp: new Date().toISOString(),
          autoApproved: true
        });

        // Re-emit to update UI with auto-approved status
        this.emitRecommendation(serverId, sessionId, recommendation);
        console.log('📤 Sent auto-approved recommendation to agent');
      } else {
        if (hasReachedLimit) {
          console.log('⛔ Not auto-approving - consecutive limit reached. Manual approval required to reset counter.');
        } else {
          console.log('❌ Not auto-approving agent recommendation - conditions not met');
        }
      }
    } catch (error) {
      console.error('Failed to analyze agent response:', error);
    } finally {
      // Emit analyzing complete event
      console.log('✅ [addAgentRecommendation] Dispatching sensei-analyzing END:', { serverId, sessionId });
      eventBus.emit('sensei-analyzing', {
        serverId,
        sessionId,
        analyzing: false
      });
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
      serverId: agentName,
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
   * @deprecated Use addAgentRecommendation for LLM analysis
   */
  public addDirectRecommendation(
    serverId: string,
    sessionId: string,
    userInput: string,
    agentResponse: string,
    agentName: string = 'agent',
    confidence?: number,
    recommendationId?: string
  ) {
    const key = `${serverId}-${sessionId}`;
    console.log('[SenseiService] 🔧 addDirectRecommendation called:', { serverId, sessionId, key, agentName });

    let session = this.sessions.get(key);

    if (!session) {
      console.log('[SenseiService] ⚠️ Session not found, creating new one');
      // Create session if it doesn't exist
      session = this.initializeSession(serverId, sessionId, { enabled: true });
    } else {
      console.log('[SenseiService] ✅ Found existing session with', session.recommendations.length, 'recommendations');
    }

    // Use provided ID or generate new one
    const recId = recommendationId || `${agentName}-rec-${Date.now()}`;

    // Check if recommendation already exists (for updates)
    const existingIndex = session.recommendations.findIndex(r => r.id === recId);

    const recommendation: SenseiRecommendation = {
      id: recId,
      timestamp: new Date(),
      source: agentName,
      serverId: serverId, // Store the serverId so we know which session this belongs to
      input: userInput,
      recommendation: agentResponse,
      confidence: confidence !== undefined ? confidence : 0,  // Default to 0 for non-Sensei recommendations
      executed: false
    };

    if (existingIndex >= 0) {
      // Update existing recommendation
      console.log('[SenseiService] 🔄 Updating existing recommendation at index', existingIndex);
      session.recommendations[existingIndex] = recommendation;
    } else {
      // Add new recommendation
      console.log('[SenseiService] ➕ Adding new recommendation, total will be', session.recommendations.length + 1);
      session.recommendations.push(recommendation);
    }

    console.log('[SenseiService] 📊 Session now has', session.recommendations.length, 'recommendations');
    console.log('[SenseiService] 📤 Emitting event...');

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

    // Add initial empty recommendation (no confidence for agent responses)
    this.addDirectRecommendation(
      serverId,
      sessionId,
      userInput,
      '...',  // Placeholder while streaming
      agentName,
      undefined,  // No confidence for agent responses
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
    this.addDirectRecommendation(
      serverId,
      sessionId,
      userInput,
      agentResponse,
      agentName,
      undefined,  // No confidence for agent responses
      recommendationId
    );
  }

  /**
   * Mark a recommendation as denied
   */
  public markRecommendationDenied(serverId: string, sessionId: string, recommendationId: string) {
    const session = this.getSession(serverId, sessionId);
    if (!session) return;

    const recommendation = session.recommendations.find(r => r.id === recommendationId);
    if (recommendation) {
      recommendation.executed = true;
      recommendation.denied = true;

      // Reset consecutive auto-approvals counter on manual denial
      session.consecutiveAutoApprovals = 0;
      console.log('🔄 Reset consecutive auto-approvals counter (manual denial)');
    }
  }

  /**
   * Mark a recommendation as executed (deprecated - use markRecommendationDenied for denials)
   */
  public markRecommendationExecuted(serverId: string, sessionId: string, recommendationId: string) {
    // Kept for backward compatibility
    this.markRecommendationDenied(serverId, sessionId, recommendationId);
  }

  /**
   * Execute a recommendation (send to agent for execution)
   */
  public async executeRecommendation(serverId: string, sessionId: string, recommendationId: string, autoApproved: boolean = false) {
    const session = this.getSession(serverId, sessionId);
    if (!session) {
      console.error('[SenseiService] executeRecommendation: Session not found', { serverId, sessionId });
      return;
    }

    const recommendation = session.recommendations.find(r => r.id === recommendationId);
    if (!recommendation) {
      console.error('[SenseiService] executeRecommendation: Recommendation not found', { recommendationId });
      return;
    }

    console.log('[SenseiService] Executing recommendation:', {
      recommendationId,
      autoApproved,
      hasCommand: !!recommendation.command
    });

    // Mark as executed and auto-approved if applicable
    recommendation.executed = true;
    if (autoApproved) {
      recommendation.autoApproved = true;
    } else {
      // Reset consecutive auto-approvals counter on manual approval
      session.consecutiveAutoApprovals = 0;
      console.log('🔄 Reset consecutive auto-approvals counter (manual approval)');
    }

    // Emit sensei-approved event for UI/agent to handle
    eventBus.emit('sensei-approved', {
      sessionId,
      serverId,
      recommendation: recommendation.recommendation,
      command: recommendation.command,
      confidence: recommendation.confidence,
      timestamp: new Date().toISOString(),
      autoApproved
    });

    console.log('[SenseiService] Dispatched sensei-approved event');
  }

  public cleanup(serverId: string, sessionId: string) {
    const key = `${serverId}-${sessionId}`;
    this.sessions.delete(key);
    this.lastAnalysis.delete(key);
  }
}

// Export singleton instance
export const senseiService = new SenseiService();