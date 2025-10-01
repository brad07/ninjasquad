import React, { useState, useEffect } from 'react';
import { Key, Eye, EyeOff, Save, Trash2, Shield, Check, AlertTriangle, Bot, MessageSquare, Settings, Database, Zap, ChevronRight, Bell, Brain, RefreshCw } from 'lucide-react';
import { apiKeyService, type ApiKeyConfig } from '../services/ApiKeyService';
import { SlackSettings } from './SlackSettings';
import { desktopNotificationService } from '../services/DesktopNotificationService';
import { claudeAgentService } from '../services/ClaudeAgentService';
import { ollamaService } from '../services/OllamaService';

type TabId = 'ai-models' | 'notifications' | 'database' | 'integrations';

interface Tab {
  id: TabId;
  label: string;
  icon: React.ReactNode;
  color: string;
}

export const AdminPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('ai-models');
  const [apiKeys, setApiKeys] = useState<ApiKeyConfig>({});
  const [showKeys, setShowKeys] = useState<{ [key: string]: boolean }>({});
  const [isSaving, setIsSaving] = useState(false);
  const [savedProviders, setSavedProviders] = useState<Set<string>>(new Set());
  const [validationErrors, setValidationErrors] = useState<{ [key: string]: string }>({});
  const [notificationCountdown, setNotificationCountdown] = useState<number | null>(null);

  // Ollama state
  const [ollamaConfig, setOllamaConfig] = useState(ollamaService.getConfig());
  const [ollamaHealth, setOllamaHealth] = useState<boolean | null>(null);
  const [ollamaModels, setOllamaModels] = useState<any[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  const tabs: Tab[] = [
    {
      id: 'ai-models',
      label: 'AI Models',
      icon: <Bot className="h-5 w-5" strokeWidth={2.5} />,
      color: 'purple'
    },
    {
      id: 'notifications',
      label: 'Notifications',
      icon: <Bell className="h-5 w-5" strokeWidth={2.5} />,
      color: 'blue'
    },
    {
      id: 'database',
      label: 'Database',
      icon: <Database className="h-5 w-5" strokeWidth={2.5} />,
      color: 'green'
    },
    {
      id: 'integrations',
      label: 'Integrations',
      icon: <Zap className="h-5 w-5" strokeWidth={2.5} />,
      color: 'orange'
    }
  ];

  useEffect(() => {
    // Load existing API keys
    const keys = apiKeyService.getAllKeys();
    setApiKeys(keys);

    // Check Ollama health and load models
    checkOllamaHealth();
  }, []);

  const checkOllamaHealth = async () => {
    const healthy = await ollamaService.checkHealth();
    setOllamaHealth(healthy);
    if (healthy) {
      loadOllamaModels();
    }
  };

  const loadOllamaModels = async () => {
    setLoadingModels(true);
    try {
      const models = await ollamaService.listModels();
      setOllamaModels(models);
    } catch (error) {
      console.error('Failed to load Ollama models:', error);
    } finally {
      setLoadingModels(false);
    }
  };

  const handleKeyChange = (provider: string, value: string) => {
    setApiKeys(prev => ({ ...prev, [provider]: value }));

    // Clear validation error when user starts typing
    if (validationErrors[provider]) {
      setValidationErrors(prev => {
        const next = { ...prev };
        delete next[provider];
        return next;
      });
    }

    // Clear saved indicator
    setSavedProviders(prev => {
      const next = new Set(prev);
      next.delete(provider);
      return next;
    });
  };

  const validateKey = (provider: string, key: string): boolean => {
    if (!key) return true; // Empty is valid (removes the key)

    const isValid = apiKeyService.validateKeyFormat(provider, key);
    if (!isValid) {
      const providerInfo = apiKeyService.getProviderInfo(provider);
      setValidationErrors(prev => ({
        ...prev,
        [provider]: `Invalid format. ${providerInfo?.name} keys should start with "${providerInfo?.keyPrefix || ''}" and be at least 20 characters.`
      }));
      return false;
    }
    return true;
  };

  const handleSaveKey = async (provider: string) => {
    const key = apiKeys[provider];

    if (!validateKey(provider, key || '')) {
      return;
    }

    apiKeyService.setKey(provider, key);
    setSavedProviders(prev => new Set([...prev, provider]));

    // If this is an Anthropic API key, initialize the Claude Agent service
    if (provider === 'anthropic' && key) {
      try {
        await claudeAgentService.initialize(key);
        console.log('Claude Agent service initialized with new API key');
      } catch (error) {
        console.error('Failed to initialize Claude Agent service:', error);
        // Don't fail the save operation, just log the error
      }
    }

    // Clear saved indicator after 2 seconds
    setTimeout(() => {
      setSavedProviders(prev => {
        const next = new Set(prev);
        next.delete(provider);
        return next;
      });
    }, 2000);
  };

  const handleSaveAll = async () => {
    setIsSaving(true);

    // Validate all keys
    let hasErrors = false;
    Object.entries(apiKeys).forEach(([provider, key]) => {
      if (key && !validateKey(provider, key)) {
        hasErrors = true;
      }
    });

    if (!hasErrors) {
      apiKeyService.setKeys(apiKeys);

      // If there's an Anthropic API key, initialize the Claude Agent service
      if (apiKeys.anthropic) {
        try {
          await claudeAgentService.initialize(apiKeys.anthropic);
          console.log('Claude Agent service initialized with new API key');
        } catch (error) {
          console.error('Failed to initialize Claude Agent service:', error);
          // Don't fail the save operation, just log the error
        }
      }

      // Show all as saved
      setSavedProviders(new Set(Object.keys(apiKeys)));

      setTimeout(() => {
        setIsSaving(false);
        setSavedProviders(new Set());
      }, 2000);
    } else {
      setIsSaving(false);
    }
  };

  const handleDeleteKey = (provider: string) => {
    apiKeyService.clearKey(provider);
    setApiKeys(prev => {
      const next = { ...prev };
      delete next[provider];
      return next;
    });
  };

  const toggleShowKey = (provider: string) => {
    setShowKeys(prev => ({ ...prev, [provider]: !prev[provider] }));
  };

  const getKeyStatus = (provider: string) => {
    if (savedProviders.has(provider)) return 'saved';
    if (validationErrors[provider]) return 'error';
    if (apiKeys[provider]) return 'configured';
    return 'empty';
  };

  const getTabColor = (tab: Tab, isActive: boolean) => {
    if (!isActive) return 'bg-gray-100 hover:bg-gray-200';

    switch (tab.color) {
      case 'purple':
        return 'bg-gradient-to-r from-purple-400 to-pink-400';
      case 'blue':
        return 'bg-gradient-to-r from-blue-400 to-cyan-400';
      case 'green':
        return 'bg-gradient-to-r from-green-400 to-emerald-400';
      case 'orange':
        return 'bg-gradient-to-r from-orange-400 to-yellow-400';
      default:
        return 'bg-gray-300';
    }
  };

  const renderAIModelsTab = () => (
    <div className="space-y-6">
      {/* Ollama Configuration Section */}
      <div className="bg-gradient-to-br from-purple-50 to-blue-50 border-4 border-purple-600 rounded-lg shadow-[6px_6px_0px_0px_rgba(147,51,234,1)] overflow-hidden">
        <div className="px-6 py-4 bg-gradient-to-r from-purple-600 to-blue-600 border-b-4 border-purple-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg border-2 border-white bg-white/20">
                <Brain className="h-6 w-6 text-white" strokeWidth={2.5} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">Ollama (Local AI)</h3>
                <div className="flex items-center gap-2 mt-1">
                  {ollamaHealth === true && (
                    <span className="text-xs bg-green-500 text-white px-2 py-0.5 rounded-full font-bold">
                      ✓ Connected
                    </span>
                  )}
                  {ollamaHealth === false && (
                    <span className="text-xs bg-red-500 text-white px-2 py-0.5 rounded-full font-bold">
                      Offline
                    </span>
                  )}
                  {ollamaModels.length > 0 && (
                    <span className="text-xs text-white/80">
                      {ollamaModels.length} models installed
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={checkOllamaHealth}
              className="p-2 text-white hover:bg-white/20 rounded-lg transition-colors"
              title="Refresh status"
            >
              <RefreshCw className="h-5 w-5" strokeWidth={2.5} />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {ollamaHealth === false && (
            <div className="p-4 bg-red-50 border-2 border-red-300 rounded-lg">
              <p className="text-sm text-red-800 font-medium mb-2">
                ⚠️ Ollama is not running or not installed
              </p>
              <p className="text-xs text-red-700">
                Install Ollama from <a href="https://ollama.ai/download" target="_blank" rel="noopener noreferrer" className="underline font-bold">ollama.ai/download</a> to enable local AI analysis
              </p>
            </div>
          )}

          {/* Enable/Disable Toggle */}
          <div className="flex items-center justify-between p-4 bg-white border-2 border-purple-300 rounded-lg">
            <div>
              <label className="text-sm font-bold text-gray-800">Enable Ollama Analysis</label>
              <p className="text-xs text-gray-600 mt-1">Analyze dev server output with local LLM</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={ollamaConfig.enabled}
                onChange={(e) => {
                  const newConfig = { ...ollamaConfig, enabled: e.target.checked };
                  setOllamaConfig(newConfig);
                  ollamaService.updateConfig({ enabled: e.target.checked });
                }}
                className="sr-only peer"
                disabled={ollamaHealth === false}
              />
              <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-500 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600 peer-disabled:opacity-50"></div>
            </label>
          </div>

          {/* Model Selection */}
          <div>
            <label className="block text-sm font-bold text-gray-800 mb-2">Model</label>
            <select
              value={ollamaConfig.model}
              onChange={(e) => {
                const newConfig = { ...ollamaConfig, model: e.target.value };
                setOllamaConfig(newConfig);
                ollamaService.updateConfig({ model: e.target.value });
              }}
              className="w-full px-4 py-2 bg-white border-2 border-purple-300 rounded-lg text-gray-800 focus:outline-none focus:border-purple-600 disabled:opacity-50"
              disabled={ollamaHealth === false || loadingModels}
            >
              {loadingModels && <option>Loading models...</option>}
              {!loadingModels && ollamaModels.length === 0 && <option>No models installed</option>}
              {!loadingModels && ollamaModels.map(model => (
                <option key={model.name} value={model.name}>
                  {model.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-600 mt-1">
              Pull models with: <code className="bg-gray-100 px-1 py-0.5 rounded font-mono">ollama pull llama3.1</code>
            </p>
          </div>

          {/* Advanced Settings */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-gray-800 mb-2">Temperature</label>
              <input
                type="number"
                min="0"
                max="2"
                step="0.1"
                value={ollamaConfig.temperature}
                onChange={(e) => {
                  const newConfig = { ...ollamaConfig, temperature: parseFloat(e.target.value) };
                  setOllamaConfig(newConfig);
                  ollamaService.updateConfig({ temperature: parseFloat(e.target.value) });
                }}
                className="w-full px-3 py-2 bg-white border-2 border-purple-300 rounded-lg text-gray-800 focus:outline-none focus:border-purple-600"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-800 mb-2">Max Tokens</label>
              <input
                type="number"
                min="100"
                max="2000"
                step="100"
                value={ollamaConfig.maxTokens}
                onChange={(e) => {
                  const newConfig = { ...ollamaConfig, maxTokens: parseInt(e.target.value) };
                  setOllamaConfig(newConfig);
                  ollamaService.updateConfig({ maxTokens: parseInt(e.target.value) });
                }}
                className="w-full px-3 py-2 bg-white border-2 border-purple-300 rounded-lg text-gray-800 focus:outline-none focus:border-purple-600"
              />
            </div>
          </div>

          {/* Installed Models */}
          {ollamaModels.length > 0 && (
            <div>
              <label className="block text-sm font-bold text-gray-800 mb-2">Installed Models</label>
              <div className="space-y-2">
                {ollamaModels.map(model => (
                  <div key={model.name} className="flex items-center justify-between p-3 bg-white border-2 border-purple-200 rounded-lg">
                    <div>
                      <p className="text-sm font-mono font-bold text-gray-800">{model.name}</p>
                      <p className="text-xs text-gray-600">
                        Modified: {new Date(model.modified_at).toLocaleDateString()}
                      </p>
                    </div>
                    {model.name === ollamaConfig.model && (
                      <span className="text-xs bg-purple-600 text-white px-2 py-1 rounded-full font-bold">
                        Active
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Cloud AI Providers Section */}
      <div>
        <h3 className="text-lg font-bold text-gray-800 mb-4">Cloud AI Providers</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {apiKeyService.getProvidersRequiringKeys().map(provider => {
        const status = getKeyStatus(provider.id);

        return (
          <div
            key={provider.id}
            className={`bg-white border-4 border-black rounded-lg overflow-hidden shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-all hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] ${
              status === 'saved' ? 'ring-2 ring-green-500 ring-offset-2' : ''
            }`}
          >
            {/* Card Header */}
            <div className={`px-6 py-4 border-b-4 border-black ${
              status === 'configured' ? 'bg-gradient-to-r from-green-100 to-emerald-100' :
              status === 'saved' ? 'bg-gradient-to-r from-green-200 to-emerald-200' :
              status === 'error' ? 'bg-gradient-to-r from-red-100 to-orange-100' :
              'bg-gradient-to-r from-gray-100 to-gray-50'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg border-2 border-black ${
                    status === 'configured' || status === 'saved' ? 'bg-green-500' :
                    status === 'error' ? 'bg-red-500' :
                    'bg-gray-400'
                  }`}>
                    <Key className="h-5 w-5 text-white" strokeWidth={2.5} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-black">{provider.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      {status === 'saved' && (
                        <span className="text-xs bg-green-500 text-white px-2 py-0.5 rounded-full font-bold">
                          ✓ Saved
                        </span>
                      )}
                      {status === 'configured' && (
                        <span className="text-xs bg-blue-500 text-white px-2 py-0.5 rounded-full font-bold">
                          Configured
                        </span>
                      )}
                      {provider.models && (
                        <span className="text-xs text-gray-600">
                          {provider.models.length} models
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {apiKeys[provider.id] && (
                  <button
                    onClick={() => handleDeleteKey(provider.id)}
                    className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                    title="Delete API key"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={2.5} />
                  </button>
                )}
              </div>
            </div>

            {/* Card Body */}
            <div className="p-6 space-y-4">
              {/* API Key Input */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2 uppercase">
                  API Key
                </label>
                <div className="relative">
                  <input
                    type={showKeys[provider.id] ? 'text' : 'password'}
                    value={apiKeys[provider.id] || ''}
                    onChange={(e) => handleKeyChange(provider.id, e.target.value)}
                    placeholder={provider.keyPlaceholder || `Enter ${provider.name} API key`}
                    className={`w-full px-4 py-3 pr-20 bg-white border-2 rounded-lg text-black placeholder-gray-400 focus:outline-none transition-all font-mono text-sm ${
                      validationErrors[provider.id]
                        ? 'border-red-500 focus:border-red-600 focus:shadow-[2px_2px_0px_0px_rgba(220,38,38,1)]'
                        : 'border-black focus:border-purple-600 focus:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                    }`}
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => toggleShowKey(provider.id)}
                      className="p-2 text-gray-600 hover:text-black hover:bg-gray-100 rounded transition-all"
                    >
                      {showKeys[provider.id] ?
                        <EyeOff className="h-4 w-4" strokeWidth={2} /> :
                        <Eye className="h-4 w-4" strokeWidth={2} />
                      }
                    </button>
                    <button
                      onClick={() => handleSaveKey(provider.id)}
                      className="p-2 text-purple-600 hover:text-white hover:bg-purple-600 rounded transition-all"
                    >
                      {savedProviders.has(provider.id) ?
                        <Check className="h-4 w-4" strokeWidth={2.5} /> :
                        <Save className="h-4 w-4" strokeWidth={2} />
                      }
                    </button>
                  </div>
                </div>

                {/* Validation Error */}
                {validationErrors[provider.id] && (
                  <div className="mt-2 flex items-start gap-2 text-red-600">
                    <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <p className="text-xs">{validationErrors[provider.id]}</p>
                  </div>
                )}

                {/* Help Text */}
                {!validationErrors[provider.id] && (
                  <p className="mt-2 text-xs text-gray-600">
                    {provider.keyPrefix && `Keys should start with "${provider.keyPrefix}"`}
                  </p>
                )}
              </div>

              {/* Available Models */}
              {provider.models && provider.models.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2 uppercase">
                    Available Models
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {provider.models.map(model => (
                      <span
                        key={model}
                        className="px-2 py-1 bg-gray-100 border border-gray-300 rounded text-xs font-mono text-gray-700"
                      >
                        {model}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
        </div>
      </div>
    </div>
  );

  const renderDatabaseTab = () => (
    <div className="bg-white border-4 border-black rounded-lg shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] p-8">
      <div className="flex flex-col items-center justify-center py-12">
        <div className="p-4 bg-gray-100 border-2 border-black rounded-lg mb-4">
          <Database className="h-12 w-12 text-gray-600" />
        </div>
        <h3 className="text-xl font-bold text-gray-800 mb-2">Database Configuration</h3>
        <p className="text-gray-600 text-center max-w-md">
          Database settings and connection configurations will be available here soon.
        </p>
      </div>
    </div>
  );

  const renderNotificationsTab = () => (
    <div className="space-y-6">
      {/* Desktop Notifications Test */}
      <div className="bg-white border-4 border-black rounded-lg shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] p-8">
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Bell className="h-5 w-5 text-blue-500" />
              Desktop Notifications Test
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Test desktop notifications to ensure they're working correctly on your system.
            </p>
            <button
              onClick={async () => {
                console.log('Test notification button clicked');
                try {
                  const { isPermissionGranted, requestPermission, sendNotification } = await import('@tauri-apps/plugin-notification');

                  // Use exact pattern from docs
                  let ok = await isPermissionGranted();
                  console.log('Permission status:', ok);

                  if (!ok) {
                    ok = (await requestPermission()) === 'granted';
                    console.log('After request:', ok);
                  }

                  if (ok) {
                    // Start countdown
                    setNotificationCountdown(5);

                    const countdownInterval = setInterval(() => {
                      setNotificationCountdown(prev => {
                        if (prev === null || prev <= 1) {
                          clearInterval(countdownInterval);
                          return null;
                        }
                        return prev - 1;
                      });
                    }, 1000);

                    // Wait 5 seconds before sending
                    setTimeout(() => {
                      console.log('Sending notification...');
                      sendNotification({ title: 'Ninja Squad', body: 'Test notification from dev build' });
                      console.log('Notification sent!');
                      setNotificationCountdown(null);
                    }, 5000);
                  } else {
                    alert('Notification permission denied.\n\nTo enable:\n1. Open System Settings\n2. Go to Notifications\n3. Find "ninjasquad" or "Ninja Squad"\n4. Enable notifications and set to Banners or Alerts');
                  }
                } catch (error) {
                  console.error('Test notification error:', error);
                  alert('Error sending test notification:\n' + error);
                  setNotificationCountdown(null);
                }
              }}
              disabled={notificationCountdown !== null}
              className="px-6 py-3 bg-blue-500 text-white border-2 border-black rounded-lg shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2 font-bold"
            >
              <Bell className="h-5 w-5" />
              {notificationCountdown !== null
                ? `Sending in ${notificationCountdown}s... (minimize app now)`
                : 'Send Test Notification'}
            </button>
            <p className="text-xs text-blue-600 bg-blue-50 border-2 border-blue-300 rounded p-3 mt-4">
              <strong>Note:</strong> Desktop notifications don't work reliably in development mode.
              <strong> Slack notifications are used instead</strong> - make sure Slack is configured below.
              In-app notification badges (purple count on Claude Code tab) work regardless.
            </p>
          </div>
        </div>
      </div>

      {/* Slack Settings */}
      <SlackSettings />
    </div>
  );

  const renderIntegrationsTab = () => (
    <div className="space-y-6">
      {/* Available Integrations */}
      <div className="bg-white border-4 border-black rounded-lg shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] p-8">
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Zap className="h-5 w-5 text-orange-500" />
              Available Integrations
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 border-2 border-black rounded-lg hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold">Linear</span>
                  <span className="text-xs bg-green-500 text-white px-2 py-1 rounded-full">Active</span>
                </div>
                <p className="text-sm text-gray-600">Issue tracking and project management</p>
              </div>
              <div className="p-4 border-2 border-black rounded-lg hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold">GitHub</span>
                  <span className="text-xs bg-gray-400 text-white px-2 py-1 rounded-full">Coming Soon</span>
                </div>
                <p className="text-sm text-gray-600">Repository and code management</p>
              </div>
              <div className="p-4 border-2 border-black rounded-lg hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold">Jira</span>
                  <span className="text-xs bg-gray-400 text-white px-2 py-1 rounded-full">Coming Soon</span>
                </div>
                <p className="text-sm text-gray-600">Advanced project tracking</p>
              </div>
              <div className="p-4 border-2 border-black rounded-lg hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold">Discord</span>
                  <span className="text-xs bg-gray-400 text-white px-2 py-1 rounded-full">Coming Soon</span>
                </div>
                <p className="text-sm text-gray-600">Team communication and notifications</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] rounded-lg p-6 mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-purple-500 p-3 rounded-lg border-2 border-black">
                <Settings className="h-8 w-8 text-white" strokeWidth={2.5} />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-black">Admin Settings</h1>
                <p className="text-gray-600 mt-1">Configure your workspace settings and integrations</p>
              </div>
            </div>
            {activeTab === 'ai-models' && (
              <button
                onClick={handleSaveAll}
                disabled={isSaving}
                className="px-6 py-3 bg-green-500 text-white border-2 border-black rounded-lg shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2 font-bold"
              >
                <Save className="h-5 w-5" strokeWidth={2.5} />
                {isSaving ? 'Saving...' : 'Save All Keys'}
              </button>
            )}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="bg-white border-4 border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] rounded-lg overflow-hidden mb-8">
          <div className="flex flex-wrap">
            {tabs.map((tab, index) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 min-w-[150px] px-6 py-4 font-bold transition-all flex items-center justify-center gap-2 ${
                  getTabColor(tab, activeTab === tab.id)
                } ${
                  activeTab === tab.id ? 'text-white' : 'text-gray-700 hover:text-black'
                } ${
                  index < tabs.length - 1 ? 'border-r-4 border-black' : ''
                }`}
              >
                {tab.icon}
                <span className="hidden sm:inline">{tab.label}</span>
                {activeTab === tab.id && (
                  <ChevronRight className="h-4 w-4 ml-1" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="transition-all">
          {activeTab === 'ai-models' && renderAIModelsTab()}
          {activeTab === 'notifications' && renderNotificationsTab()}
          {activeTab === 'database' && renderDatabaseTab()}
          {activeTab === 'integrations' && renderIntegrationsTab()}
        </div>

        {/* Security Notice */}
        <div className="mt-8 bg-blue-50 border-4 border-black rounded-lg p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <div className="flex items-start gap-3">
            <Shield className="h-6 w-6 text-blue-600 mt-0.5 flex-shrink-0" strokeWidth={2.5} />
            <div className="space-y-2">
              <h3 className="font-bold text-black">Security Notice</h3>
              <p className="text-sm text-gray-700">
                API keys are stored locally in your browser's localStorage. For production use,
                consider implementing server-side key management with encryption.
              </p>
              <p className="text-sm text-gray-700">
                Never share your API keys or commit them to version control.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminPage;