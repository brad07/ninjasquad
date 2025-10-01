import { useState, useEffect, useCallback } from 'react';
import type { PluginInstance } from '../types/plugin-instance';
import { pluginService } from '../services/PluginService';

/**
 * Hook to manage multiple plugin instances (tabs) for a project
 * Each instance can be any plugin (Claude Agent, Claude Code, etc.)
 * Multiple instances of the same plugin are supported
 */
export const usePluginInstances = (projectId: string, defaultWorkingDirectory?: string) => {
  const [instances, setInstances] = useState<Map<string, PluginInstance>>(new Map());
  const [activeInstanceId, setActiveInstanceId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const STORAGE_KEY = `plugin-instances-${projectId}`;
  const ACTIVE_KEY = `plugin-active-instance-${projectId}`;

  // Load instances from localStorage on mount or when projectId changes
  useEffect(() => {
    console.log('[PluginInstances] Loading instances for project:', projectId);
    console.log('[PluginInstances] Storage key:', STORAGE_KEY);

    setIsLoading(true);
    // Clear old instances immediately when project changes
    setInstances(new Map());
    setActiveInstanceId(null);

    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      const savedActiveId = localStorage.getItem(ACTIVE_KEY);

      console.log('[PluginInstances] Raw localStorage data:', saved);

      if (saved) {
        const instancesArray: PluginInstance[] = JSON.parse(saved);
        const instancesMap = new Map(instancesArray.map(i => [i.id, i]));
        setInstances(instancesMap);

        console.log('[PluginInstances] Parsed instances:', instancesArray);

        // Restore active instance
        if (savedActiveId && instancesMap.has(savedActiveId)) {
          setActiveInstanceId(savedActiveId);
          console.log('[PluginInstances] Restored active instance:', savedActiveId);
        } else if (instancesMap.size > 0) {
          setActiveInstanceId(instancesArray[0].id);
          console.log('[PluginInstances] Set first instance as active:', instancesArray[0].id);
        }

        console.log('[PluginInstances] Loaded', instancesArray.length, 'instances for project:', projectId);
      } else {
        console.log('[PluginInstances] No saved instances for project:', projectId);
      }
    } catch (error) {
      console.error('[PluginInstances] Failed to load from localStorage:', error);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  // Save instances to localStorage whenever they change
  useEffect(() => {
    // Don't save while loading to prevent clearing localStorage during mount
    if (isLoading) {
      console.log('[PluginInstances] Skipping save (still loading)');
      return;
    }

    try {
      if (instances.size > 0) {
        const instancesArray = Array.from(instances.values());
        localStorage.setItem(STORAGE_KEY, JSON.stringify(instancesArray));
        console.log('[PluginInstances] Saved', instancesArray.length, 'instances to localStorage');
      } else {
        // Clear localStorage when all instances are closed
        const activeKey = `plugin-active-instance-${projectId}`;
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(activeKey);
        console.log('[PluginInstances] Cleared localStorage (no instances)');
      }
    } catch (error) {
      console.error('[PluginInstances] Failed to save to localStorage:', error);
    }
  }, [instances, STORAGE_KEY, projectId, isLoading]);

  // Save active instance ID
  useEffect(() => {
    if (activeInstanceId) {
      localStorage.setItem(ACTIVE_KEY, activeInstanceId);
    }
  }, [activeInstanceId, ACTIVE_KEY]);

  /**
   * Create a new plugin instance
   */
  const createInstance = useCallback((pluginId: string, customConfig?: Record<string, any>): string => {
    const plugin = pluginService.getPlugin(pluginId);
    if (!plugin) {
      console.error(`[PluginInstances] Plugin not found: ${pluginId}`);
      return '';
    }

    const instanceId = `${pluginId}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Count existing instances of this plugin for title
    const existingCount = Array.from(instances.values()).filter(i => i.pluginId === pluginId).length;
    const instanceNumber = existingCount + 1;

    const newInstance: PluginInstance = {
      id: instanceId,
      pluginId,
      sessionId,
      title: existingCount > 0 ? `${plugin.name} ${instanceNumber}` : plugin.name,
      createdAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString(),
      config: customConfig || {},
      workingDirectory: defaultWorkingDirectory
    };

    setInstances(prev => new Map(prev).set(instanceId, newInstance));
    setActiveInstanceId(instanceId);
    console.log('[PluginInstances] Created instance:', instanceId, pluginId);

    return instanceId;
  }, [instances, defaultWorkingDirectory]);

  /**
   * Close a plugin instance
   */
  const closeInstance = useCallback((instanceId: string) => {
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
  const switchInstance = useCallback((instanceId: string) => {
    if (instances.has(instanceId)) {
      setActiveInstanceId(instanceId);

      // Update lastUsedAt
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
  const updateInstanceTitle = useCallback((instanceId: string, title: string) => {
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
  const updateInstanceConfig = useCallback((instanceId: string, config: Record<string, any>) => {
    setInstances(prev => {
      const newInstances = new Map(prev);
      const instance = newInstances.get(instanceId);
      if (instance) {
        instance.config = { ...instance.config, ...config };
      }
      return newInstances;
    });
  }, []);

  /**
   * Get active instance
   */
  const getActiveInstance = useCallback((): PluginInstance | null => {
    if (!activeInstanceId) return null;
    return instances.get(activeInstanceId) || null;
  }, [activeInstanceId, instances]);

  /**
   * Get instances list sorted by last used
   */
  const getInstancesList = useCallback((): PluginInstance[] => {
    return Array.from(instances.values()).sort((a, b) =>
      new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime()
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