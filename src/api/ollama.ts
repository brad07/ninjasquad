// Ollama API client for local LLM analysis
// Ollama REST API documentation: https://github.com/ollama/ollama/blob/main/docs/api.md

export interface OllamaConfig {
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

export interface OllamaAnalysisRequest {
  output: string;
  systemPrompt: string;
  model: string;
  temperature: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface OllamaAnalysisResponse {
  recommendation: string;
  confidence: number;
}

export interface OllamaModel {
  name: string;
  size: number;
  modified_at: string;
}

export class OllamaAPI {
  private static instance: OllamaAPI;
  private baseUrl: string = 'http://localhost:11434';

  private constructor() {}

  static getInstance(): OllamaAPI {
    if (!OllamaAPI.instance) {
      OllamaAPI.instance = new OllamaAPI();
    }
    return OllamaAPI.instance;
  }

  setBaseUrl(url: string) {
    this.baseUrl = url;
  }

  /**
   * Check if Ollama is running and accessible
   */
  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(3000),
      });
      return response.ok;
    } catch (error) {
      console.warn('[Ollama] Health check failed:', error);
      return false;
    }
  }

  /**
   * List available models
   */
  async listModels(): Promise<OllamaModel[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      return data.models || [];
    } catch (error) {
      console.warn('[Ollama] Failed to list models:', error);
      // Return empty array instead of throwing - Ollama might not be running
      return [];
    }
  }

  /**
   * Analyze terminal output using Ollama (non-streaming)
   */
  async analyzeOutput(request: OllamaAnalysisRequest): Promise<OllamaAnalysisResponse> {
    try {
      const isHealthy = await this.checkHealth();
      if (!isHealthy) {
        return {
          recommendation: 'Ollama is not running. Please start Ollama to enable local AI analysis.\nDownload from: https://ollama.ai/download',
          confidence: 0,
        };
      }

      const prompt = `${request.systemPrompt}\n\nAnalyze this terminal output:\n\n${request.output}`;

      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: request.model,
          prompt,
          stream: false,
          options: {
            temperature: request.temperature,
            num_predict: request.maxTokens || 500,
          },
        }),
        signal: AbortSignal.timeout(60000), // 60 second timeout
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      let responseText = data.response;

      // Strip <think> tags and their content
      responseText = responseText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

      // Try to parse as JSON (if model returns structured output)
      try {
        let parsed = JSON.parse(responseText);

        // Handle double-encoded JSON (when model returns a JSON string)
        if (typeof parsed === 'string' && parsed.trim().startsWith('{')) {
          parsed = JSON.parse(parsed);
        }

        // Strip <think> tags from the recommendation field too (in case they're in the JSON)
        let recommendation = parsed.recommendation || responseText;
        if (typeof recommendation === 'string') {
          recommendation = recommendation.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        }

        return {
          recommendation,
          confidence: parsed.confidence || 0.5,
        };
      } catch {
        // If not JSON, treat as plain text recommendation
        return {
          recommendation: responseText,
          confidence: 0.5,
        };
      }
    } catch (error: any) {
      console.error('[Ollama] Analysis failed:', error);

      if (error.name === 'AbortError') {
        return {
          recommendation: 'Analysis timed out. The model may be too slow or the output too large.',
          confidence: 0,
        };
      }

      return {
        recommendation: `Ollama analysis failed: ${error.message || 'Unknown error'}`,
        confidence: 0,
      };
    }
  }

  /**
   * Analyze terminal output with streaming response
   */
  async streamAnalysis(
    request: OllamaAnalysisRequest,
    onChunk: (chunk: string) => void
  ): Promise<OllamaAnalysisResponse> {
    try {
      const isHealthy = await this.checkHealth();
      if (!isHealthy) {
        const errorMsg = 'Ollama is not running. Please start Ollama to enable local AI analysis.\nDownload from: https://ollama.ai/download';
        onChunk(errorMsg);
        return {
          recommendation: errorMsg,
          confidence: 0,
        };
      }

      const prompt = `${request.systemPrompt}\n\nAnalyze this terminal output:\n\n${request.output}`;

      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: request.model,
          prompt,
          stream: true,
          options: {
            temperature: request.temperature,
            num_predict: request.maxTokens || 500,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      // Read streaming response
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      let fullResponse = '';
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim());

        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (data.response) {
              fullResponse += data.response;
              onChunk(data.response);
            }
          } catch (e) {
            console.warn('[Ollama] Failed to parse chunk:', line);
          }
        }
      }

      // Strip <think> tags and their content from full response
      fullResponse = fullResponse.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

      // Try to parse final response as JSON
      try {
        let parsed = JSON.parse(fullResponse);

        // Handle double-encoded JSON (when model returns a JSON string)
        if (typeof parsed === 'string' && parsed.trim().startsWith('{')) {
          parsed = JSON.parse(parsed);
        }

        // Strip <think> tags from the recommendation field too (in case they're in the JSON)
        let recommendation = parsed.recommendation || fullResponse;
        if (typeof recommendation === 'string') {
          recommendation = recommendation.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        }

        return {
          recommendation,
          confidence: parsed.confidence || 0.5,
        };
      } catch {
        return {
          recommendation: fullResponse,
          confidence: 0.5,
        };
      }
    } catch (error: any) {
      console.error('[Ollama] Streaming analysis failed:', error);
      const errorMsg = `Ollama streaming failed: ${error.message || 'Unknown error'}`;
      onChunk(errorMsg);
      return {
        recommendation: errorMsg,
        confidence: 0,
      };
    }
  }

  /**
   * Pull a model from Ollama library
   */
  async pullModel(modelName: string, onProgress?: (progress: string) => void): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/api/pull`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: modelName,
          stream: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim());

        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (onProgress && data.status) {
              onProgress(data.status);
            }
          } catch (e) {
            console.warn('[Ollama] Failed to parse pull progress:', line);
          }
        }
      }
    } catch (error) {
      console.error('[Ollama] Failed to pull model:', error);
      throw error;
    }
  }
}

export const ollamaAPI = OllamaAPI.getInstance();
