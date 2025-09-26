import { openai } from '@ai-sdk/openai';
import { generateText, streamText } from 'ai';

// This module handles the AI SDK integration for Sensei
// In a production app, you'd want to handle this through a backend API
// to keep API keys secure

export interface SenseiAnalysisRequest {
  output: string;
  systemPrompt: string;
  model: string;
  temperature: number;
  maxTokens: number;
  apiKey: string;
}

export interface SenseiAnalysisResponse {
  recommendation: string;
  command?: string;
  confidence: number;
}

export class SenseiAPI {
  private static instance: SenseiAPI;

  private constructor() {}

  static getInstance(): SenseiAPI {
    if (!SenseiAPI.instance) {
      SenseiAPI.instance = new SenseiAPI();
    }
    return SenseiAPI.instance;
  }

  async analyzeOutput(request: SenseiAnalysisRequest): Promise<SenseiAnalysisResponse> {
    try {
      // Configure OpenAI with the provided API key
      const model = openai(request.model, {
        apiKey: request.apiKey,
      });

      const result = await generateText({
        model,
        system: request.systemPrompt,
        prompt: `Analyze this recent terminal output and provide a recommendation:\n\n${request.output}`,
        temperature: request.temperature,
        maxTokens: request.maxTokens,
      });

      // Try to parse as JSON, fallback to plain text
      try {
        const parsed = JSON.parse(result.text);
        return {
          recommendation: parsed.recommendation || result.text,
          command: parsed.command,
          confidence: parsed.confidence || 0.5,
        };
      } catch {
        // If not valid JSON, treat as plain recommendation
        return {
          recommendation: result.text,
          confidence: 0.5,
        };
      }
    } catch (error) {
      console.error('Failed to analyze with AI:', error);
      throw error;
    }
  }

  async streamAnalysis(
    request: SenseiAnalysisRequest,
    onChunk: (chunk: string) => void
  ): Promise<SenseiAnalysisResponse> {
    try {
      const model = openai(request.model, {
        apiKey: request.apiKey,
      });

      const { textStream, text } = await streamText({
        model,
        system: request.systemPrompt,
        prompt: `Analyze this recent terminal output and provide a recommendation:\n\n${request.output}`,
        temperature: request.temperature,
        maxTokens: request.maxTokens,
      });

      // Stream the chunks
      for await (const chunk of textStream) {
        onChunk(chunk);
      }

      // Get the full text
      const fullText = await text;

      // Try to parse as JSON
      try {
        const parsed = JSON.parse(fullText);
        return {
          recommendation: parsed.recommendation || fullText,
          command: parsed.command,
          confidence: parsed.confidence || 0.5,
        };
      } catch {
        return {
          recommendation: fullText,
          confidence: 0.5,
        };
      }
    } catch (error) {
      console.error('Failed to stream analysis:', error);
      throw error;
    }
  }

  // Validate API key by making a minimal request
  async validateApiKey(apiKey: string, modelName: string = 'gpt-3.5-turbo'): Promise<boolean> {
    try {
      const model = openai(modelName, { apiKey });

      await generateText({
        model,
        prompt: 'Test',
        maxTokens: 1,
      });

      return true;
    } catch (error) {
      console.error('API key validation failed:', error);
      return false;
    }
  }
}

export const senseiAPI = SenseiAPI.getInstance();