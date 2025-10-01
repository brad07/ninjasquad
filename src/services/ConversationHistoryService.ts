import { invoke } from '@tauri-apps/api/core';

export interface ConversationMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

/**
 * Service for managing conversation history in the database
 * Replaces file-based JSON storage
 */
class ConversationHistoryService {
  /**
   * Add a message to the conversation history
   */
  async addMessage(
    id: string,
    sessionId: string,
    role: 'user' | 'assistant',
    content: string,
    timestamp?: string
  ): Promise<void> {
    await invoke('add_conversation_message', {
      id,
      sessionId,  // Tauri auto-converts to snake_case
      role,
      content,
      timestamp: timestamp || new Date().toISOString()
    });
  }

  /**
   * Get all messages for a session
   */
  async getHistory(sessionId: string): Promise<ConversationMessage[]> {
    return await invoke('get_conversation_history', {
      sessionId  // Tauri auto-converts to snake_case
    });
  }

  /**
   * Get recent N messages for a session
   */
  async getRecentMessages(sessionId: string, limit: number): Promise<ConversationMessage[]> {
    return await invoke('get_recent_conversation_messages', {
      sessionId,  // Tauri auto-converts to snake_case
      limit
    });
  }

  /**
   * Count messages in a session
   */
  async countMessages(sessionId: string): Promise<number> {
    return await invoke('count_conversation_messages', {
      sessionId  // Tauri auto-converts to snake_case
    });
  }

  /**
   * Delete all messages for a session
   */
  async deleteHistory(sessionId: string): Promise<void> {
    await invoke('delete_conversation_history', {
      sessionId  // Tauri auto-converts to snake_case
    });
  }

  /**
   * Add multiple messages (batch insert)
   */
  async addMessages(
    sessionId: string,
    messages: Array<{ id: string; role: 'user' | 'assistant'; content: string; timestamp: string }>
  ): Promise<void> {
    for (const msg of messages) {
      await this.addMessage(msg.id, sessionId, msg.role, msg.content, msg.timestamp);
    }
  }
}

// Export singleton instance
export const conversationHistoryService = new ConversationHistoryService();
