import { ollamaAPI } from '../api/ollama';
import { senseiService } from './SenseiService';

export interface OllamaConfig {
  enabled: boolean;
  model: string;
  baseUrl: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  analysisThrottle: number; // Milliseconds between analyses
}

export interface OllamaAnalysis {
  id: string;
  timestamp: Date;
  recommendation: string;
  confidence: number;
}

export interface DevServerSession {
  serverId: string; // Unique ID for the dev server
  projectPath: string;
  projectName: string;
  config: OllamaConfig;
  outputBuffer: string[];
  lastAnalyzedIndex: number;
  analyses: OllamaAnalysis[];
  senseiSessionId?: string; // Optional link to Sensei session for recommendations
}

const DEFAULT_SYSTEM_PROMPT = `You are an AI assistant monitoring development server terminal output for errors.

Your ONLY job is to detect and analyze ERRORS. Do NOT respond unless there is an actual error or critical issue.

IMPORTANT: Do NOT use <think> tags or show your reasoning process. Respond directly with the analysis.

ONLY analyze and respond if you detect:
- Compilation errors or build failures
- Runtime errors or exceptions
- Port conflicts or binding failures
- Missing dependencies or import errors
- Security vulnerabilities or warnings
- Critical warnings that will prevent the application from working

DO NOT respond to:
- Successful builds or server starts
- Normal startup messages
- Info/debug logs
- Deprecation warnings (unless critical)
- General output that doesn't indicate a problem

When you detect an error:
1. Clearly identify what the error is
2. Explain the likely cause
3. Suggest how to fix it (include any commands needed)

IMPORTANT: If there are NO errors in the output, return:
{
  "recommendation": "No errors detected",
  "confidence": 1.0
}

If there IS an error, format your response as JSON:
{
  "recommendation": "Clear explanation of the error and how to fix it (include commands in the explanation)",
  "confidence": 0.0 to 1.0
}

Be concise and focus only on actionable error information. Do NOT include thinking or reasoning steps.`;

class OllamaService {
  private static instance: OllamaService;
  private sessions: Map<string, DevServerSession> = new Map();
  private bufferSize = 100; // Keep last 100 lines
  private lastAnalysis: Map<string, number> = new Map();
  private isAnalyzing: Map<string, boolean> = new Map();
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private pendingAnalysis: Map<string, boolean> = new Map(); // Queue flag for pending analysis
  private quietPeriod = 3000; // 3 seconds of quiet before analyzing

  private constructor() {
    this.loadConfig();
  }

  static getInstance(): OllamaService {
    if (!OllamaService.instance) {
      OllamaService.instance = new OllamaService();
    }
    return OllamaService.instance;
  }

  /**
   * Load configuration from localStorage
   */
  private loadConfig(): OllamaConfig {
    return {
      enabled: localStorage.getItem('ollama-enabled') === 'true',
      model: localStorage.getItem('ollama-model') || 'llama3.1',
      baseUrl: localStorage.getItem('ollama-base-url') || 'http://localhost:11434',
      temperature: parseFloat(localStorage.getItem('ollama-temperature') || '0.7'),
      maxTokens: parseInt(localStorage.getItem('ollama-max-tokens') || '500'),
      systemPrompt: localStorage.getItem('ollama-system-prompt') || DEFAULT_SYSTEM_PROMPT,
      analysisThrottle: parseInt(localStorage.getItem('ollama-throttle') || '3000'), // 3 seconds
    };
  }

  /**
   * Save configuration to localStorage
   */
  updateConfig(config: Partial<OllamaConfig>) {
    if (config.enabled !== undefined) {
      localStorage.setItem('ollama-enabled', String(config.enabled));
    }
    if (config.model) {
      localStorage.setItem('ollama-model', config.model);
    }
    if (config.baseUrl) {
      localStorage.setItem('ollama-base-url', config.baseUrl);
      ollamaAPI.setBaseUrl(config.baseUrl);
    }
    if (config.temperature !== undefined) {
      localStorage.setItem('ollama-temperature', String(config.temperature));
    }
    if (config.maxTokens !== undefined) {
      localStorage.setItem('ollama-max-tokens', String(config.maxTokens));
    }
    if (config.systemPrompt) {
      localStorage.setItem('ollama-system-prompt', config.systemPrompt);
    }
    if (config.analysisThrottle !== undefined) {
      localStorage.setItem('ollama-throttle', String(config.analysisThrottle));
    }

    // Update all sessions with new config
    this.sessions.forEach(session => {
      session.config = this.loadConfig();
    });
  }

  getConfig(): OllamaConfig {
    return this.loadConfig();
  }

  /**
   * Create or get a dev server session
   */
  getOrCreateSession(serverId: string, projectPath: string, projectName: string, senseiSessionId?: string): DevServerSession {
    if (!this.sessions.has(serverId)) {
      const session: DevServerSession = {
        serverId,
        projectPath,
        projectName,
        config: this.loadConfig(),
        outputBuffer: [],
        lastAnalyzedIndex: 0,
        analyses: [],
        senseiSessionId,
      };
      this.sessions.set(serverId, session);
      console.log('[OllamaService] Created session for server:', serverId, 'with Sensei session:', senseiSessionId);
    }
    return this.sessions.get(serverId)!;
  }

