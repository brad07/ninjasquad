import { useState, useEffect, useCallback } from 'react';
import type { SessionState } from '../types/claude-agent-session';

const STORAGE_KEY = 'claude-agent-sessions';
const ACTIVE_SESSION_KEY = 'claude-agent-active-session';

export const useClaudeAgentSessions = (workingDirectory?: string) => {
  const [sessions, setSessions] = useState<Map<string, SessionState>>(new Map());
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  // Load sessions from localStorage on mount
  useEffect(() => {
    try {
      const savedSessions = localStorage.getItem(STORAGE_KEY);
      const savedActiveId = localStorage.getItem(ACTIVE_SESSION_KEY);

      if (savedSessions) {
        const sessionsArray: SessionState[] = JSON.parse(savedSessions);
        const sessionsMap = new Map(sessionsArray.map(s => [s.sessionId, s]));
        setSessions(sessionsMap);

        // Restore active session or create new one
        if (savedActiveId && sessionsMap.has(savedActiveId)) {
          setActiveSessionId(savedActiveId);
        } else if (sessionsMap.size > 0) {
          setActiveSessionId(sessionsArray[0].sessionId);
        }
      }

      // Create initial session if none exist
      if (savedSessions === null || JSON.parse(savedSessions).length === 0) {
        const initialSessionId = createSession('Session 1');
        setActiveSessionId(initialSessionId);
      }
    } catch (error) {
      console.error('[Sessions] Failed to load from localStorage:', error);
      // Create a fallback session
      const fallbackId = createSession('Session 1');
      setActiveSessionId(fallbackId);
    }
  }, []);

  // Save sessions to localStorage whenever they change
  useEffect(() => {
    if (sessions.size > 0) {
      try {
        const sessionsArray = Array.from(sessions.values());
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sessionsArray));
      } catch (error) {
        console.error('[Sessions] Failed to save to localStorage:', error);
      }
    }
  }, [sessions]);

  // Save active session ID
  useEffect(() => {
    if (activeSessionId) {
      localStorage.setItem(ACTIVE_SESSION_KEY, activeSessionId);
    }
  }, [activeSessionId]);

  const createSession = useCallback((title?: string, customWorkingDir?: string): string => {
    const sessionId = `claude-agent-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const sessionNumber = sessions.size + 1;

    const newSession: SessionState = {
      sessionId,
      title: title || `Session ${sessionNumber}`,
      messages: [],
      isLoading: false,
      serviceLogs: [],
      createdAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString(),
      workingDirectory: customWorkingDir || workingDirectory
    };

    setSessions(prev => new Map(prev).set(sessionId, newSession));
    console.log('[Sessions] Created new session:', sessionId);

    return sessionId;
  }, [sessions.size, workingDirectory]);

  const closeSession = useCallback((sessionId: string) => {
    setSessions(prev => {
      const newSessions = new Map(prev);
      newSessions.delete(sessionId);

      // If closing the active session, switch to another
      if (sessionId === activeSessionId) {
        const remainingSessions = Array.from(newSessions.keys());
        if (remainingSessions.length > 0) {
          setActiveSessionId(remainingSessions[0]);
        } else {
          // Create a new session if all were closed
          const newSessionId = createSession('Session 1');
          setActiveSessionId(newSessionId);
        }
      }

      return newSessions;
    });

    console.log('[Sessions] Closed session:', sessionId);
  }, [activeSessionId, createSession]);

  const switchSession = useCallback((sessionId: string) => {
    if (sessions.has(sessionId)) {
      setActiveSessionId(sessionId);

      // Update lastUsedAt
      setSessions(prev => {
        const newSessions = new Map(prev);
        const session = newSessions.get(sessionId);
        if (session) {
          session.lastUsedAt = new Date().toISOString();
        }
        return newSessions;
      });

      console.log('[Sessions] Switched to session:', sessionId);
    }
  }, [sessions]);

  const updateSessionTitle = useCallback((sessionId: string, title: string) => {
    setSessions(prev => {
      const newSessions = new Map(prev);
      const session = newSessions.get(sessionId);
      if (session) {
        session.title = title;
      }
      return newSessions;
    });
  }, []);

  const updateSessionMessages = useCallback((sessionId: string, messages: any[]) => {
    setSessions(prev => {
      const newSessions = new Map(prev);
      const session = newSessions.get(sessionId);
      if (session) {
        session.messages = messages;
        session.lastUsedAt = new Date().toISOString();
      }
      return newSessions;
    });
  }, []);

  const updateSessionLoading = useCallback((sessionId: string, isLoading: boolean) => {
    setSessions(prev => {
      const newSessions = new Map(prev);
      const session = newSessions.get(sessionId);
      if (session) {
        session.isLoading = isLoading;
      }
      return newSessions;
    });
  }, []);

  const updateSessionLogs = useCallback((sessionId: string, logs: string[]) => {
    setSessions(prev => {
      const newSessions = new Map(prev);
      const session = newSessions.get(sessionId);
      if (session) {
        session.serviceLogs = logs;
      }
      return newSessions;
    });
  }, []);

  const getActiveSession = useCallback((): SessionState | null => {
    if (!activeSessionId) return null;
    return sessions.get(activeSessionId) || null;
  }, [activeSessionId, sessions]);

  const getSessionsList = useCallback((): SessionState[] => {
    return Array.from(sessions.values()).sort((a, b) =>
      new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime()
    );
  }, [sessions]);

  return {
    sessions,
    activeSessionId,
    createSession,
    closeSession,
    switchSession,
    updateSessionTitle,
    updateSessionMessages,
    updateSessionLoading,
    updateSessionLogs,
    getActiveSession,
    getSessionsList
  };
};