import React, { useState, useEffect } from 'react';
import { ChevronDown, Settings, Key, Bot } from 'lucide-react';
import ClaudeIcon from './icons/ClaudeIcon';
import { pluginService } from '../services/PluginService';
import type { CodingAgentPlugin, PluginSettings } from '../types/plugin';
import { Button } from '@/components/retroui/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/retroui/DropdownMenu';

interface PluginSelectorProps {
  onPluginChange?: (plugin: CodingAgentPlugin) => void;
  className?: string;
}

const PluginSelector: React.FC<PluginSelectorProps> = ({ onPluginChange, className }) => {
  const [plugins, setPlugins] = useState<CodingAgentPlugin[]>([]);
  const [activePlugin, setActivePlugin] = useState<CodingAgentPlugin | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [timeout, setTimeout] = useState(600); // Default 600 seconds (10 minutes)

  useEffect(() => {
    loadPlugins();
  }, []);

  const loadPlugins = () => {
    const allPlugins = pluginService.getPlugins();
    setPlugins(allPlugins);

    const active = pluginService.getActivePlugin();
    if (active) {
      setActivePlugin(active);
      loadPluginSettings(active);
    }
  };

  const loadPluginSettings = (plugin: CodingAgentPlugin) => {
    const settings = pluginService.getPluginSettings(plugin.id);
    if (settings) {
      setApiKey(settings.apiKey || '');
      setSelectedModel(settings.model || plugin.defaultModel);
      setTimeout(settings.timeout || 600);
    } else {
      setApiKey('');
      setSelectedModel(plugin.defaultModel);
      setTimeout(600);
    }
  };

  const handlePluginSelect = async (plugin: CodingAgentPlugin) => {
    try {
      await pluginService.setActivePlugin(plugin.id);
      setActivePlugin(plugin);
      loadPluginSettings(plugin);
      setIsOpen(false);

      if (onPluginChange) {
        onPluginChange(plugin);
      }

      // Show settings if API key is required but not set
      if (plugin.requiresApiKey && !pluginService.getPluginSettings(plugin.id)?.apiKey) {
        setShowSettings(true);
      }
    } catch (error) {
      console.error('Failed to set active plugin:', error);
    }
  };

  const handleSaveSettings = async () => {
    if (!activePlugin) return;

    try {
      const settings: Partial<PluginSettings> = {
        pluginId: activePlugin.id,
        model: selectedModel,
        timeout: timeout
      };

      if (activePlugin.requiresApiKey) {
        settings.apiKey = apiKey;
      }

      await pluginService.updatePluginSettings(activePlugin.id, settings);
      setShowSettings(false);
    } catch (error) {
      console.error('Failed to save plugin settings:', error);
    }
  };

  const getPluginIcon = (plugin: CodingAgentPlugin) => {
    // Use ClaudeIcon for Claude Code plugin
    if (plugin.id === 'claude-code') {
      return <ClaudeIcon className="text-orange-600" size="20" />;
    }
    if (plugin.icon) {
      return <img src={plugin.icon} alt={plugin.name} className="w-5 h-5 filter brightness-0" />;
    }
    // Default icon
    return <div className="w-5 h-5 bg-gray-400 rounded" />;
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="font-bold shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all border-2 border-black bg-cyan-400 hover:bg-cyan-500 text-black"
          >
            {activePlugin ? (
              <>
                {getPluginIcon(activePlugin)}
                <span className="ml-2">{activePlugin.name}</span>
              </>
            ) : (
              <>
                <Bot className="w-4 h-4" />
                <span className="ml-2">Select Agent</span>
              </>
            )}
            <ChevronDown className="ml-2 h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-72 !bg-white">
          <DropdownMenuLabel className="bg-white">Coding Agents</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {plugins.sort((a, b) => a.name.localeCompare(b.name)).map(plugin => (
            <DropdownMenuItem
              key={plugin.id}
              onClick={() => handlePluginSelect(plugin)}
              className="cursor-pointer bg-white hover:bg-yellow-400"
            >
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center space-x-3">
                  {getPluginIcon(plugin)}
                  <div>
                    <div className="font-bold">{plugin.name}</div>
                    <div className="text-xs text-gray-600">{plugin.description}</div>
                  </div>
                </div>
                {plugin.id === activePlugin?.id && (
                  <div className="w-2 h-2 bg-cyan-500 rounded-full" />
                )}
              </div>
            </DropdownMenuItem>
          ))}
          {activePlugin && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setShowSettings(true)}
                className="cursor-pointer"
              >
                <Settings className="w-4 h-4 mr-2" />
                <span>Plugin Settings</span>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Settings Modal */}
      {showSettings && activePlugin && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white border-4 border-black rounded-lg shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-6 w-96">
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              {activePlugin.name} Settings
            </h3>

            {/* API Key Input (if required) */}
            {activePlugin.requiresApiKey && (
              <div className="mb-4">
                <label className="flex items-center space-x-2 text-sm font-medium text-gray-700 mb-2">
                  <Key className="w-4 h-4" />
                  <span>API Key</span>
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter your API key"
                  className="w-full px-3 py-2 bg-white border-2 border-black rounded text-gray-900 focus:outline-none focus:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Required to use {activePlugin.name}
                </p>
              </div>
            )}

            {/* Model Selection */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Model
              </label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full px-3 py-2 bg-white border-2 border-black rounded text-gray-900 focus:outline-none focus:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
              >
                {activePlugin.supportedModels.map(model => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </div>

            {/* Timeout Setting */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Timeout (seconds)
              </label>
              <input
                type="number"
                value={timeout}
                onChange={(e) => setTimeout(parseInt(e.target.value, 10) || 600)}
                min="1"
                max="3600"
                className="w-full px-3 py-2 bg-white border-2 border-black rounded text-gray-900 focus:outline-none focus:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
              />
              <p className="text-xs text-gray-500 mt-1">
                Maximum time to wait for agent responses (default: 600 seconds / 10 minutes)
              </p>
            </div>

            {/* Plugin Capabilities */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Capabilities
              </label>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {Object.entries(activePlugin.capabilities).map(([key, value]) => {
                  if (typeof value === 'boolean') {
                    return (
                      <div key={key} className="flex items-center space-x-1">
                        <div className={`w-2 h-2 rounded-full ${value ? 'bg-green-500' : 'bg-gray-400'}`} />
                        <span className="text-gray-600">
                          {key.replace(/([A-Z])/g, ' $1').trim()}
                        </span>
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            </div>

            {/* Custom Tools (if any) */}
            {activePlugin.capabilities.customTools.length > 0 && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Custom Tools
                </label>
                <div className="flex flex-wrap gap-1">
                  {activePlugin.capabilities.customTools.map(tool => (
                    <span key={tool} className="px-2 py-1 bg-purple-100 border border-purple-300 rounded text-xs text-purple-700 font-medium">
                      {tool}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex space-x-3">
              <button
                onClick={() => setShowSettings(false)}
                className="flex-1 px-4 py-2 bg-gray-200 text-black font-bold border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all rounded"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSettings}
                className="flex-1 px-4 py-2 bg-green-400 text-black font-bold border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:bg-green-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed rounded"
                disabled={activePlugin.requiresApiKey && !apiKey}
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default PluginSelector;