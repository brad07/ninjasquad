import React, { useState, useEffect } from 'react';
import { Key, Eye, EyeOff, Save, Trash2, Shield, Check, AlertTriangle, Bot, MessageSquare, Settings, Database, Zap, ChevronRight } from 'lucide-react';
import { apiKeyService, type ApiKeyConfig } from '../services/ApiKeyService';
import { SlackSettings } from './SlackSettings';

type TabId = 'ai-models' | 'slack' | 'database' | 'integrations';

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

  const tabs: Tab[] = [
    {
      id: 'ai-models',
      label: 'AI Models',
      icon: <Bot className="h-5 w-5" strokeWidth={2.5} />,
      color: 'purple'
    },
    {
      id: 'slack',
      label: 'Slack',
      icon: <MessageSquare className="h-5 w-5" strokeWidth={2.5} />,
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
  }, []);

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

  const handleSaveKey = (provider: string) => {
    const key = apiKeys[provider];

    if (!validateKey(provider, key || '')) {
      return;
    }

    apiKeyService.setKey(provider, key);
    setSavedProviders(prev => new Set([...prev, provider]));

    // Clear saved indicator after 2 seconds
    setTimeout(() => {
      setSavedProviders(prev => {
        const next = new Set(prev);
        next.delete(provider);
        return next;
      });
    }, 2000);
  };

  const handleSaveAll = () => {
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

  const renderIntegrationsTab = () => (
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
          {activeTab === 'slack' && <SlackSettings />}
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