  /**
   * Link a Sensei session to an existing dev server session
   */
  linkSenseiSession(serverId: string, senseiSessionId: string) {
    const session = this.sessions.get(serverId);
    if (session) {
      session.senseiSessionId = senseiSessionId;
      console.log('[OllamaService] Linked Sensei session:', senseiSessionId, 'to server:', serverId);
    }
  }

  /**
   * Add terminal output to the session buffer
   */
  addOutput(serverId: string, output: string) {
    const session = this.sessions.get(serverId);
    if (!session) {
      console.warn('[OllamaService] No session found for server:', serverId);
      return;
    }

    // Add to buffer
    session.outputBuffer.push(output);

    // Trim buffer to size limit
    if (session.outputBuffer.length > this.bufferSize) {
      const removed = session.outputBuffer.length - this.bufferSize;
      session.outputBuffer = session.outputBuffer.slice(removed);
      session.lastAnalyzedIndex = Math.max(0, session.lastAnalyzedIndex - removed);
    }

    // Debounce analysis: only trigger after quiet period
    if (session.config.enabled) {
      // Clear existing timer
      const existingTimer = this.debounceTimers.get(serverId);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      // Set new timer to trigger analysis after quiet period
      const timer = setTimeout(() => {
        this.triggerDebounedAnalysis(serverId);
      }, this.quietPeriod);

      this.debounceTimers.set(serverId, timer);
    }
  }

  /**
   * Trigger debounced analysis after quiet period
   */
  private async triggerDebounedAnalysis(serverId: string) {
    const session = this.sessions.get(serverId);
    if (!session || !session.config.enabled) {
      return;
    }

    // Check if already analyzing - if so, queue this analysis
    if (this.isAnalyzing.get(serverId)) {
      console.log('[OllamaService] Analysis already in progress, queuing next analysis for:', serverId);
      this.pendingAnalysis.set(serverId, true);
      return;
    }

    // Check if there's output to analyze
    if (session.outputBuffer.length === 0) {
      return;
    }

    this.isAnalyzing.set(serverId, true);
    this.emitAnalysisState(serverId, true);
    this.debounceTimers.delete(serverId);
    this.pendingAnalysis.delete(serverId); // Clear any pending flag

    try {
      await this.analyze(serverId);
    } catch (error) {
      console.error('[OllamaService] Analysis error:', error);
    } finally {
      this.isAnalyzing.set(serverId, false);
      this.emitAnalysisState(serverId, false);

      // Check if another analysis was queued while this one was running
      if (this.pendingAnalysis.get(serverId)) {
        console.log('[OllamaService] Processing queued analysis for:', serverId);
        this.pendingAnalysis.delete(serverId);
        // Trigger analysis again after a short delay to allow buffer to accumulate
        setTimeout(() => this.triggerDebounedAnalysis(serverId), 100);
      }
    }
  }

