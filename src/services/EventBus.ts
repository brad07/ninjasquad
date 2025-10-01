/**
 * Type-safe, session-scoped event bus for plugin-Sensei communication
 *
 * Benefits over global CustomEvents:
 * - Type safety for event payloads
 * - Session-scoped - events only go to relevant listeners
 * - No global namespace pollution
 * - Easy to debug and track event flow
 * - Centralized event management
 */

// Event type definitions
export interface SenseiRecommendationEvent {
  serverId: string;
  sessionId: string;
  recommendation: {
    id: string;
    timestamp: Date;
    source: string;
    input: string;
    recommendation: string;
    command?: string;
    confidence: number;
    executed?: boolean;
    autoApproved?: boolean;
    denied?: boolean;
  };
}

export interface SenseiApprovedEvent {
  serverId: string;
  sessionId: string;
  recommendation: string;
  command?: string;
  confidence: number;
  timestamp: string;
  autoApproved?: boolean;
}

export interface SenseiAnalyzingEvent {
  serverId: string;
  sessionId: string;
  analyzing: boolean;
}

export interface SenseiExecuteEvent {
  serverId: string;
  sessionId: string;
  command: string;
}

export interface AgentResponseEvent {
  serverId: string;
  sessionId: string;
  userInput: string;
  agentResponse: string;
  agentName: string;
}

// Union type of all events
export type EventBusEvent =
  | { type: 'sensei-recommendation'; data: SenseiRecommendationEvent }
  | { type: 'sensei-approved'; data: SenseiApprovedEvent }
  | { type: 'sensei-analyzing'; data: SenseiAnalyzingEvent }
  | { type: 'sensei-execute'; data: SenseiExecuteEvent }
  | { type: 'agent-response'; data: AgentResponseEvent };

// Extract event type names
export type EventType = EventBusEvent['type'];

// Extract data type for a specific event
type EventData<T extends EventType> = Extract<EventBusEvent, { type: T }>['data'];

// Listener function type
type EventListener<T extends EventType> = (data: EventData<T>) => void | Promise<void>;

/**
 * Session-scoped event bus
 * Events are only delivered to listeners for the specific sessionId
 */
class EventBusService {
  // Map of sessionId -> eventType -> Set of listeners
  private listeners: Map<string, Map<EventType, Set<EventListener<any>>>> = new Map();

  // Debug mode
  private debug: boolean = true;

  /**
   * Subscribe to events for a specific session
   */
  on<T extends EventType>(
    sessionId: string,
    eventType: T,
    listener: EventListener<T>
  ): () => void {
    if (this.debug) {
      console.log(`[EventBus] 📝 Subscribing to '${eventType}' for session ${sessionId.substring(0, 8)}...`);
    }

    // Get or create session listeners
    if (!this.listeners.has(sessionId)) {
      this.listeners.set(sessionId, new Map());
    }
    const sessionListeners = this.listeners.get(sessionId)!;

    // Get or create event type listeners
    if (!sessionListeners.has(eventType)) {
      sessionListeners.set(eventType, new Set());
    }
    const eventListeners = sessionListeners.get(eventType)!;

    // Add listener
    eventListeners.add(listener);

    // Return unsubscribe function
    return () => {
      if (this.debug) {
        console.log(`[EventBus] 🗑️ Unsubscribing from '${eventType}' for session ${sessionId.substring(0, 8)}...`);
      }
      eventListeners.delete(listener);

      // Clean up empty sets
      if (eventListeners.size === 0) {
        sessionListeners.delete(eventType);
      }
      if (sessionListeners.size === 0) {
        this.listeners.delete(sessionId);
      }
    };
  }

  /**
   * Subscribe to events for all sessions (use sparingly)
   */
  onAll<T extends EventType>(
    eventType: T,
    listener: EventListener<T>
  ): () => void {
    const unsubscribers: Array<() => void> = [];

    // Subscribe to all existing sessions
    this.listeners.forEach((_, sessionId) => {
      unsubscribers.push(this.on(sessionId, eventType, listener));
    });

    // Note: New sessions won't get this listener automatically
    // Consider adding a wildcard subscription mechanism if needed

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }

