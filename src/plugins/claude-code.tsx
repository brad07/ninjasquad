import type { CodingAgentPlugin } from '../types/plugin';
import ClaudeCodeUI from '../components/plugins/ClaudeCodeUI';

export const ClaudeCodePlugin: CodingAgentPlugin = {
  id: 'claude-code',
  name: 'Claude Code',
  version: '1.0.0',
  description: 'Claude AI agent with rich chat interface and tool use visualization (powered by Claude Agent SDK)',
  author: 'Anthropic Integration',
  icon: '/icons/claude.svg',
  enabled: false, // Hidden for now
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
  requiresApiKey: false, // Claude Code handles its own authentication
  uiComponent: 'custom',
  capabilities: {
    fileOperations: true,
    terminalAccess: false,
    gitOperations: true,
    webSearch: true,
    codeExecution: false,
    customTools: [
      'read_file',
      'write_file',
      'list_directory',
      'search_files',
      'run_command'
    ]
  },

  // UI Configuration
  uiConfig: {
    showTerminal: false,
    showChat: true,
    showFileTree: true,
    customPanels: [
      {
        id: 'artifacts',
        title: 'Artifacts',
        position: 'right',
        defaultSize: 30,
        resizable: true,
        collapsible: true
      },
      {
        id: 'tools',
        title: 'Tool Use',
        position: 'bottom',
        defaultSize: 20,
        resizable: true,
        collapsible: true
      }
    ]
  },

  // Custom UI renderer
  customRenderer: ClaudeCodeUI,

  // API configuration
  apiEndpoint: 'https://api.anthropic.com',
  apiVersion: 'v1'
};