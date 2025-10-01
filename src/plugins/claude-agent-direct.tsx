import type { CodingAgentPlugin } from '../types/plugin';
import ClaudeAgentDirectUI from '../components/plugins/ClaudeAgentDirectUI';

export const ClaudeAgentDirectPlugin: CodingAgentPlugin = {
  id: 'claude-agent-direct',
  name: 'Claude Agent',
  version: '0.2.0',
  description: 'Claude AI agent - direct SDK integration via Node.js backend with full tool support',
  author: 'Anthropic Integration',
  icon: '/icons/claude.svg',
  supportedModels: [
    'claude-sonnet-4-5-20250929',
    'claude-sonnet-4-20250514',
    'claude-3-5-sonnet-20241022',
    'claude-3-5-haiku-20241022',
    'claude-3-opus-20240229',
    'claude-3-sonnet-20240229',
    'claude-3-haiku-20240307'
  ],
  defaultModel: 'claude-sonnet-4-5-20250929',
  requiresApiKey: true, // Direct SDK integration requires Anthropic API key
  uiComponent: 'custom',
  capabilities: {
    fileOperations: true,
    terminalAccess: false,
    gitOperations: true,
    webSearch: true,
    codeExecution: true, // SDK can execute code via tools
    customTools: [
      'Read',
      'Write',
      'Edit',
      'Bash',
      'Grep',
      'Glob'
    ]
  },

  // UI Configuration
  uiConfig: {
    showTerminal: false,
    showChat: true,
    showFileTree: false,
    customPanels: [
      {
        id: 'tools',
        title: 'Tool Use',
        position: 'right',
        defaultSize: 30,
        resizable: true,
        collapsible: true
      }
    ]
  },

  // Custom UI renderer (direct UI - instances managed by app)
  customRenderer: ClaudeAgentDirectUI,

  // API configuration
  apiEndpoint: 'https://api.anthropic.com',
  apiVersion: 'v1'
};