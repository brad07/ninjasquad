export interface OpenCodeServer {
  id: string;
  host: string;
  port: number;
  status: ServerStatus;
  process_id?: number;
  working_dir?: string;
}

export type ServerStatus = 'Starting' | 'Running' | 'Stopped' | { Error: string };

export interface OpenCodeSession {
  id: string;
  server_id: string;
  created_at: string;
  messages: Message[];
}

export interface Message {
  role: string;
  content: string;
  timestamp: string;
}

export interface ServerEvent {
  event_type: string;
  data: any;
  timestamp: string;
}

export interface WezTermDomain {
  name: string;
  remote_address: string;
  username: string;
  connected: boolean;
}

export interface WezTermPane {
  id: string;
  domain_name: string;
  title: string;
  is_active: boolean;
}

export interface OrchestratorSession {
  id: string;
  opencode_server_id: string;
  wezterm_pane_id?: string;
  status: SessionStatus;
  created_at: string;
  task?: Task;
}

export type SessionStatus = 'Idle' | 'Working' | { Failed: string } | 'Completed';

export interface Task {
  id: string;
  prompt: string;
  assigned_at: string;
  completed_at?: string;
  result?: string;
}