  /**
   * Emit an event to all listeners for the specific session
   */
  emit<T extends EventType>(
    eventType: T,
    data: EventData<T>
  ): void {
    // Extract sessionId from data (all our events have it)
    const sessionId = (data as any).sessionId;

    if (!sessionId) {
      console.error('[EventBus] ❌ Cannot emit event without sessionId:', eventType, data);
      return;
    }

    if (this.debug) {
      console.log(`[EventBus] 📤 Emitting '${eventType}' for session ${sessionId.substring(0, 8)}...`);
    }

    const sessionListeners = this.listeners.get(sessionId);
    if (!sessionListeners) {
      if (this.debug) {
        console.log(`[EventBus] ℹ️ No listeners for session ${sessionId.substring(0, 8)}`);
      }
      return;
    }

    const eventListeners = sessionListeners.get(eventType);
    if (!eventListeners || eventListeners.size === 0) {
      if (this.debug) {
        console.log(`[EventBus] ℹ️ No listeners for event '${eventType}' in session ${sessionId.substring(0, 8)}`);
      }
      return;
    }

    if (this.debug) {
      console.log(`[EventBus] 📬 Delivering '${eventType}' to ${eventListeners.size} listener(s)`);
    }

    // Call all listeners
    eventListeners.forEach(listener => {
      try {
        listener(data);
      } catch (error) {
        console.error(`[EventBus] ❌ Error in listener for '${eventType}':`, error);
      }
    });
  }

  /**
   * Remove all listeners for a session (cleanup)
   */
  clearSession(sessionId: string): void {
    if (this.debug) {
      console.log(`[EventBus] 🧹 Clearing all listeners for session ${sessionId.substring(0, 8)}...`);
    }
    this.listeners.delete(sessionId);
  }

  /**
   * Get listener count for debugging
   */
  getListenerCount(sessionId?: string, eventType?: EventType): number {
    if (!sessionId) {
      // Total count across all sessions
      let count = 0;
      this.listeners.forEach(sessionListeners => {
        sessionListeners.forEach(eventListeners => {
          count += eventListeners.size;
        });
      });
      return count;
    }

    const sessionListeners = this.listeners.get(sessionId);
    if (!sessionListeners) return 0;

    if (!eventType) {
      // Total count for this session
      let count = 0;
      sessionListeners.forEach(eventListeners => {
        count += eventListeners.size;
      });
      return count;
    }

    // Count for specific event type in this session
    const eventListeners = sessionListeners.get(eventType);
    return eventListeners?.size || 0;
  }

  /**
   * Enable/disable debug logging
   */
  setDebug(enabled: boolean): void {
    this.debug = enabled;
  }

  /**
   * Get debug info
   */
  getDebugInfo(): string {
    const sessions = Array.from(this.listeners.keys());
    let info = `EventBus Debug Info:\n`;
    info += `Total sessions: ${sessions.length}\n\n`;

    sessions.forEach(sessionId => {
      const sessionListeners = this.listeners.get(sessionId)!;
      info += `Session ${sessionId}:\n`;
      sessionListeners.forEach((listeners, eventType) => {
        info += `  - ${eventType}: ${listeners.size} listener(s)\n`;
      });
    });

    return info;
  }
}

// Export singleton instance
export const eventBus = new EventBusService();

// Convenience functions for common patterns

/**
 * Helper to subscribe to Sensei recommendations for a session
 */
export function onSenseiRecommendation(
  sessionId: string,
  callback: (data: SenseiRecommendationEvent) => void
): () => void {
  return eventBus.on(sessionId, 'sensei-recommendation', callback);
}

/**
 * Helper to subscribe to Sensei approvals for a session
 */
export function onSenseiApproved(
  sessionId: string,
  callback: (data: SenseiApprovedEvent) => void
): () => void {
  return eventBus.on(sessionId, 'sensei-approved', callback);
}

/**
 * Helper to subscribe to Sensei analyzing status for a session
 */
export function onSenseiAnalyzing(
  sessionId: string,
  callback: (data: SenseiAnalyzingEvent) => void
): () => void {
  return eventBus.on(sessionId, 'sensei-analyzing', callback);
}

/**
 * Helper to emit agent response (for Sensei to analyze)
 */
export function emitAgentResponse(
  serverId: string,
  sessionId: string,
  userInput: string,
  agentResponse: string,
  agentName: string
): void {
  eventBus.emit('agent-response', {
    serverId,
    sessionId,
    userInput,
    agentResponse,
    agentName
  });
}