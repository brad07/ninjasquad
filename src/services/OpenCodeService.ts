import { invoke } from '@tauri-apps/api/core';
import type { OpenCodeServer, ServerEvent } from '../types';

export class OpenCodeService {
  private eventSource: EventSource | null = null;
  private eventHandlers: Map<string, (event: ServerEvent) => void> = new Map();

  async spawnServer(port: number): Promise<OpenCodeServer> {
    try {
      return await invoke<OpenCodeServer>('spawn_opencode_server', { port });
    } catch (error) {
      throw new Error(`Failed to spawn OpenCode server: ${error}`);
    }
  }

  async listServers(): Promise<OpenCodeServer[]> {
    try {
      return await invoke<OpenCodeServer[]>('list_opencode_servers');
    } catch (error) {
      throw new Error(`Failed to list servers: ${error}`);
    }
  }

  async sendPrompt(_serverId: string, prompt: string): Promise<any> {
    // This would normally call the OpenCode API directly
    // For now, we'll use the Tauri command to distribute tasks
    try {
      return await invoke('distribute_task', { prompt });
    } catch (error) {
      throw new Error(`Failed to send prompt: ${error}`);
    }
  }

  connectToEventStream(serverUrl: string): void {
    if (this.eventSource) {
      this.eventSource.close();
    }

    this.eventSource = new EventSource(`${serverUrl}/event`);

    this.eventSource.onmessage = (event) => {
      try {
        const serverEvent: ServerEvent = JSON.parse(event.data);
        this.handleEvent(serverEvent);
      } catch (error) {
        console.error('Failed to parse event:', error);
      }
    };

    this.eventSource.onerror = (error) => {
      console.error('EventSource error:', error);
      this.reconnect(serverUrl);
    };
  }

  private handleEvent(event: ServerEvent): void {
    const handler = this.eventHandlers.get(event.event_type);
    if (handler) {
      handler(event);
    }

    // Also emit a general event
    const generalHandler = this.eventHandlers.get('*');
    if (generalHandler) {
      generalHandler(event);
    }
  }

  onEvent(eventType: string, handler: (event: ServerEvent) => void): void {
    this.eventHandlers.set(eventType, handler);
  }

  private reconnect(serverUrl: string): void {
    setTimeout(() => {
      console.log('Attempting to reconnect to event stream...');
      this.connectToEventStream(serverUrl);
    }, 5000);
  }

  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.eventHandlers.clear();
  }
}