import React, { useState } from 'react';
import { Plus, X, Edit2, Check } from 'lucide-react';
import type { PluginInstance } from '../types/plugin-instance';
import type { CodingAgentPlugin } from '../types/plugin';
import { pluginService } from '../services/PluginService';
import ClaudeIcon from './icons/ClaudeIcon';

interface PluginTabBarProps {
  instances: PluginInstance[];
  activeInstanceId: string | null;
  onSwitchInstance: (instanceId: string) => void | Promise<void>;
  onCreateInstance: (pluginId: string) => void | Promise<void>;
  onCloseInstance: (instanceId: string) => void | Promise<void>;
  onRenameInstance: (instanceId: string, newTitle: string) => void | Promise<void>;
}

export const PluginTabBar: React.FC<PluginTabBarProps> = ({
  instances,
  activeInstanceId,
  onSwitchInstance,
  onCreateInstance,
  onCloseInstance,
  onRenameInstance
}) => {
  const [editingInstanceId, setEditingInstanceId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [showPluginSelector, setShowPluginSelector] = useState(false);

  const startEditing = (instance: PluginInstance, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingInstanceId(instance.id);
    setEditTitle(instance.title);
  };

  const finishEditing = async (instanceId: string) => {
    if (editTitle.trim()) {
      await onRenameInstance(instanceId, editTitle.trim());
    }
    setEditingInstanceId(null);
    setEditTitle('');
  };

  const cancelEditing = () => {
    setEditingInstanceId(null);
    setEditTitle('');
  };

  const getPluginIcon = (pluginId: string) => {
    const plugin = pluginService.getPlugin(pluginId);
    if (!plugin) return <div className="w-4 h-4 bg-gray-400 rounded" />;

    if (pluginId === 'claude-code' || pluginId === 'claude-agent-direct') {
      return <ClaudeIcon className="text-orange-600" size="16" />;
    }
    if (plugin.icon) {
      return <img src={plugin.icon} alt={plugin.name} className="w-4 h-4 filter brightness-0" />;
    }
    return <div className="w-4 h-4 bg-gray-400 rounded" />;
  };

  const handleSelectPlugin = async (plugin: CodingAgentPlugin) => {
    await onCreateInstance(plugin.id);
    setShowPluginSelector(false);
  };

  return (
    <>
      <div className="flex items-center bg-gradient-to-b from-gray-700 to-gray-800 border-b-4 border-black p-1 gap-1 overflow-x-auto">
        {/* Instance tabs */}
        {instances.map((instance) => {
          const isActive = instance.id === activeInstanceId;
          const isEditing = editingInstanceId === instance.id;

          return (
            <div
              key={instance.id}
              onClick={() => !isEditing && onSwitchInstance(instance.id)}
              className={`
                group relative flex items-center gap-2 px-3 py-1.5 border-2 border-black
                ${isActive
                  ? 'bg-gradient-to-b from-cyan-400 to-cyan-500 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                  : 'bg-gradient-to-b from-gray-500 to-gray-600 hover:from-gray-400 hover:to-gray-500'
                }
                transition-all cursor-pointer min-w-[120px] max-w-[250px]
              `}
            >
              {/* Plugin icon */}
              {getPluginIcon(instance.pluginId)}

              {/* Instance title or edit input */}
              {isEditing ? (
                <div className="flex items-center gap-1 flex-1">
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') finishEditing(instance.id);
                      if (e.key === 'Escape') cancelEditing();
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 px-1 py-0.5 bg-white border border-black text-xs font-mono text-black focus:outline-none focus:border-cyan-400"
                    autoFocus
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      finishEditing(instance.id);
                    }}
                    className="p-0.5 bg-green-400 border border-black hover:bg-green-300"
                  >
                    <Check className="w-3 h-3 text-black" />
                  </button>
                </div>
              ) : (
                <>
                  {/* Instance title */}
                  <span className="font-mono text-xs font-bold text-white truncate flex-1">
                    {instance.title}
                  </span>

                  {/* Edit button (visible on hover) */}
                  <button
                    onClick={(e) => startEditing(instance, e)}
                    className="p-0.5 bg-gray-700 border border-black hover:bg-gray-600 transition-colors opacity-0 group-hover:opacity-100"
                    title="Rename tab"
                  >
                    <Edit2 className="w-3 h-3 text-white" />
                  </button>

                  {/* Close button - always visible */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloseInstance(instance.id);
                    }}
                    className="p-0.5 bg-red-400 border border-black hover:bg-red-500"
                    title="Close tab"
                  >
                    <X className="w-3 h-3 text-black" />
                  </button>
                </>
              )}
            </div>
          );
        })}

        {/* New instance button */}
        <button
          onClick={() => setShowPluginSelector(true)}
          className="flex items-center gap-1 px-3 py-1.5 bg-gradient-to-b from-green-400 to-green-500 border-2 border-black hover:from-green-300 hover:to-green-400 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] transition-all"
          title="New plugin instance"
        >
          <Plus className="w-4 h-4 text-black font-bold" strokeWidth={3} />
          <span className="font-mono text-xs font-bold text-black">NEW</span>
        </button>
      </div>

      {/* Plugin Selector Modal */}
      {showPluginSelector && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white border-4 border-black rounded-lg p-6 w-[500px] max-w-full shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
            <h3 className="text-2xl font-bold mb-4 text-black">Select Plugin</h3>

            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {pluginService.getPlugins().filter(p => p.enabled !== false).map((plugin) => (
                <button
                  key={plugin.id}
                  onClick={() => handleSelectPlugin(plugin)}
                  className="w-full flex items-center gap-3 p-3 bg-white border-2 border-black hover:bg-cyan-100 transition-colors text-left shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]"
                >
                  <div className="flex-shrink-0">
                    {plugin.id === 'claude-code' || plugin.id === 'claude-agent-direct' ? (
                      <ClaudeIcon className="text-orange-600" size="24" />
                    ) : plugin.icon ? (
                      <img src={plugin.icon} alt={plugin.name} className="w-6 h-6 filter brightness-0" />
                    ) : (
                      <div className="w-6 h-6 bg-gray-400 rounded" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-black">{plugin.name}</div>
                    <div className="text-xs text-gray-600">{plugin.description}</div>
                  </div>
                </button>
              ))}
            </div>

            <div className="flex justify-end mt-4">
              <button
                onClick={() => setShowPluginSelector(false)}
                className="px-4 py-2 bg-gray-200 text-black font-bold border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all rounded"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};