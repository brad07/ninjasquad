import { invoke } from '@tauri-apps/api/core';
import type { OrchestratorSession, Task } from '../types';

export type DistributionStrategy = 'RoundRobin' | 'LeastLoaded' | 'Random';

export class SessionManager {
  private sessions: Map<string, OrchestratorSession> = new Map();
  private strategy: DistributionStrategy = 'RoundRobin';
  private lastAssignedIndex = 0;

  async registerSession(serverId: string): Promise<OrchestratorSession> {
    const session: OrchestratorSession = {
      id: `session-${Date.now()}`,
      opencode_server_id: serverId,
      status: 'Idle',
      created_at: new Date().toISOString(),
    };

    this.sessions.set(session.id, session);
    return session;
  }

  async distributeTask(prompt: string): Promise<string> {
    try {
      const taskId = await invoke<string>('distribute_task', { prompt });

      // Update local session state
      const availableSessions = this.getAvailableSessions();
      if (availableSessions.length === 0) {
        throw new Error('No available sessions');
      }

      const selectedSession = this.selectSessionByStrategy(availableSessions);
      const task: Task = {
        id: taskId,
        prompt,
        assigned_at: new Date().toISOString(),
      };

      selectedSession.task = task;
      selectedSession.status = 'Working';
      this.sessions.set(selectedSession.id, selectedSession);

      return taskId;
    } catch (error) {
      throw new Error(`Failed to distribute task: ${error}`);
    }
  }

  private getAvailableSessions(): OrchestratorSession[] {
    return Array.from(this.sessions.values()).filter(
      session => session.status === 'Idle'
    );
  }

  private selectSessionByStrategy(sessions: OrchestratorSession[]): OrchestratorSession {
    if (sessions.length === 0) {
      throw new Error('No sessions available');
    }

    switch (this.strategy) {
      case 'RoundRobin':
        this.lastAssignedIndex = (this.lastAssignedIndex + 1) % sessions.length;
        return sessions[this.lastAssignedIndex];

      case 'Random':
        return sessions[Math.floor(Math.random() * sessions.length)];

      case 'LeastLoaded':
      default:
        // For now, just return the first available
        return sessions[0];
    }
  }

  async handleFailure(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    session.status = { Failed: 'Session failed' };
    this.sessions.set(sessionId, session);

    // If there was a task, reassign it
    if (session.task && !session.task.completed_at) {
      await this.distributeTask(session.task.prompt);
    }
  }

  updateSessionStatus(sessionId: string, status: OrchestratorSession['status']): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = status;
      this.sessions.set(sessionId, session);
    }
  }

  getSession(sessionId: string): OrchestratorSession | undefined {
    return this.sessions.get(sessionId);
  }

  getAllSessions(): OrchestratorSession[] {
    return Array.from(this.sessions.values());
  }

  setStrategy(strategy: DistributionStrategy): void {
    this.strategy = strategy;
  }

  clearSessions(): void {
    this.sessions.clear();
    this.lastAssignedIndex = 0;
  }
}