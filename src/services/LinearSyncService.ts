import { linearService } from './LinearService';
import type { LinearSyncStatus, LinearConfig } from '../types/linear';

/**
 * Background sync service for Linear
 */
class LinearSyncService {
  private syncInterval: number | null = null;
  private syncTimer: NodeJS.Timeout | null = null;
  private webhookHandler: ((event: MessageEvent) => void) | null = null;

  /**
   * Start automatic syncing
   */
  public startSync(intervalMinutes: number = 5): void {
    this.stopSync(); // Stop any existing sync

    this.syncInterval = intervalMinutes * 60 * 1000; // Convert to milliseconds

    // Initial sync
    this.performSync();

    // Set up interval
    this.syncTimer = setInterval(() => {
      this.performSync();
    }, this.syncInterval);

    console.log(`Linear sync started with ${intervalMinutes} minute interval`);
  }

  /**
   * Stop automatic syncing
   */
  public stopSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
      this.syncInterval = null;
      console.log('Linear sync stopped');
    }
  }

  /**
   * Perform a sync
   */
  private async performSync(): Promise<void> {
    try {
      const status = await linearService.sync();
      this.emitSyncStatus(status);
    } catch (error) {
      console.error('Linear sync failed:', error);
      this.emitSyncError(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Manual sync trigger
   */
  public async syncNow(): Promise<LinearSyncStatus> {
    return await linearService.sync();
  }

  /**
   * Set up webhook listener
   */
  public setupWebhooks(webhookUrl: string, secret: string): void {
    const config = linearService.getConfig();
    if (!config) {
      throw new Error('Linear not configured');
    }

    // Store webhook config
    const updatedConfig: LinearConfig = {
      ...config,
      enableWebhooks: true,
      webhookSecret: secret
    };

    linearService.saveConfig(updatedConfig);

    // Set up EventSource for webhook events
    if (typeof EventSource !== 'undefined') {
      const eventSource = new EventSource(webhookUrl);

      this.webhookHandler = (event: MessageEvent) => {
        this.handleWebhookEvent(event.data);
      };

      eventSource.addEventListener('linear-webhook', this.webhookHandler);

      eventSource.onerror = (error) => {
        console.error('Webhook connection error:', error);
      };

      console.log('Linear webhooks enabled');
    }
  }

  /**
   * Handle webhook event
   */
  private async handleWebhookEvent(data: string): Promise<void> {
    try {
      const event = JSON.parse(data);
      console.log('Received webhook event:', event);

      // Handle different event types
      switch (event.type) {
        case 'Issue':
          await this.handleIssueEvent(event);
          break;
        case 'Comment':
          await this.handleCommentEvent(event);
          break;
        case 'Project':
          await this.handleProjectEvent(event);
          break;
        default:
          console.log('Unhandled webhook event type:', event.type);
      }

      // Emit webhook event for UI updates
      this.emitWebhookEvent(event);
    } catch (error) {
      console.error('Failed to handle webhook event:', error);
    }
  }

  /**
   * Handle issue webhook event
   */
  private async handleIssueEvent(event: any): Promise<void> {
    const { action, data } = event;

    switch (action) {
      case 'create':
        console.log('New issue created:', data.identifier);
        // Optionally trigger a partial sync
        break;
      case 'update':
        console.log('Issue updated:', data.identifier);
        // Update local cache
        break;
      case 'remove':
        console.log('Issue removed:', data.identifier);
        // Remove from local cache
        break;
    }
  }

  /**
   * Handle comment webhook event
   */
  private async handleCommentEvent(event: any): Promise<void> {
    const { action, data } = event;

    if (action === 'create') {
      console.log('New comment on issue:', data.issue?.identifier);
      // Check if comment mentions agent assignment
      if (data.body?.includes('@agent') || data.body?.includes('assign to agent')) {
        // Parse and handle agent assignment request
        await this.handleAgentAssignmentFromComment(data);
      }
    }
  }

  /**
   * Handle project webhook event
   */
  private async handleProjectEvent(event: any): Promise<void> {
    const { action, data } = event;
    console.log(`Project ${action}:`, data.name);
    // Trigger projects refresh
  }

  /**
   * Handle agent assignment from comment
   */
  private async handleAgentAssignmentFromComment(comment: any): Promise<void> {
    // Parse comment for agent assignment
    const match = comment.body.match(/@agent\s+(\w+)/i);
    if (match) {
      const agentId = match[1];
      const issueId = comment.issue.id;

      try {
        await linearService.assignIssueToAgent(issueId, agentId);
        console.log(`Issue ${issueId} assigned to agent ${agentId} via comment`);
      } catch (error) {
        console.error('Failed to assign issue to agent:', error);
      }
    }
  }

  /**
   * Emit sync status event
   */
  private emitSyncStatus(status: LinearSyncStatus): void {
    window.dispatchEvent(new CustomEvent('linear-sync-status', {
      detail: status
    }));
  }

  /**
   * Emit sync error event
   */
  private emitSyncError(error: string): void {
    window.dispatchEvent(new CustomEvent('linear-sync-error', {
      detail: { error }
    }));
  }

  /**
   * Emit webhook event
   */
  private emitWebhookEvent(event: any): void {
    window.dispatchEvent(new CustomEvent('linear-webhook-event', {
      detail: event
    }));
  }

  /**
   * Get sync status
   */
  public getSyncStatus(): LinearSyncStatus {
    return linearService.getSyncStatus();
  }

  /**
   * Check if syncing is active
   */
  public isSyncing(): boolean {
    return this.syncTimer !== null;
  }

  /**
   * Get sync interval in minutes
   */
  public getSyncInterval(): number | null {
    return this.syncInterval ? Math.floor(this.syncInterval / 60000) : null;
  }
}

// Export singleton instance
export const linearSyncService = new LinearSyncService();