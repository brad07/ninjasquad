/**
 * Plugin Instance Types
 * Represents a single instance of a plugin running in a tab
 */

export interface PluginInstance {
  /** Unique identifier for this plugin instance */
  id: string;

  /** ID of the plugin being run (e.g., 'claude-agent-direct', 'claude-code') */
  pluginId: string;

  /** Session ID for the plugin's internal session */
  sessionId: string;

  /** User-editable title for the tab */
  title: string;

  /** When this instance was created */
  createdAt: string;

  /** When this instance was last used */
  lastUsedAt: string;

  /** Plugin-specific configuration */
  config: Record<string, any>;

  /** Working directory for this instance */
  workingDirectory?: string;
}

export interface PluginInstancesState {
  /** Map of instance ID to PluginInstance */
  instances: Map<string, PluginInstance>;

  /** ID of the currently active instance */
  activeInstanceId: string | null;
}