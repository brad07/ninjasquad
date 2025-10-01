import { ComponentType } from 'react';

/**
 * Core configuration for a coding agent plugin
 */
export interface PluginConfig {
  name: string;
  version: string;
  description: string;
  author: string;
  icon?: string;
  supportedModels: string[];
  defaultModel: string;
  requiresApiKey: boolean;
  uiComponent: UiComponentType;
  capabilities: PluginCapabilities;
}

/**
 * Type of UI component the plugin uses
 */
export type UiComponentType = 'tmux' | 'custom' | 'webview' | 'iframe';

/**
 * Capabilities that a plugin supports
 */
export interface PluginCapabilities {
  fileOperations: boolean;
  terminalAccess: boolean;
  gitOperations: boolean;
  webSearch: boolean;
  codeExecution: boolean;
  customTools: string[];
}

/**
 * Plugin metadata with frontend-specific properties
 */
export interface CodingAgentPlugin extends PluginConfig {
  id: string;

  // Plugin visibility
  enabled?: boolean; // If false, plugin won't appear in selector (default: true)

  // UI Component configuration
  customRenderer?: ComponentType<PluginUIProps>;
  customStyles?: string;

  // UI Configuration
  uiConfig?: {
    showTerminal?: boolean;
    showChat?: boolean;
    showFileTree?: boolean;
    customPanels?: PanelConfig[];
  };

  // Terminal command generator (for tmux-based plugins)
  terminalCommand?: (port: number, sessionId?: string) => string;

  // API endpoint configuration
  apiEndpoint?: string;
  apiVersion?: string;
}

/**
 * Props passed to custom plugin UI components
 */
export interface PluginUIProps {
  plugin: CodingAgentPlugin;
  session: AgentSession | null;
  server: AgentServer | null;
  onCommand: (command: string) => void;
  onToolApproval?: (toolUse: ToolUse, approved: boolean) => void;
  config: Record<string, any>;
}

/**
 * Interface for plugins to integrate with Sensei
 *
 * ARCHITECTURE: Plugin-Sensei Communication Pattern
 * ================================================
 *
 * We use a session-scoped EventBus for all plugin-Sensei communication.
 * This provides:
 * - Type safety for event payloads
 * - Session isolation (events only go to relevant listeners)
 * - No global namespace pollution
 * - Easy debugging and event flow tracking
 *
 * HOW IT WORKS:
 * -------------
 * 1. Plugin sends agent response to Sensei for analysis:
 *    ```typescript
 *    import { senseiService } from '../services/SenseiService';
 *
 *    // After agent completes a response
 *    await senseiService.addAgentRecommendation(
 *      serverId,
 *      sessionId,
 *      agentResponse,
 *      'your-plugin-name'
 *    );
 *    ```
 *
 * 2. Plugin listens for approved recommendations using EventBus:
 *    ```typescript
 *    import { onSenseiApproved } from '../services/EventBus';
 *
 *    useEffect(() => {
 *      if (!session?.id) return;
 *
 *      const unsubscribe = onSenseiApproved(session.id, (data) => {
 *        // Handle approved recommendation
 *        console.log('Approved:', data.recommendation);
 *        // Send back to agent for execution
 *      });
 *
 *      return unsubscribe; // Cleanup on unmount
 *    }, [session?.id]);
 *    ```
 *
 * AVAILABLE EVENTS:
 * ----------------
 * - sensei-recommendation: New recommendation from Sensei
 * - sensei-approved: User/auto-approved recommendation
 * - sensei-analyzing: Sensei is analyzing (start/stop)
 * - sensei-execute: Execute a command
 * - agent-response: Agent completed a response (for future use)
 *
 * See EventBus.ts for full type definitions and helper functions.
 */
export interface SenseiIntegration {
  /**
   * Add an agent response to Sensei for analysis
   * Sensei will analyze the response and generate recommendations
   *
   * @param serverId The server ID (e.g., 'opencode-4097')
   * @param sessionId The session ID
   * @param agentResponse The agent's response to analyze
   * @param agentName Name of the agent (e.g., 'claude-code', 'copilot', 'cursor')
   */
  addRecommendation(
    serverId: string,
    sessionId: string,
    agentResponse: string,
    agentName: string
  ): Promise<void>;
}

/**
 * Configuration for custom panels in plugin UI
 */
export interface PanelConfig {
  id: string;
  title: string;
  position: 'left' | 'right' | 'bottom' | 'top';
  defaultSize?: number;
  resizable?: boolean;
  collapsible?: boolean;
}

/**
 * Agent server information
 */
export interface AgentServer {
  id: string;
  pluginId: string;
  host: string;
  port: number;
  status: ServerStatus;
  model: string;
  workingDir: string;
  createdAt: string;
  metadata: Record<string, any>;
}

/**
 * Server status
 */
export type ServerStatus = 'starting' | 'running' | 'stopped' | 'error';

/**
 * A session with a coding agent
 */
export interface AgentSession {
  id: string;
  serverId: string;
  pluginId: string;
  createdAt: string;
  status: SessionStatus;
  metadata: Record<string, any>;
}

/**
 * Session status
 */
export type SessionStatus = 'active' | 'idle' | 'working' | 'completed' | 'failed';

/**
 * Response from an agent
 */
export interface AgentResponse {
  sessionId: string;
  content: string;
  responseType: ResponseType;
  metadata: Record<string, any>;
}

/**
 * Type of response from the agent
 */
export type ResponseType = 'message' | 'code' | 'tool_use' | 'error' | 'progress' | 'artifact';

/**
 * Tool use by an agent
 */
export interface ToolUse {
  toolName: string;
  parameters: Record<string, any>;
  result?: string;
  status: ToolStatus;
}

/**
 * Status of a tool invocation
 */
export type ToolStatus = 'pending' | 'running' | 'completed' | 'failed' | 'requires_approval';

/**
 * Artifact generated by an agent
 */
export interface Artifact {
  id: string;
  type: 'file' | 'code' | 'documentation' | 'other';
  name: string;
  content: string;
  language?: string;
  path?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Message in a conversation with an agent
 */
export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  artifacts?: Artifact[];
  toolUses?: ToolUse[];
  metadata?: Record<string, any>;
}

/**
 * Plugin settings that can be configured by the user
 */
export interface PluginSettings {
  pluginId: string;
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  customEndpoint?: string;
  timeout?: number; // Timeout in seconds for agent responses
  additionalSettings?: Record<string, any>;
}