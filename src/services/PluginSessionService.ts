import { invoke } from '@tauri-apps/api/core';

export interface PluginSession {
  id: string;
  project_id: string;
  plugin_id: string;
  title: string;
  working_directory: string;
  model: string;
  permission_mode: string;
  created_at: string;
  last_active: string | null;
  status: 'active' | 'archived';
  config: string | null;
}

export interface CreateSessionRequest {
  project_id: string;
  plugin_id: string;
  title: string;
  working_directory: string;
  model: string;
  permission_mode?: string;
  config?: string;
}

export interface UpdateSessionRequest {
  title?: string;
  last_active?: string;
  status?: string;
  config?: string;
}

/**
 * Service for managing plugin sessions in the database
 * Replaces localStorage-based session management
 */
class PluginSessionService {
  /**
   * Create a new plugin session in the database
   */
  async createSession(
    sessionId: string,
    request: CreateSessionRequest
  ): Promise<PluginSession> {
    return await invoke('create_plugin_session', {
      sessionId,  // Try camelCase - Tauri auto-converts
      request
    });
  }

  /**
   * Get a plugin session by ID
   */
  async getSession(sessionId: string): Promise<PluginSession | null> {
    return await invoke('get_plugin_session', {
      sessionId  // Tauri auto-converts to snake_case
    });
  }

  /**
   * List all sessions for a project
   * @param projectId - The project ID
   * @param status - Optional filter by status ('active' or 'archived')
   */
  async listSessions(
    projectId: string,
    status?: 'active' | 'archived'
  ): Promise<PluginSession[]> {
    return await invoke('list_plugin_sessions', {
      projectId,  // Tauri auto-converts to snake_case
      status: status || null
    });
  }

  /**
   * List only active sessions for a project
   */
  async listActiveSessions(projectId: string): Promise<PluginSession[]> {
    return this.listSessions(projectId, 'active');
  }

  /**
   * List only archived sessions for a project
   */
  async listArchivedSessions(projectId: string): Promise<PluginSession[]> {
    return this.listSessions(projectId, 'archived');
  }

  /**
   * Update a session
   */
  async updateSession(
    sessionId: string,
    updates: UpdateSessionRequest
  ): Promise<PluginSession | null> {
    return await invoke('update_plugin_session', {
      sessionId,  // Tauri auto-converts to snake_case
      request: updates
    });
  }

  /**
   * Update the last_active timestamp for a session
   */
  async updateLastActive(sessionId: string): Promise<void> {
    await invoke('update_plugin_session_last_active', {
      sessionId  // Tauri auto-converts to snake_case
    });
  }

  /**
   * Archive a session (soft delete)
   * Sets status to 'archived' but keeps in database
   */
  async archiveSession(sessionId: string): Promise<boolean> {
    return await invoke('archive_plugin_session', {
      sessionId  // Tauri auto-converts to snake_case
    });
  }

  /**
   * Reopen an archived session
   * Sets status back to 'active'
   */
  async reopenSession(sessionId: string): Promise<PluginSession | null> {
    return this.updateSession(sessionId, { status: 'active' });
  }

  /**
   * Permanently delete a session from database
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    return await invoke('delete_plugin_session', {
      sessionId  // Tauri auto-converts to snake_case
    });
  }

  /**
   * Delete archived sessions older than specified days
   */
  async deleteOldArchivedSessions(days: number): Promise<number> {
    return await invoke('delete_old_archived_sessions', {
      days
    });
  }

  /**
   * Update session title
   */
  async updateTitle(sessionId: string, title: string): Promise<PluginSession | null> {
    return this.updateSession(sessionId, { title });
  }

  /**
   * Update session config (plugin-specific JSON data)
   */
  async updateConfig(sessionId: string, config: Record<string, any>): Promise<PluginSession | null> {
    return this.updateSession(sessionId, {
      config: JSON.stringify(config)
    });
  }

  /**
   * Get parsed config from session
   */
  getConfigObject(session: PluginSession): Record<string, any> {
    if (!session.config) return {};
    try {
      return JSON.parse(session.config);
    } catch (error) {
      console.error('[PluginSessionService] Failed to parse session config:', error);
      return {};
    }
  }
}

// Export singleton instance
export const pluginSessionService = new PluginSessionService();
