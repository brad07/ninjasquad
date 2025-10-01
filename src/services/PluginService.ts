import { invoke } from '@tauri-apps/api/core';
import type {
  CodingAgentPlugin,
  PluginConfig,
  AgentServer,
  AgentSession,
  AgentResponse,
  ToolUse,
  PluginSettings
} from '../types/plugin';

// Import plugin definitions
import { OpenCodePlugin } from '../plugins/opencode';
import { ClaudeCodePlugin } from '../plugins/claude-code';
import { ClaudeAgentDirectPlugin } from '../plugins/claude-agent-direct';

class PluginService {
  private plugins: Map<string, CodingAgentPlugin> = new Map();
  private activePluginId: string | null = null;
  private pluginSettings: Map<string, PluginSettings> = new Map();

  constructor() {
    this.initializePlugins();
    this.loadSettings();
  }

  /**
   * Initialize all available plugins
   */
  private initializePlugins() {
    // Register built-in plugins
    this.registerPlugin(OpenCodePlugin);
    this.registerPlugin(ClaudeCodePlugin); // CLI-based
    this.registerPlugin(ClaudeAgentDirectPlugin); // Direct SDK

    // Always default to Claude Code (CLI-based) regardless of registration order
    this.activePluginId = 'claude-code';
  }

  /**
   * Register a new plugin
   */
  registerPlugin(plugin: CodingAgentPlugin) {
    console.log(`Registering plugin: ${plugin.id}`);
    this.plugins.set(plugin.id, plugin);

    // Set first plugin as active if none set
    if (!this.activePluginId) {
      this.activePluginId = plugin.id;
    }
  }

  /**
   * Load plugin settings from localStorage
   */
  private loadSettings() {
    const savedSettings = localStorage.getItem('pluginSettings');
    if (savedSettings) {
      try {
        const settings = JSON.parse(savedSettings);
        Object.entries(settings).forEach(([pluginId, pluginSettings]) => {
          this.pluginSettings.set(pluginId, pluginSettings as PluginSettings);
        });
      } catch (error) {
        console.error('Failed to load plugin settings:', error);
      }
    }
  }

  /**
   * Save plugin settings to localStorage
   */
  private saveSettings() {
    const settings: Record<string, PluginSettings> = {};
    this.pluginSettings.forEach((value, key) => {
      settings[key] = value;
    });
    localStorage.setItem('pluginSettings', JSON.stringify(settings));
  }

  /**
   * Get all registered plugins
   */
  getPlugins(): CodingAgentPlugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get a specific plugin by ID
   */
  getPlugin(pluginId: string): CodingAgentPlugin | undefined {
    return this.plugins.get(pluginId);
  }

  /**
   * Get the currently active plugin
   */
  getActivePlugin(): CodingAgentPlugin | null {
    if (!this.activePluginId) return null;
    return this.plugins.get(this.activePluginId) || null;
  }

  /**
   * Set the active plugin
   */
  async setActivePlugin(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin '${pluginId}' not found`);
    }

    // Notify backend about plugin change
    await invoke('set_active_plugin', { pluginId });

    this.activePluginId = pluginId;
    console.log(`Active plugin set to: ${pluginId}`);
  }

  /**
   * Get settings for a plugin
   */
  getPluginSettings(pluginId: string): PluginSettings | undefined {
    return this.pluginSettings.get(pluginId);
  }

  /**
   * Update settings for a plugin
   */
  async updatePluginSettings(pluginId: string, settings: Partial<PluginSettings>): Promise<void> {
    const currentSettings = this.pluginSettings.get(pluginId) || { pluginId };
    const newSettings = { ...currentSettings, ...settings };

    this.pluginSettings.set(pluginId, newSettings);
    this.saveSettings();

    // Try to initialize plugin with new settings (optional, for future backend integration)
    try {
      const settingsMap: Record<string, string> = {};
      if (newSettings.apiKey) settingsMap.api_key = newSettings.apiKey;
      if (newSettings.model) settingsMap.model = newSettings.model;
      if (newSettings.customEndpoint) settingsMap.endpoint = newSettings.customEndpoint;

      await invoke('initialize_plugin', { pluginId, settings: settingsMap });
    } catch (error) {
      // Command not implemented yet - settings are saved locally
      console.log('Plugin backend initialization not available, using local settings');
    }
  }

  /**
   * Spawn a server for the active plugin
   */
  async spawnServer(port: number, model?: string, workingDir?: string): Promise<AgentServer> {
    if (!this.activePluginId) {
      throw new Error('No active plugin selected');
    }

    return await invoke<AgentServer>('spawn_plugin_server', {
      pluginId: this.activePluginId,
      port,
      model,
      workingDir
    });
  }

  /**
   * Spawn a server for a specific plugin
   */
  async spawnServerForPlugin(
    pluginId: string,
    port: number,
    model?: string,
    workingDir?: string
  ): Promise<AgentServer> {
    return await invoke<AgentServer>('spawn_plugin_server', {
      pluginId,
      port,
      model,
      workingDir
    });
  }

  /**
   * Stop a server
   */
  async stopServer(serverId: string): Promise<void> {
    await invoke('stop_plugin_server', { serverId });
  }

  /**
   * Create a session
   */
  async createSession(serverId: string, config?: Record<string, any>): Promise<AgentSession> {
    return await invoke<AgentSession>('create_plugin_session', {
      serverId,
      sessionConfig: config || {}
    });
  }

  /**
   * Send a command to a session
   */
  async sendCommand(
    sessionId: string,
    command: string,
    context?: Record<string, string>
  ): Promise<AgentResponse> {
    return await invoke<AgentResponse>('send_plugin_command', {
      sessionId,
      command,
      context
    });
  }

  /**
   * Handle tool approval
   */
  async handleToolApproval(
    sessionId: string,
    toolUse: ToolUse,
    approved: boolean
  ): Promise<void> {
    await invoke('handle_plugin_tool_approval', {
      sessionId,
      toolUse,
      approved
    });
  }

  /**
   * List all servers
   */
  async listServers(): Promise<AgentServer[]> {
    return await invoke<AgentServer[]>('list_plugin_servers');
  }

  /**
   * List all sessions
   */
  async listSessions(): Promise<AgentSession[]> {
    return await invoke<AgentSession[]>('list_plugin_sessions');
  }

  /**
   * Health check for a server
   */
  async healthCheck(serverId: string): Promise<boolean> {
    return await invoke<boolean>('plugin_health_check', { serverId });
  }

  /**
   * Get terminal command for tmux-based plugins
   */
  getTerminalCommand(plugin: CodingAgentPlugin, port: number, sessionId?: string): string | null {
    if (plugin.terminalCommand) {
      return plugin.terminalCommand(port, sessionId);
    }

    // Default for OpenCode
    if (plugin.id === 'opencode') {
      let cmd = `opencode -h 127.0.0.1 --port ${port}`;
      if (sessionId) {
        cmd += ` -s ${sessionId}`;
      }
      return cmd;
    }

    return null;
  }
}

// Export singleton instance
export const pluginService = new PluginService();