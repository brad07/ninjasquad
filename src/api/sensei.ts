import { createOpenAI } from '@ai-sdk/openai';
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
    // Check if API key is provided
    if (!request.apiKey || request.apiKey === '') {
      console.warn('Sensei: No API key provided');
      return {
        recommendation: 'Please configure your OpenAI API key in Sensei settings to enable AI analysis.',
        confidence: 0,
      };
    }

    try {
      // Configure OpenAI with the provided API key
      const openai = createOpenAI({
        apiKey: request.apiKey,
      });

      // Reasoning models (like GPT-5/o1 models) don't support temperature
      const isReasoningModel = request.model.includes('gpt-5') ||
                               request.model.includes('o1-preview') ||
                               request.model.includes('o1-mini');

      // Build generation params based on model capabilities
      const generationParams: any = {
        model: openai(request.model),
        system: request.systemPrompt,
        prompt: `Analyze this recent terminal output and provide a recommendation:\n\n${request.output}`,
        maxRetries: 3,
        maxTokens: request.maxTokens,
        abortSignal: AbortSignal.timeout(120000), // 120 second timeout
      };

      // Only add temperature for non-reasoning models
      if (!isReasoningModel) {
        generationParams.temperature = request.temperature;
      }

      const result = await generateText(generationParams);

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
    } catch (error: any) {
      console.error('Failed to analyze with AI:', error);

      // Return user-friendly error message instead of throwing
      if (error?.message?.includes('API key')) {
        return {
          recommendation: 'Invalid API key. Please check your OpenAI API key in settings.',
          confidence: 0,
        };
      } else if (error?.message?.includes('rate limit')) {
        return {
          recommendation: 'Rate limit reached. Please wait a moment before trying again.',
          confidence: 0,
        };
      } else {
        return {
          recommendation: `AI analysis failed: ${error?.message || 'Unknown error'}`,
          confidence: 0,
        };
      }
    }
  }

  async streamAnalysis(
    request: SenseiAnalysisRequest,
    onChunk: (chunk: string) => void
  ): Promise<SenseiAnalysisResponse> {
    // Check if API key is provided
    if (!request.apiKey || request.apiKey === '') {
      return {
        recommendation: 'Please configure your OpenAI API key in Sensei settings to enable AI analysis.',
        confidence: 0,
      };
    }

    try {
      const openai = createOpenAI({
        apiKey: request.apiKey,
      });

      // Reasoning models (like GPT-5/o1 models) don't support temperature
      const isReasoningModel = request.model.includes('gpt-5') ||
                               request.model.includes('o1-preview') ||
                               request.model.includes('o1-mini');

      // Build streaming params based on model capabilities
      const streamParams: any = {
        model: openai(request.model),
        system: request.systemPrompt,
        prompt: `Analyze this recent terminal output and provide a recommendation:\n\n${request.output}`,
        maxTokens: request.maxTokens,
        maxSteps: 5,
      };

      // Only add temperature for non-reasoning models
      if (!isReasoningModel) {
        streamParams.temperature = request.temperature;
      }

      const { textStream, text } = await streamText(streamParams);

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
    } catch (error: any) {
      console.error('Failed to stream analysis:', error);
      return {
        recommendation: `Streaming failed: ${error?.message || 'Unknown error'}`,
        confidence: 0,
      };
    }
  }

  // Validate API key by making a minimal request
  async validateApiKey(apiKey: string, modelName: string = 'gpt-3.5-turbo'): Promise<boolean> {
    try {
      const openai = createOpenAI({
        apiKey: apiKey,
      });

      await generateText({
        model: openai(modelName),
        prompt: 'Test',
        maxRetries: 3,
        maxTokens: 10,
      });

      return true;
    } catch (error) {
      console.error('API key validation failed:', error);
      return false;
    }
  }
}

export const senseiAPI = SenseiAPI.getInstance();