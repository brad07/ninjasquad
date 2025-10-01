import { useState, useEffect, useCallback } from 'react';
import type { PluginInstance } from '../types/plugin-instance';
import { pluginService } from '../services/PluginService';
import { pluginSessionService } from '../services/PluginSessionService';

/**
 * Hook to manage multiple plugin instances (tabs) for a project
 * Each instance can be any plugin (Claude Agent, Claude Code, etc.)
 * Multiple instances of the same plugin are supported
 * Now uses database instead of localStorage for persistence
 */
export const usePluginInstances = (projectId: string, defaultWorkingDirectory?: string) => {
  const [instances, setInstances] = useState<Map<string, PluginInstance>>(new Map());
  const [activeInstanceId, setActiveInstanceId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const ACTIVE_KEY = `plugin-active-instance-${projectId}`;

  // Load instances from database on mount or when projectId changes
  useEffect(() => {
    console.log('[PluginInstances] Loading instances for project:', projectId);

    setIsLoading(true);
    // Clear old instances immediately when project changes
    setInstances(new Map());
    setActiveInstanceId(null);

    const loadInstances = async () => {
      try {
        // Load active sessions from database
        const sessions = await pluginSessionService.listActiveSessions(projectId);
        console.log('[PluginInstances] Loaded sessions from database:', sessions);

        // Convert database sessions to PluginInstances
        const instancesArray: PluginInstance[] = sessions.map(session => ({
          id: session.id,
          pluginId: session.plugin_id,
          sessionId: session.id, // session ID is the instance ID now
          title: session.title,
          createdAt: session.created_at,
          lastUsedAt: session.last_active || new Date().toISOString(),
          config: session.config ? JSON.parse(session.config) : {},
          workingDirectory: session.working_directory
        }));

        const instancesMap = new Map(instancesArray.map(i => [i.id, i]));
        setInstances(instancesMap);

        console.log('[PluginInstances] Loaded', instancesArray.length, 'instances for project:', projectId);

        // Restore active instance from localStorage
        const savedActiveId = localStorage.getItem(ACTIVE_KEY);
        if (savedActiveId && instancesMap.has(savedActiveId)) {
          setActiveInstanceId(savedActiveId);
          console.log('[PluginInstances] Restored active instance:', savedActiveId);
        } else if (instancesMap.size > 0) {
          // Set most recently used as active
          const sorted = instancesArray.sort((a, b) =>
            new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime()
          );
          setActiveInstanceId(sorted[0].id);
          console.log('[PluginInstances] Set most recent instance as active:', sorted[0].id);
        }
      } catch (error) {
        console.error('[PluginInstances] Failed to load from database:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadInstances();
  }, [projectId]);

  // Save active instance ID to localStorage
  useEffect(() => {
    if (activeInstanceId) {
      localStorage.setItem(ACTIVE_KEY, activeInstanceId);
    }
  }, [activeInstanceId, ACTIVE_KEY]);

  /**
   * Create a new plugin instance
   */
  const createInstance = useCallback(async (pluginId: string, customConfig?: Record<string, any>): Promise<string> => {
    console.log('[PluginInstances] createInstance called with:', pluginId);
    const plugin = pluginService.getPlugin(pluginId);
    if (!plugin) {
      console.error(`[PluginInstances] Plugin not found: ${pluginId}`);
      return '';
    }

    // Count existing instances of this plugin for title
    const existingCount = Array.from(instances.values()).filter(i => i.pluginId === pluginId).length;
    const instanceNumber = existingCount + 1;
    const title = existingCount > 0 ? `${plugin.name} ${instanceNumber}` : plugin.name;

    // Generate a session ID
    const sessionId = `${pluginId}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    console.log('[PluginInstances] Generated session ID:', sessionId);

    try {
      console.log('[PluginInstances] Creating session in database...');
      console.log('[PluginInstances] Parameters:', {
        sessionId,
        projectId,
        pluginId,
        title,
        workingDirectory: defaultWorkingDirectory
      });

      // Create session in database
      const session = await pluginSessionService.createSession(sessionId, {
        project_id: projectId,
        plugin_id: pluginId,
        title,
        working_directory: defaultWorkingDirectory || '',
        model: 'claude-sonnet-4-5-20250929',
        permission_mode: 'default',
        config: customConfig ? JSON.stringify(customConfig) : undefined
      });
      console.log('[PluginInstances] Session created successfully:', session);

      const newInstance: PluginInstance = {
        id: session.id,
        pluginId: session.plugin_id,
        sessionId: session.id,
        title: session.title,
        createdAt: session.created_at,
        lastUsedAt: session.last_active || new Date().toISOString(),
        config: session.config ? JSON.parse(session.config) : {},
        workingDirectory: session.working_directory
      };

      setInstances(prev => new Map(prev).set(session.id, newInstance));
      setActiveInstanceId(session.id);
      console.log('[PluginInstances] Created instance:', session.id, pluginId);

      return session.id;
    } catch (error) {
      console.error('[PluginInstances] Failed to create session:', error);
      console.error('[PluginInstances] Error details:', JSON.stringify(error, null, 2));
      alert(`Failed to create session: ${error}`);
      return '';
    }
  }, [instances, defaultWorkingDirectory, projectId]);

  /**
   * Close a plugin instance (archives in database)
   */
  const closeInstance = useCallback(async (instanceId: string) => {
    try {
      // Archive session in database
      await pluginSessionService.archiveSession(instanceId);
      console.log('[PluginInstances] Archived session in database:', instanceId);
    } catch (error) {
      console.error('[PluginInstances] Failed to archive session:', error);
    }

    setInstances(prev => {
      const newInstances = new Map(prev);
      newInstances.delete(instanceId);

      // If closing the active instance, switch to another
      if (instanceId === activeInstanceId) {
        const remaining = Array.from(newInstances.keys());
        if (remaining.length > 0) {
          setActiveInstanceId(remaining[0]);
        } else {
          setActiveInstanceId(null);
        }
      }

      return newInstances;
    });

    console.log('[PluginInstances] Closed instance:', instanceId);
  }, [activeInstanceId]);

  /**
   * Switch to a different instance
   */
  const switchInstance = useCallback(async (instanceId: string) => {
    if (instances.has(instanceId)) {
      setActiveInstanceId(instanceId);

      // Update lastUsedAt in database
      try {
        await pluginSessionService.updateLastActive(instanceId);
      } catch (error) {
        console.error('[PluginInstances] Failed to update last active:', error);
      }

      // Update local state
      setInstances(prev => {
        const newInstances = new Map(prev);
        const instance = newInstances.get(instanceId);
        if (instance) {
          instance.lastUsedAt = new Date().toISOString();
        }
        return newInstances;
      });

      console.log('[PluginInstances] Switched to instance:', instanceId);
    }
  }, [instances]);

  /**
   * Update instance title
   */
  const updateInstanceTitle = useCallback(async (instanceId: string, title: string) => {
    try {
      await pluginSessionService.updateSession(instanceId, { title });
    } catch (error) {
      console.error('[PluginInstances] Failed to update title in database:', error);
    }

    setInstances(prev => {
      const newInstances = new Map(prev);
      const instance = newInstances.get(instanceId);
      if (instance) {
        instance.title = title;
      }
      return newInstances;
    });
  }, []);

  /**
   * Update instance config
   */
  const updateInstanceConfig = useCallback(async (instanceId: string, config: Record<string, any>) => {
    const instance = instances.get(instanceId);
    if (!instance) return;

    const newConfig = { ...instance.config, ...config };

    try {
      await pluginSessionService.updateSession(instanceId, { config: JSON.stringify(newConfig) });
    } catch (error) {
      console.error('[PluginInstances] Failed to update config in database:', error);
    }

    setInstances(prev => {
      const newInstances = new Map(prev);
      const updatedInstance = newInstances.get(instanceId);
      if (updatedInstance) {
        updatedInstance.config = newConfig;
      }
      return newInstances;
    });
  }, [instances]);

  /**
   * Get active instance
   */
  const getActiveInstance = useCallback((): PluginInstance | null => {
    if (!activeInstanceId) return null;
    return instances.get(activeInstanceId) || null;
  }, [activeInstanceId, instances]);

  /**
   * Get instances list sorted by creation time (stable order)
   */
  const getInstancesList = useCallback((): PluginInstance[] => {
    return Array.from(instances.values()).sort((a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }, [instances]);

  return {
    instances,
    activeInstanceId,
    createInstance,
    closeInstance,
    switchInstance,
    updateInstanceTitle,
    updateInstanceConfig,
    getActiveInstance,
    getInstancesList
  };
};