  /**
   * Perform analysis on the session output
   */
  private async analyze(serverId: string) {
    const session = this.sessions.get(serverId);
    if (!session) {
      return;
    }

    // Capture current buffer length to track what we're analyzing
    const bufferLengthBeforeAnalysis = session.outputBuffer.length;

    // Get recent output (last 30 lines or since last analysis)
    const startIndex = Math.max(0, bufferLengthBeforeAnalysis - 30);
    const recentOutput = session.outputBuffer.slice(startIndex).join('\n');

    if (!recentOutput.trim()) {
      return;
    }

    console.log('[OllamaService] 📤 Sending to Ollama for server:', serverId);
    console.log('[OllamaService] 📝 Output being analyzed (buffer size: ' + bufferLengthBeforeAnalysis + '):');
    console.log('─'.repeat(80));
    console.log(recentOutput);
    console.log('─'.repeat(80));

    try {
      const result = await ollamaAPI.analyzeOutput({
        output: recentOutput,
        systemPrompt: session.config.systemPrompt,
        model: session.config.model,
        temperature: session.config.temperature,
        maxTokens: session.config.maxTokens,
      });

      console.log('[OllamaService] 📥 Ollama response:');
      console.log('─'.repeat(80));
      console.log('Recommendation:', result.recommendation);
      console.log('Confidence:', result.confidence);
      console.log('─'.repeat(80));

      const analysis: OllamaAnalysis = {
        id: `analysis-${Date.now()}`,
        timestamp: new Date(),
        recommendation: result.recommendation,
        confidence: result.confidence,
      };

      session.analyses.push(analysis);
      session.lastAnalyzedIndex = session.outputBuffer.length;

      // Keep only last 10 analyses
      if (session.analyses.length > 10) {
        session.analyses = session.analyses.slice(-10);
      }

      // If there's an actual error (not "No errors detected"), send to Sensei
      const isError = !result.recommendation.toLowerCase().includes('no errors detected');

      if (isError && session.senseiSessionId) {
        console.log('[OllamaService] 🚨 Error detected! Sending to Sensei:', {
          serverId,
          senseiSessionId: session.senseiSessionId,
          confidence: result.confidence,
        });

        const message = `🔴 **Dev Server Error Detected**

**Original Error:**
\`\`\`
${recentOutput}
\`\`\`

**Analysis:**
${result.recommendation}`;

        console.log('[OllamaService] 📧 Message to Sensei:', message);

        // Send directly to Sensei (bypass additional LLM analysis - Ollama already analyzed it)
        try {
          senseiService.addDirectRecommendation(
            serverId,
            session.senseiSessionId,
            'Dev server error detected', // userInput
            message, // agentResponse (Ollama's recommendation)
            'ollama-dev-monitor', // agentName
            result.confidence, // confidence from Ollama
            `ollama-${Date.now()}` // unique ID
          );
          console.log('[OllamaService] ✅ Successfully sent to Sensei');
        } catch (error) {
          console.error('[OllamaService] ❌ Failed to send to Sensei:', error);
        }
      } else if (isError && !session.senseiSessionId) {
        console.warn('[OllamaService] ⚠️ Error detected but no Sensei session linked!');
      }

      console.log('[OllamaService] Analysis completed:', {
        serverId,
        confidence: result.confidence,
        isError,
        sentToSensei: isError && !!session.senseiSessionId,
        recommendation: result.recommendation.substring(0, 100) + '...',
      });

      // Clear only the lines that were analyzed, preserving new lines that came in during analysis
      const currentBufferLength = session.outputBuffer.length;
      const newLinesAdded = currentBufferLength - bufferLengthBeforeAnalysis;

      if (newLinesAdded > 0) {
        // Keep only the new lines that came in during analysis
        session.outputBuffer = session.outputBuffer.slice(bufferLengthBeforeAnalysis);
        console.log('[OllamaService] Buffer cleared, kept', newLinesAdded, 'new lines for server:', serverId);
      } else {
        // No new lines, clear everything
        session.outputBuffer = [];
        console.log('[OllamaService] Buffer cleared for server:', serverId);
      }

      session.lastAnalyzedIndex = 0;
    } catch (error) {
      console.error('[OllamaService] Analysis failed:', error);
    }
  }

  /**
   * Force immediate analysis (ignoring debounce)
   */
  async forceAnalyze(serverId: string): Promise<OllamaAnalysis | null> {
    const session = this.sessions.get(serverId);
    if (!session) {
      return null;
    }

    // Clear any pending debounce timer
    const existingTimer = this.debounceTimers.get(serverId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.debounceTimers.delete(serverId);
    }

    await this.analyze(serverId);

    return session.analyses[session.analyses.length - 1] || null;
  }

  /**
   * Get latest analysis for a server
   */
  getLatestAnalysis(serverId: string): OllamaAnalysis | null {
    const session = this.sessions.get(serverId);
    if (!session || session.analyses.length === 0) {
      return null;
    }
    return session.analyses[session.analyses.length - 1];
  }

  /**
   * Get all analyses for a server
   */
  getAnalyses(serverId: string): OllamaAnalysis[] {
    const session = this.sessions.get(serverId);
    return session?.analyses || [];
  }

  /**
   * Clear session data
   */
  clearSession(serverId: string) {
    // Clear any pending debounce timer
    const existingTimer = this.debounceTimers.get(serverId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    this.sessions.delete(serverId);
    this.lastAnalysis.delete(serverId);
    this.isAnalyzing.delete(serverId);
    this.debounceTimers.delete(serverId);
    this.pendingAnalysis.delete(serverId);
    console.log('[OllamaService] Cleared session for server:', serverId);
  }

  /**
   * Check if Ollama is available
   */
  async checkHealth(): Promise<boolean> {
    return await ollamaAPI.checkHealth();
  }

  /**
   * List available models
   */
  async listModels() {
    return await ollamaAPI.listModels();
  }

  /**
   * Pull a new model
   */
  async pullModel(modelName: string, onProgress?: (progress: string) => void) {
    return await ollamaAPI.pullModel(modelName, onProgress);
  }

  /**
   * Check if a server is currently being analyzed
   */
  isServerAnalyzing(serverId: string): boolean {
    return this.isAnalyzing.get(serverId) || false;
  }

  /**
   * Subscribe to analysis state changes
   */
  onAnalysisStateChange(serverId: string, callback: (isAnalyzing: boolean) => void): () => void {
    const eventName = `ollama-analyzing-${serverId}`;
    const handler = (event: CustomEvent) => {
      callback(event.detail.isAnalyzing);
    };
    window.addEventListener(eventName, handler as EventListener);

    // Return unsubscribe function
    return () => {
      window.removeEventListener(eventName, handler as EventListener);
    };
  }

  /**
   * Emit analysis state change
   */
  private emitAnalysisState(serverId: string, isAnalyzing: boolean) {
    const eventName = `ollama-analyzing-${serverId}`;
    window.dispatchEvent(new CustomEvent(eventName, {
      detail: { isAnalyzing }
    }));
  }
}

export const ollamaService = OllamaService.getInstance();
