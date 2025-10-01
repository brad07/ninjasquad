/**
 * Types for Claude Agent SDK direct integration
 * Based on @anthropic-ai/claude-agent-sdk
 */

/**
 * Permission modes for tool execution
 */
export type PermissionMode =
  | 'default'           // Ask for approval (default)
  | 'acceptEdits'       // Auto-approve file edits
  | 'bypassPermissions' // Bypass all permission checks (dangerous)
  | 'plan';             // Planning mode - no execution

/**
 * Configuration options for Claude Agent SDK query
 */
export interface AgentOptions {
  // Model configuration
  model?: string;

  // Working directory
  cwd?: string;

  // Additional directories to allow access to
  additionalDirectories?: string[];

  // Permission mode
  permissionMode?: PermissionMode;

  // Tools configuration
  allowedTools?: string[];
  disallowedTools?: string[];

  // System prompt
  systemPrompt?: {
    type: 'preset' | 'custom';
    preset?: string;
    custom?: string;
  };

  // Setting sources to load
  settingSources?: ('user' | 'project' | 'local')[];

  // Session management
  continue?: boolean;      // Continue previous conversation
  resume?: string;         // Resume specific session by ID
  forkSession?: boolean;   // Create new session when resuming

  // Environment variables
  env?: Record<string, string>;
}

/**
 * Stream chunk types from SDK
 */
export type StreamChunkType =
  | 'content'
  | 'tool_use'
  | 'tool_result'
  | 'thinking'
  | 'error'
  | 'usage'
  | 'done'
  | 'system';

/**
 * Base stream chunk
 */
export interface StreamChunk {
  type: StreamChunkType;
  timestamp: string;
}

/**
 * Content chunk (text response)
 */
export interface ContentChunk extends StreamChunk {
  type: 'content';
  content: string;
  index?: number;
}

/**
 * Tool use chunk
 */
export interface ToolUseChunk extends StreamChunk {
  type: 'tool_use';
  toolUse: {
    id: string;
    name: string;
    input: Record<string, any>;
  };
}

/**
 * Tool result chunk
 */
export interface ToolResultChunk extends StreamChunk {
  type: 'tool_result';
  toolId: string;
  result: any;
  isError: boolean;
}

/**
 * Thinking chunk (internal reasoning)
 */
export interface ThinkingChunk extends StreamChunk {
  type: 'thinking';
  content: string;
}

/**
 * Error chunk
 */
export interface ErrorChunk extends StreamChunk {
  type: 'error';
  error: {
    type: string;
    message: string;
    code?: string;
  };
}

/**
 * System message chunk
 */
export interface SystemChunk extends StreamChunk {
  type: 'system';
  message: string;
  level: 'info' | 'warning' | 'error';
}

/**
 * Usage chunk (token usage information)
 */
export interface UsageChunk extends StreamChunk {
  type: 'usage';
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation?: {
      ephemeral_5m_input_tokens?: number;
      ephemeral_1h_input_tokens?: number;
    };
    service_tier?: string;
  };
}

/**
 * Done chunk (end of stream)
 */
export interface DoneChunk extends StreamChunk {
  type: 'done';
  message?: any;
}

/**
 * Session state
 */
export interface AgentSession {
  id: string;
  workingDirectory: string;
  model: string;
  permissionMode: PermissionMode;
  conversationHistory: ConversationMessage[];
  createdAt: string;
  lastUsedAt: string;
}

/**
 * Conversation message
 */
export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolUses?: ToolUseInfo[];
  timestamp: string;
}

/**
 * Tool use information
 */
export interface ToolUseInfo {
  id: string;
  name: string;
  input: Record<string, any>;
  output?: any;
  status: 'pending' | 'approved' | 'rejected' | 'running' | 'completed' | 'failed';
  error?: string;
  timestamp: string;
}

/**
 * SDK service configuration
 */
export interface SDKServiceConfig {
  apiKey: string;
  defaultModel?: string;
  defaultPermissionMode?: PermissionMode;
  defaultAllowedTools?: string[];
}

/**
 * Query interrupt interface
 */
export interface QueryControl {
  interrupt(): Promise<void>;
  setPermissionMode(mode: PermissionMode): Promise<void>;
}