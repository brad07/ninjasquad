import type { CodingAgentPlugin } from '../types/plugin';
import OpenCodeUI from '../components/plugins/OpenCodeUI';

export const OpenCodePlugin: CodingAgentPlugin = {
  id: 'opencode',
  name: 'OpenCode',
  version: '1.0.0',
  description: 'OpenCode AI coding assistant with tmux interface',
  author: 'OpenCode Team',
  icon: '/icons/opencode.svg',
  enabled: false, // Hidden from plugin selector
  supportedModels: [
    'claude-sonnet-4-0',
    'gpt-4',
    'gpt-3.5-turbo'
  ],
  defaultModel: 'claude-sonnet-4-0',
  requiresApiKey: false,
  uiComponent: 'tmux',
  capabilities: {
    fileOperations: true,
    terminalAccess: true,
    gitOperations: true,
    webSearch: true,
    codeExecution: true,
    customTools: []
  },

  // UI Configuration
  uiConfig: {
    showTerminal: true,
    showChat: false,
    showFileTree: false,
    customPanels: []
  },

  // Custom UI renderer (for tmux display)
  customRenderer: OpenCodeUI,

  // Terminal command generator
  terminalCommand: (port: number, sessionId?: string) => {
    let cmd = `opencode -h 127.0.0.1 --port ${port}`;
    if (sessionId) {
      cmd += ` -s ${sessionId}`;
    }
    return cmd;
  }
};