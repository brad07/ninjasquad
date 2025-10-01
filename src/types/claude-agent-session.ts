/**
 * Types for Claude Agent multi-session management
 */

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  toolUses?: ToolUseInfo[];
}

export interface ToolUseInfo {
  id: string;
  name: string;
  input: any;
  status: 'pending' | 'running' | 'completed' | 'error';
  output?: string;
  error?: string;
  timestamp: string;
}

export interface SessionState {
  sessionId: string;
  title: string; // User-friendly name for the tab
  messages: ConversationMessage[];
  isLoading: boolean;
  serviceLogs: string[];
  createdAt: string;
  lastUsedAt: string;
  workingDirectory?: string;
}

export interface SessionManager {
  sessions: Map<string, SessionState>;
  activeSessionId: string | null;
  createSession: (title?: string, workingDirectory?: string) => string;
  closeSession: (sessionId: string) => void;
  switchSession: (sessionId: string) => void;
  updateSessionTitle: (sessionId: string, title: string) => void;
  getActiveSession: () => SessionState | null;
}