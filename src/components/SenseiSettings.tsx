import React, { useState, useEffect } from 'react';
import { X, Save, RotateCcw, AlertTriangle, Settings } from 'lucide-react';
import { senseiService, type SenseiConfig } from '../services/SenseiService';
import { apiKeyService } from '../services/ApiKeyService';

interface SenseiSettingsProps {
  serverId: string;
  sessionId: string;
  isOpen: boolean;
  onClose: () => void;
}

const AI_MODELS = [
  { value: 'gpt-5', label: 'GPT-5', provider: 'OpenAI' },
  { value: 'gpt-4-turbo-preview', label: 'GPT-4 Turbo', provider: 'OpenAI' },
  { value: 'gpt-4', label: 'GPT-4', provider: 'OpenAI' },
  { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo', provider: 'OpenAI' },
  { value: 'claude-3-opus', label: 'Claude 3 Opus', provider: 'Anthropic' },
  { value: 'claude-3-sonnet', label: 'Claude 3 Sonnet', provider: 'Anthropic' },
];

const DEFAULT_PROMPTS = {
  general: `You are SensAI, an AI assistant helping developers with OpenCode sessions.
Analyze the terminal output and provide helpful recommendations for what to do next.

Guidelines:
- Be concise and actionable
- Focus on the most recent output
- Consider the context of the current task
- Identify errors and suggest fixes
- Recommend next steps in the development workflow
- Provide clear guidance without specifying exact commands

Format your response as JSON with the following structure:
{
  "recommendation": "Your recommendation text here",
  "confidence": 0.0 to 1.0
}`,

  debugging: `You are a debugging assistant. Focus on:
- Identifying errors and their root causes
- Suggesting debugging strategies and techniques
- Providing fix recommendations
- Explaining error messages clearly
- Guiding through the debugging process

Format your response as JSON with the following structure:
{
  "recommendation": "Your debugging guidance here",
  "confidence": 0.0 to 1.0
}`,

  testing: `You are a testing assistant. Focus on:
- Suggesting what tests should be run
- Identifying missing test coverage
- Recommending test improvements
- Catching potential bugs before they happen
- Explaining test failures and how to fix them

Format your response as JSON with the following structure:
{
  "recommendation": "Your testing guidance here",
  "confidence": 0.0 to 1.0
}`,

  performance: `You are a performance optimization assistant. Focus on:
- Identifying performance bottlenecks
- Suggesting optimization techniques
- Recommending profiling strategies
- Analyzing benchmark results
- Providing actionable performance improvements

Format your response as JSON with the following structure:
{
  "recommendation": "Your performance guidance here",
  "confidence": 0.0 to 1.0
}`,
};

export const SenseiSettings: React.FC<SenseiSettingsProps> = ({
  serverId,
  sessionId,
  isOpen,
  onClose
}) => {
  const [config, setConfig] = useState<SenseiConfig>({
    enabled: false,
    model: 'gpt-5',
    systemPrompt: DEFAULT_PROMPTS.general,
    autoExecute: false,
    temperature: 1,
    maxTokens: 5000,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [selectedPromptTemplate, setSelectedPromptTemplate] = useState('general');

  useEffect(() => {
    if (isOpen) {
      const session = senseiService.getSession(serverId, sessionId);
      if (session) {
        // Use existing config - only use defaults if value is undefined
        setConfig({
          enabled: session.config.enabled ?? false,
          model: session.config.model || 'gpt-5',
          // Only use default prompt if systemPrompt is undefined, preserve empty strings
          systemPrompt: session.config.systemPrompt !== undefined ? session.config.systemPrompt : DEFAULT_PROMPTS.general,
          autoExecute: session.config.autoExecute ?? false,
          temperature: session.config.temperature ?? 1,
          maxTokens: session.config.maxTokens || 5000,
        });
        // Detect which template is being used (if any)
        const matchingTemplate = Object.entries(DEFAULT_PROMPTS).find(
          ([_, prompt]) => prompt === session.config.systemPrompt
        );
        if (matchingTemplate) {
          setSelectedPromptTemplate(matchingTemplate[0]);
        } else {
          setSelectedPromptTemplate('custom');
        }
      } else {
        // New session - use defaults
        setConfig({
          enabled: false,
          model: 'gpt-5',
          systemPrompt: DEFAULT_PROMPTS.general,
          autoExecute: false,
          temperature: 1,
          maxTokens: 5000,
        });
        setSelectedPromptTemplate('general');
      }
    }
  }, [isOpen, serverId, sessionId]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Update Sensei config
      senseiService.updateConfig(serverId, sessionId, config);

      // If enabled, initialize the session
      if (config.enabled) {
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
    // Reset to the selected template, or general if custom is selected
    const templateToUse = selectedPromptTemplate === 'custom' ? 'general' : selectedPromptTemplate;
    if (templateToUse in DEFAULT_PROMPTS) {
      setConfig({
        ...config,
        systemPrompt: DEFAULT_PROMPTS[templateToUse as keyof typeof DEFAULT_PROMPTS],
      });
      setSelectedPromptTemplate(templateToUse);
    }
  };

  const applyPromptTemplate = (template: string) => {
    setSelectedPromptTemplate(template);
    if (template !== 'custom' && template in DEFAULT_PROMPTS) {
      setConfig({
        ...config,
        systemPrompt: DEFAULT_PROMPTS[template as keyof typeof DEFAULT_PROMPTS],
      });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] rounded-lg w-[600px] max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b-4 border-black bg-gradient-to-r from-purple-100 to-pink-100">
          <h2 className="text-xl font-bold text-black">SensAI Settings</h2>
          <button
            onClick={onClose}
            className="p-2 text-black hover:bg-black hover:text-white rounded transition-all border-2 border-black"
          >
            <X className="h-5 w-5" strokeWidth={2.5} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-gradient-to-b from-white to-gray-50">
          {/* Model Configuration */}
          <div>
            <h3 className="text-sm font-bold text-black mb-3 uppercase">Model Configuration</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  AI Model
                </label>
                <select
                  value={config.model}
                  onChange={(e) => setConfig({ ...config, model: e.target.value })}
                  className="w-full px-3 py-2 bg-white border-2 border-black rounded-lg text-black focus:border-purple-600 focus:outline-none focus:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                >
                  {AI_MODELS.map((model) => (
                    <option key={model.value} value={model.value}>
                      {model.label} ({model.provider})
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-600">
                  Make sure to configure the API key for this provider in the Admin panel.
                </p>
              </div>
            </div>
          </div>

          {/* Behavior Settings */}
          <div>
            <h3 className="text-sm font-bold text-black mb-3 uppercase">Behavior</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-gray-100 rounded-lg border-2 border-gray-300">
                <div>
                  <label className="text-sm font-medium text-black">Auto-Execute Commands</label>
                  <p className="text-xs text-gray-600 mt-1">
                    Automatically execute high-confidence recommendations
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setConfig({ ...config, autoExecute: !config.autoExecute })}
                  className={`relative w-12 h-6 rounded-full transition-all border-2 border-black ${
                    config.autoExecute ? 'bg-green-400' : 'bg-gray-300'
                  }`}
                >
                  <div
                    className={`absolute top-0.5 h-4 w-4 bg-black rounded-full transition-transform ${
                      config.autoExecute ? 'translate-x-6' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>

              {config.autoExecute && (
                <div className="p-3 bg-yellow-100 border-2 border-yellow-600 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-700 mt-0.5" strokeWidth={2.5} />
                    <div className="text-xs text-yellow-900">
                      <p className="font-bold mb-1">Warning: Auto-execution enabled</p>
                      <p>Commands with confidence above 70% will be executed automatically. Only enable this if you trust the AI's recommendations.</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Temperature
                  </label>
                  <input
                    type="number"
                    value={config.temperature}
                    onChange={(e) => setConfig({ ...config, temperature: parseFloat(e.target.value) })}
                    min="0"
                    max="2"
                    step="0.1"
                    className="w-full px-3 py-2 bg-white border-2 border-black rounded-lg text-black focus:border-purple-600 focus:outline-none focus:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                  />
                  <p className="mt-1 text-xs text-gray-600">
                    Higher = more creative (0-2)
                  </p>
                </div>

                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Max Tokens
                  </label>
                  <input
                    type="number"
                    value={config.maxTokens}
                    onChange={(e) => setConfig({ ...config, maxTokens: parseInt(e.target.value) })}
                    min="50"
                    max="10000"
                    step="50"
                    className="w-full px-3 py-2 bg-white border-2 border-black rounded-lg text-black focus:border-purple-600 focus:outline-none focus:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                  />
                  <p className="mt-1 text-xs text-gray-600">
                    Maximum response length
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* System Prompt */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-black uppercase">System Prompt</h3>
              <div className="flex items-center gap-2">
                <select
                  value={selectedPromptTemplate}
                  onChange={(e) => applyPromptTemplate(e.target.value)}
                  className="px-2 py-1 text-xs bg-white border-2 border-black rounded text-black focus:border-purple-600 focus:outline-none"
                >
                  <option value="custom">Custom</option>
                  <option value="general">General</option>
                  <option value="debugging">Debugging</option>
                  <option value="testing">Testing</option>
                  <option value="performance">Performance</option>
                </select>
                <button
                  onClick={handleReset}
                  className="p-1.5 text-black hover:bg-black hover:text-white rounded transition-all border-2 border-black"
                  title="Reset to template"
                >
                  <RotateCcw className="h-4 w-4" strokeWidth={2} />
                </button>
              </div>
            </div>
            <textarea
              value={config.systemPrompt}
              onChange={(e) => setConfig({ ...config, systemPrompt: e.target.value })}
              rows={8}
              className="w-full px-3 py-2 bg-white border-2 border-black rounded-lg text-black placeholder-gray-400 focus:border-purple-600 focus:outline-none focus:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] font-mono text-xs"
              placeholder="Enter system prompt..."
            />
            <p className="mt-1 text-xs text-gray-600">
              This prompt defines Sensei's behavior and analysis approach
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t-4 border-black bg-gradient-to-r from-gray-100 to-gray-50">
          <div className="text-xs font-medium text-gray-700">
            {(() => {
              const providerInfo = apiKeyService.getProviderForModel(config.model);
              if (!providerInfo) return '⚠ Unknown model';
              if (!providerInfo.requiresKey) return '✓ No API key required';
              const hasKey = apiKeyService.hasKey(providerInfo.id);
              return hasKey ? `✓ ${providerInfo.name} key configured` : `⚠ ${providerInfo.name} key required`;
            })()}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-black border-2 border-black rounded-lg hover:bg-gray-100 transition-all font-bold"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 bg-purple-500 text-white border-2 border-black rounded-lg shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2 font-bold"
            >
              <Save className="h-4 w-4" strokeWidth={2.5} />
              {isSaving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SenseiSettings;