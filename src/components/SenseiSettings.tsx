import React, { useState, useEffect } from 'react';
import { X, Save, RotateCcw, Eye, EyeOff, AlertTriangle } from 'lucide-react';
import { senseiService, type SenseiConfig } from '../services/SenseiService';

interface SenseiSettingsProps {
  serverId: string;
  sessionId: string;
  isOpen: boolean;
  onClose: () => void;
}

const AI_MODELS = [
  { value: 'gpt-4-turbo-preview', label: 'GPT-4 Turbo', provider: 'OpenAI' },
  { value: 'gpt-4', label: 'GPT-4', provider: 'OpenAI' },
  { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo', provider: 'OpenAI' },
  { value: 'claude-3-opus', label: 'Claude 3 Opus', provider: 'Anthropic' },
  { value: 'claude-3-sonnet', label: 'Claude 3 Sonnet', provider: 'Anthropic' },
];

const DEFAULT_PROMPTS = {
  general: `You are Sensei, an AI assistant helping developers with OpenCode sessions.
Analyze the terminal output and provide helpful recommendations for what to do next.
When suggesting commands, format them clearly so they can be optionally executed automatically.

Guidelines:
- Be concise and actionable
- Focus on the most recent output
- Suggest specific commands when appropriate
- Consider the context of the current task
- Identify errors and suggest fixes
- Recommend next steps in the development workflow

Format your response as JSON with the following structure:
{
  "recommendation": "Your recommendation text here",
  "command": "optional command to execute",
  "confidence": 0.0 to 1.0
}`,

  debugging: `You are a debugging assistant. Focus on:
- Identifying errors and their root causes
- Suggesting debugging commands and techniques
- Providing fix recommendations
- Explaining error messages clearly

Format responses as JSON with recommendation, command, and confidence fields.`,

  testing: `You are a testing assistant. Focus on:
- Suggesting test commands to run
- Identifying missing test coverage
- Recommending test improvements
- Catching potential bugs before they happen

Format responses as JSON with recommendation, command, and confidence fields.`,

  performance: `You are a performance optimization assistant. Focus on:
- Identifying performance bottlenecks
- Suggesting optimization techniques
- Recommending profiling commands
- Analyzing benchmark results

Format responses as JSON with recommendation, command, and confidence fields.`,
};

export const SenseiSettings: React.FC<SenseiSettingsProps> = ({
  serverId,
  sessionId,
  isOpen,
  onClose
}) => {
  const [config, setConfig] = useState<SenseiConfig>({
    enabled: false,
    model: 'gpt-4-turbo-preview',
    systemPrompt: DEFAULT_PROMPTS.general,
    autoExecute: false,
    apiKey: '',
    temperature: 0.7,
    maxTokens: 500,
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedPromptTemplate, setSelectedPromptTemplate] = useState('general');

  useEffect(() => {
    if (isOpen) {
      const session = senseiService.getSession(serverId, sessionId);
      if (session) {
        setConfig(session.config);
      }
    }
  }, [isOpen, serverId, sessionId]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      senseiService.updateConfig(serverId, sessionId, config);

      // If enabled and API key is set, initialize the session
      if (config.enabled && config.apiKey) {
        senseiService.initializeSession(serverId, sessionId, config);
      }

      setTimeout(() => {
        setIsSaving(false);
        onClose();
      }, 500);
    } catch (error) {
      console.error('Failed to save Sensei settings:', error);
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setConfig({
      ...config,
      systemPrompt: DEFAULT_PROMPTS[selectedPromptTemplate as keyof typeof DEFAULT_PROMPTS],
    });
  };

  const applyPromptTemplate = (template: string) => {
    setSelectedPromptTemplate(template);
    setConfig({
      ...config,
      systemPrompt: DEFAULT_PROMPTS[template as keyof typeof DEFAULT_PROMPTS],
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg w-[600px] max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white">Sensei Settings</h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* API Configuration */}
          <div>
            <h3 className="text-sm font-medium text-gray-300 mb-3">API Configuration</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  OpenAI API Key
                </label>
                <div className="relative">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={config.apiKey || ''}
                    onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
                    placeholder="sk-..."
                    className="w-full px-3 py-2 pr-10 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-200"
                  >
                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Required for Sensei to work. Get your API key from OpenAI dashboard.
                </p>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  AI Model
                </label>
                <select
                  value={config.model}
                  onChange={(e) => setConfig({ ...config, model: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:border-blue-500 focus:outline-none"
                >
                  {AI_MODELS.map((model) => (
                    <option key={model.value} value={model.value}>
                      {model.label} ({model.provider})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Behavior Settings */}
          <div>
            <h3 className="text-sm font-medium text-gray-300 mb-3">Behavior</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm text-gray-400">Auto-Execute Commands</label>
                  <p className="text-xs text-gray-500 mt-1">
                    Automatically execute high-confidence recommendations
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setConfig({ ...config, autoExecute: !config.autoExecute })}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    config.autoExecute ? 'bg-blue-600' : 'bg-gray-600'
                  }`}
                >
                  <div
                    className={`absolute top-1 h-4 w-4 bg-white rounded-full transition-transform ${
                      config.autoExecute ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {config.autoExecute && (
                <div className="p-3 bg-yellow-900/20 border border-yellow-700 rounded">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-400 mt-0.5" />
                    <div className="text-xs text-yellow-400">
                      <p className="font-medium mb-1">Warning: Auto-execution enabled</p>
                      <p>Commands with confidence above 70% will be executed automatically. Only enable this if you trust the AI's recommendations.</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm text-gray-400 mb-1">
                    Temperature
                  </label>
                  <input
                    type="number"
                    value={config.temperature}
                    onChange={(e) => setConfig({ ...config, temperature: parseFloat(e.target.value) })}
                    min="0"
                    max="2"
                    step="0.1"
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:border-blue-500 focus:outline-none"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Higher = more creative (0-2)
                  </p>
                </div>

                <div className="flex-1">
                  <label className="block text-sm text-gray-400 mb-1">
                    Max Tokens
                  </label>
                  <input
                    type="number"
                    value={config.maxTokens}
                    onChange={(e) => setConfig({ ...config, maxTokens: parseInt(e.target.value) })}
                    min="50"
                    max="2000"
                    step="50"
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:border-blue-500 focus:outline-none"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Maximum response length
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* System Prompt */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-300">System Prompt</h3>
              <div className="flex items-center gap-2">
                <select
                  value={selectedPromptTemplate}
                  onChange={(e) => applyPromptTemplate(e.target.value)}
                  className="px-2 py-1 text-xs bg-gray-700 border border-gray-600 rounded text-white focus:border-blue-500 focus:outline-none"
                >
                  <option value="general">General</option>
                  <option value="debugging">Debugging</option>
                  <option value="testing">Testing</option>
                  <option value="performance">Performance</option>
                </select>
                <button
                  onClick={handleReset}
                  className="p-1 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded transition-colors"
                  title="Reset to template"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
              </div>
            </div>
            <textarea
              value={config.systemPrompt}
              onChange={(e) => setConfig({ ...config, systemPrompt: e.target.value })}
              rows={8}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none font-mono text-xs"
              placeholder="Enter system prompt..."
            />
            <p className="mt-1 text-xs text-gray-500">
              This prompt defines Sensei's behavior and analysis approach
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-700">
          <div className="text-xs text-gray-500">
            {config.apiKey ? 'API key configured' : 'API key required'}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || !config.apiKey}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              <Save className="h-4 w-4" />
              {isSaving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SenseiSettings;