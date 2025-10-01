import React, { useState, useRef, useEffect } from 'react';
import { FileText, CheckCircle, XCircle, ChevronDown, ChevronRight, Wrench, AlertCircle, Settings as SettingsIcon } from 'lucide-react';
import type { PluginUIProps } from '../../types/plugin';
import type { ConversationMessage as PluginConversationMessage, ToolUse as PluginToolUse } from '../../types/plugin';
import type { SessionState } from '../../types/claude-agent-session';
import { claudeAgentSDKService } from '../../services/ClaudeAgentSDKService';
import { claudeAgentService } from '../../services/ClaudeAgentService';
import { senseiService } from '../../services/SenseiService';
import { conversationHistoryService } from '../../services/ConversationHistoryService';
import { onSenseiApproved, onSenseiAnalyzing } from '../../services/EventBus';
import { ToolUseDisplay, ToolUse as SharedToolUse } from '../shared/ToolUseDisplay';
import '../../styles/sensei-animations.css';

// Use Claude Agent SDK types
interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  toolUses?: ToolUseInfo[];
}

interface ToolUseInfo {
  id: string;
  name: string;
  input: any;
  status: 'pending' | 'running' | 'completed' | 'error';
  output?: string;
  error?: string;
  timestamp: string;
}

type PermissionMode = 'default' | 'always_allow' | 'always_deny' | 'ask';

interface ClaudeAgentDirectUIProps extends PluginUIProps {
  sessionState?: SessionState;
  onUpdateSessionLogs?: (sessionId: string, logs: string[]) => void;
  onUpdateSessionLoading?: (sessionId: string, isLoading: boolean) => void;
  onUpdateSessionMessages?: (sessionId: string, messages: any[]) => void;
}

/**
 * Claude Agent Plugin UI Component
 * Direct Claude Agent SDK integration via Node.js backend service
 */
const ClaudeAgentDirectUI: React.FC<ClaudeAgentDirectUIProps> = ({
  plugin,
  session,
  config,
  sessionState,
  onUpdateSessionLogs,
  onUpdateSessionLoading,
  onUpdateSessionMessages
}) => {
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const [showToolDetails, setShowToolDetails] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const [permissionMode, setPermissionMode] = useState<PermissionMode>('default');
  const [showSettings, setShowSettings] = useState(false);
  const [showServiceLogs, setShowServiceLogs] = useState(false);
  const [showTokenUsage, setShowTokenUsage] = useState(false);
  const [isSenseiAnalyzing, setIsSenseiAnalyzing] = useState(false);
  const [isServiceAvailable, setIsServiceAvailable] = useState(false);
  const [tokenUsage, setTokenUsage] = useState({
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    total_requests: 0
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const sessionIdRef = useRef<string | null>(null);
  const isLoadingRef = useRef<boolean>(false);
  const isInitializedRef = useRef<boolean>(false);

  // Get session-scoped logs (fallback to empty array if not provided)
  const serviceLogs = sessionState?.serviceLogs || [];

  // Poll service status while not initialized
  useEffect(() => {
    if (isInitialized || !session?.id) return;

    let pollInterval: NodeJS.Timeout;
    let attemptCount = 0;

    const checkServiceAndInitialize = async () => {
      attemptCount++;

      try {
        // Check if service is available
        const serviceAvailable = await claudeAgentSDKService.checkServiceHealth();
        setIsServiceAvailable(serviceAvailable);

        if (serviceAvailable && !isInitializedRef.current) {
          addServiceLog(`⏱ Service available, attempting initialization (attempt ${attemptCount})...`);
          await initializeSDK();
        } else if (!serviceAvailable) {
          addServiceLog(`⏱ Waiting for Claude Agent SDK service (attempt ${attemptCount})...`);
        }
      } catch (error) {
        console.error('[ClaudeAgentDirect] Service check error:', error);
      }
    };

    // Initial check
    checkServiceAndInitialize();

    // Poll every 2 seconds
    pollInterval = setInterval(checkServiceAndInitialize, 2000);

    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [isInitialized, session?.id]);

  // Initialize SDK when service is ready
  const initializeSDK = async () => {
    if (!session?.id) {
      console.log('[ClaudeAgentDirect] Waiting for session ID...');
      return;
    }

    console.log('[ClaudeAgentDirect] Initializing...', {
      sessionId: session.id,
      workingDirectory: config?.workingDirectory
    });

    try {
      addServiceLog('Initializing Claude Agent SDK...');

      // Check if Claude Agent SDK service is configured
      if (!claudeAgentSDKService.isConfigured()) {
        addServiceLog('Initializing with API key...');
        // Initialize with API key from config
        const apiKey = config?.apiKey || process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
          throw new Error('API key not configured. Please set your Anthropic API key in settings.');
        }

        await claudeAgentSDKService.initialize({
          apiKey,
          defaultModel: config?.model || plugin.defaultModel,
          defaultPermissionMode: 'default'
        });
        addServiceLog('SDK initialized successfully');
      }

      const workingDir = config?.workingDirectory || process.cwd();
      const existingSession = claudeAgentSDKService.getSession(session.id);

      let restoredHistory: any[] = [];

      if (!existingSession) {
        // Check if conversation history exists in database
        addServiceLog(`Checking for existing session: ${session.id}`);
        console.log('[ClaudeAgentDirect] Restore check - session ID:', session.id);
        try {
          const history = await conversationHistoryService.getHistory(session.id);
          if (history && history.length > 0) {
            addServiceLog(`Found existing conversation with ${history.length} messages`);
            restoredHistory = history;
            console.log('[ClaudeAgentDirect] Restored history from database:', restoredHistory.length);
          } else {
            console.log('[ClaudeAgentDirect] No history found in database');
          }
        } catch (error) {
          console.error('[ClaudeAgentDirect] Error loading history from database:', error);
          addServiceLog(`Error loading history: ${error}`);
        }

        // Create session via Node.js backend
        addServiceLog(`Creating session: ${session.id} in ${workingDir}`);
        await claudeAgentSDKService.createSession(
          workingDir,
          config?.model || plugin.defaultModel,
          session.id,
          false // No need to restore from Node.js file anymore
        );
        sessionIdRef.current = session.id;
        addServiceLog('Session created successfully');
      } else {
        sessionIdRef.current = session.id;
        addServiceLog(`Using existing session: ${session.id}`);
      }

      // Initialize Sensei session for this agent session
      senseiService.initializeSession('claude-agent-direct', session.id, {
        enabled: true,
        model: 'gpt-5',
        systemPrompt: 'You are SensAI, analyzing Claude Agent responses and suggesting next steps.',
        autoApprove: true,
        temperature: 1,
        maxTokens: 5000,
        confidenceThreshold: 0.8
      });
      addServiceLog('Sensei session initialized');

      // Load restored conversation history into UI
      console.log('[ClaudeAgentDirect] About to load history. Length:', restoredHistory.length);
      if (restoredHistory.length > 0) {
        addServiceLog(`Loading ${restoredHistory.length} messages into conversation...`);

        // Set messages directly to show full conversation history
        setMessages(restoredHistory);

        // Also add assistant messages to Sensei panel (without AI analysis)
        let assistantCount = 0;
        for (let i = 0; i < restoredHistory.length; i++) {
          const msg = restoredHistory[i];

          if (msg.role === 'assistant' && msg.content) {
            assistantCount++;

            // Find the previous user message for context
            let userInput = '';
            if (i > 0 && restoredHistory[i - 1].role === 'user') {
              userInput = restoredHistory[i - 1].content;
            }

            console.log('[ClaudeAgentDirect] Adding assistant message', assistantCount, 'to Sensei (no AI analysis)');

            // Add directly without triggering Sensei AI analysis
            senseiService.addDirectRecommendation(
              'claude-agent-direct',
              session.id,
              userInput,
              msg.content,
              'agent', // Display as "Agent" in UI
              0, // confidence 0 for historical messages
              msg.id // use existing message ID
            );
          }
        }
        addServiceLog(`Loaded conversation history (${restoredHistory.length} messages, ${assistantCount} in Sensei)`);
        console.log('[ClaudeAgentDirect] Finished loading history. Messages in UI:', restoredHistory.length, 'in Sensei:', assistantCount);
      } else {
        console.log('[ClaudeAgentDirect] No history to load');
      }

      isInitializedRef.current = true;
      setIsInitialized(true);
      setApiKeyError(null);
      addServiceLog('✓ Initialization complete');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to initialize';
      addServiceLog(`✗ Initialization error: ${errorMsg}`);
      console.error('[ClaudeAgentDirect] Initialization error:', error);
      setApiKeyError(errorMsg);
    }
  };

  // Listen for Sensei approved recommendations using EventBus
  // Note: Don't include isLoading in deps - it causes unsubscribe/resubscribe cycle
  // The handler checks isLoading internally to prevent duplicate sends
  useEffect(() => {
    if (!session?.id) return;

    const unsubscribe = onSenseiApproved(session.id, (data) => {
      addServiceLog(`← Sensei approved recommendation: "${data.recommendation.substring(0, 50)}${data.recommendation.length > 50 ? '...' : ''}"`);
      console.log('[ClaudeAgentDirect] Sensei approved recommendation:', data.recommendation);

      // Small delay to ensure loading state is fully settled
      setTimeout(() => {
        handleApprovedRecommendation(data.recommendation);
      }, 100);
    });

    return unsubscribe;
  }, [session?.id]);

  // Listen for Sensei analyzing status changes
  useEffect(() => {
    if (!session?.id) return;

    const unsubscribe = onSenseiAnalyzing(session.id, (data) => {
      setIsSenseiAnalyzing(data.analyzing);
      console.log('[ClaudeAgentDirect] Sensei analyzing:', data.analyzing);
    });

    return unsubscribe;
  }, [session?.id]);

  // Check if Claude Agent service is available
  useEffect(() => {
    const checkServiceAvailability = async () => {
      try {
        const health = await claudeAgentService.healthCheck();
        const available = health.success && health.status === 'running' && health.api_key_configured;
        setIsServiceAvailable(available);

        if (!available) {
          addServiceLog('⚠ Claude Agent service is not available or not configured');
        }
      } catch (error) {
        setIsServiceAvailable(false);
        addServiceLog('✗ Claude Agent service health check failed');
      }
    };

    // Check immediately
    checkServiceAvailability();

    // Then check every 10 seconds
    const interval = setInterval(checkServiceAvailability, 10000);

    return () => clearInterval(interval);
  }, []);

  const handleApprovedRecommendation = async (messageContent: string) => {
    addServiceLog(`📋 Checking readiness: sessionId=${session?.id || 'none'}, initialized=${isInitializedRef.current}, loading=${isLoadingRef.current}`);

    if (!session?.id || !isInitializedRef.current || isLoadingRef.current) {
      addServiceLog(`⚠ Cannot send approved recommendation - sessionId: ${session?.id || 'none'}, initialized: ${isInitializedRef.current}, loading: ${isLoadingRef.current}`);
      return;
    }

    const sessionId = session.id;

    addServiceLog('→ Sending approved recommendation to agent...');
    isLoadingRef.current = true;
    setIsLoading(true);

    try {
      // Create user message
      const userMessage: ConversationMessage = {
        id: `msg-${Date.now()}`,
        role: 'user',
        content: messageContent,
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, userMessage]);

      // Create assistant message for streaming
      const assistantMessageId = `msg-${Date.now() + 1}`;
      const assistantMessage: ConversationMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        toolUses: []
      };
      setMessages(prev => [...prev, assistantMessage]);

      addServiceLog('← Starting SSE stream from backend...');

      // Stream message via Claude Agent SDK backend
      let fullResponse = '';
      let chunkCount = 0;
      for await (const chunk of claudeAgentSDKService.streamMessage(sessionId, messageContent)) {
        chunkCount++;

        if (chunk.type === 'content') {
          fullResponse += chunk.content;
          addServiceLog(`← Content chunk #${chunkCount}: ${chunk.content.length} chars`);
          setMessages(prev => prev.map(msg =>
            msg.id === assistantMessageId
              ? { ...msg, content: fullResponse }
              : msg
          ));
        } else if (chunk.type === 'tool_use') {
          addServiceLog(`← Tool use: ${chunk.toolUse.name} (${chunk.toolUse.id})`);
          setMessages(prev => prev.map(msg =>
            msg.id === assistantMessageId
              ? { ...msg, toolUses: [...(msg.toolUses || []), chunk.toolUse] }
              : msg
          ));
        } else if (chunk.type === 'tool_result') {
          const status = chunk.isError ? 'ERROR' : 'SUCCESS';
          addServiceLog(`← Tool result: ${chunk.toolId} - ${status}`);

          // Get the corresponding tool use to check if it's TodoWrite
          let toolName = '';
          setMessages(prev => prev.map(msg => {
            if (msg.id === assistantMessageId && msg.toolUses) {
              const tool = msg.toolUses.find(t => t.id === chunk.toolId);
              if (tool) {
                toolName = tool.name;
              }
              return {
                ...msg,
                toolUses: msg.toolUses.map(tool =>
                  tool.id === chunk.toolId
                    ? { ...tool, status: chunk.isError ? 'error' : 'completed', output: chunk.result }
                    : tool
                )
              };
            }
            return msg;
          }));

          // If this was a TodoWrite tool result, send it to Sensei
          if (toolName === 'TodoWrite' && !chunk.isError && chunk.result) {
            try {
              // Parse the todo list from the result
              const todoInfo = typeof chunk.result === 'string' ? chunk.result : JSON.stringify(chunk.result, null, 2);
              const todoUpdate = `📋 Task Update:\n${todoInfo}`;

              addServiceLog(`→ Sending TodoWrite update to Sensei...`);
              await senseiService.addAgentRecommendation(
                'claude-agent-direct',
                sessionId,
                todoUpdate,
                'claude-agent-direct'
              );
              addServiceLog(`✓ TodoWrite update sent to Sensei`);
            } catch (senseiError) {
              addServiceLog(`✗ Failed to send TodoWrite to Sensei: ${senseiError instanceof Error ? senseiError.message : String(senseiError)}`);
              console.error('[ClaudeAgentDirect] Failed to send TodoWrite to Sensei:', senseiError);
            }
          }
        } else if (chunk.type === 'usage') {
          // Update aggregate token usage
          const usage = (chunk as any).usage;
          setTokenUsage(prev => ({
            input_tokens: prev.input_tokens + (usage.input_tokens || 0),
            output_tokens: prev.output_tokens + (usage.output_tokens || 0),
            cache_creation_input_tokens: prev.cache_creation_input_tokens + (usage.cache_creation_input_tokens || 0),
            cache_read_input_tokens: prev.cache_read_input_tokens + (usage.cache_read_input_tokens || 0),
            total_requests: prev.total_requests + 1
          }));
          addServiceLog(`← Token usage: ${usage.input_tokens} in, ${usage.output_tokens} out`);
        } else if (chunk.type === 'error') {
          addServiceLog(`✗ Stream error: ${chunk.error.message}`);
          throw new Error(chunk.error.message);
        }
      }

      addServiceLog(`✓ Stream complete - ${chunkCount} chunks, ${fullResponse.length} total chars`);

      // Send response back to Sensei for further analysis
      if (fullResponse.trim()) {
        addServiceLog('→ Sending complete response to Sensei...');
        try {
          await senseiService.addAgentRecommendation(
            'claude-agent-direct',
            sessionId,
            fullResponse,
            'claude-agent-direct'
          );
          addServiceLog('✓ Response sent to Sensei successfully');
        } catch (senseiError) {
          addServiceLog(`✗ Failed to send to Sensei: ${senseiError instanceof Error ? senseiError.message : String(senseiError)}`);
          console.error('[ClaudeAgentDirect] Sensei error:', senseiError);
        }
      }

      // Clear loading state
      isLoadingRef.current = false;
      setIsLoading(false);
    } catch (error) {
      console.error('[ClaudeAgentDirect] Error executing approved recommendation:', error);
      addServiceLog(`✗ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);

      const errorMessage: ConversationMessage = {
        id: `msg-${Date.now()}-error`,
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Failed to execute recommendation'}`,
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, errorMessage]);
      isLoadingRef.current = false;
      setIsLoading(false);
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [serviceLogs]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const addServiceLog = (message: string) => {
    if (!session?.id || !onUpdateSessionLogs) {
      console.log(`[ClaudeAgentService] ${message}`);
      return;
    }

    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    const newLog = `[${timestamp}] ${message}`;
    const newLogs = [...serviceLogs, newLog];
    // Keep only last 100 logs
    const trimmedLogs = newLogs.slice(-100);

    onUpdateSessionLogs(session.id, trimmedLogs);
    console.log(`[ClaudeAgentService] ${message}`);
  };

  const handleSendMessage = async () => {
    if (!input.trim() || !session?.id || !isInitialized || !isServiceAvailable) {
      if (!isServiceAvailable) {
        addServiceLog('✗ Cannot send message: Claude Agent service is not available');
      }
      return;
    }

    const messageContent = input.trim();
    const sessionId = session.id;

    setInput('');
    isLoadingRef.current = true;
    setIsLoading(true);

    try {
      addServiceLog(`→ Sending message: "${messageContent.substring(0, 50)}${messageContent.length > 50 ? '...' : ''}"`);

      // Create user message
      const userMessage: ConversationMessage = {
        id: `msg-${Date.now()}`,
        role: 'user',
        content: messageContent,
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, userMessage]);

      // Create assistant message for streaming
      const assistantMessageId = `msg-${Date.now() + 1}`;
      const assistantMessage: ConversationMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        toolUses: []
      };
      setMessages(prev => [...prev, assistantMessage]);

      addServiceLog('← Starting SSE stream from backend...');

      // Stream message via Claude Agent SDK backend
      let fullResponse = '';
      let chunkCount = 0;
      for await (const chunk of claudeAgentSDKService.streamMessage(sessionId, messageContent)) {
        chunkCount++;

        if (chunk.type === 'content') {
          fullResponse += chunk.content;
          addServiceLog(`← Content chunk #${chunkCount}: ${chunk.content.length} chars`);
          // Update assistant message with streaming content
          setMessages(prev => prev.map(msg =>
            msg.id === assistantMessageId
              ? { ...msg, content: fullResponse }
              : msg
          ));
        } else if (chunk.type === 'tool_use') {
          addServiceLog(`← Tool use: ${chunk.toolUse.name} (${chunk.toolUse.id})`);
          addServiceLog(`  Input: ${JSON.stringify(chunk.toolUse.input).substring(0, 100)}...`);
          // Add tool use to assistant message
          setMessages(prev => prev.map(msg =>
            msg.id === assistantMessageId
              ? { ...msg, toolUses: [...(msg.toolUses || []), chunk.toolUse] }
              : msg
          ));
        } else if (chunk.type === 'tool_result') {
          const status = chunk.isError ? 'ERROR' : 'SUCCESS';
          addServiceLog(`← Tool result: ${chunk.toolId} - ${status}`);
          if (chunk.isError) {
            addServiceLog(`  Error: ${String(chunk.result).substring(0, 100)}...`);
          } else {
            addServiceLog(`  Result: ${String(chunk.result).substring(0, 100)}...`);
          }
          // Update tool use status
          setMessages(prev => prev.map(msg => {
            if (msg.id === assistantMessageId && msg.toolUses) {
              return {
                ...msg,
                toolUses: msg.toolUses.map(tool =>
                  tool.id === chunk.toolId
                    ? { ...tool, status: chunk.isError ? 'error' : 'completed', output: chunk.result }
                    : tool
                )
              };
            }
            return msg;
          }));
        } else if (chunk.type === 'usage') {
          // Update aggregate token usage
          const usage = (chunk as any).usage;
          setTokenUsage(prev => ({
            input_tokens: prev.input_tokens + (usage.input_tokens || 0),
            output_tokens: prev.output_tokens + (usage.output_tokens || 0),
            cache_creation_input_tokens: prev.cache_creation_input_tokens + (usage.cache_creation_input_tokens || 0),
            cache_read_input_tokens: prev.cache_read_input_tokens + (usage.cache_read_input_tokens || 0),
            total_requests: prev.total_requests + 1
          }));
          addServiceLog(`← Token usage: ${usage.input_tokens} in, ${usage.output_tokens} out`);
        } else if (chunk.type === 'error') {
          addServiceLog(`✗ Stream error: ${chunk.error.message}`);
          console.error('[ClaudeAgentDirect] Stream error:', chunk.error);
          throw new Error(chunk.error.message);
        }
      }

      addServiceLog(`✓ Stream complete - ${chunkCount} chunks, ${fullResponse.length} total chars`);

      // Add to Sensei for analysis only if we have content
      if (fullResponse.trim()) {
        addServiceLog('→ Sending complete response to Sensei...');
        try {
          await senseiService.addAgentRecommendation(
            'claude-agent-direct',
            sessionId,
            fullResponse,
            'claude-agent-direct'
          );
          addServiceLog('✓ Response sent to Sensei successfully');
        } catch (senseiError) {
          addServiceLog(`✗ Failed to send to Sensei: ${senseiError instanceof Error ? senseiError.message : String(senseiError)}`);
          console.error('[ClaudeAgentDirect] Sensei error:', senseiError);
          // Don't throw - this is non-critical
        }
      } else {
        addServiceLog('⚠ No content to send to Sensei (empty response)');
      }

      isLoadingRef.current = false;
      setIsLoading(false);
    } catch (error) {
      console.error('[ClaudeAgentDirect] Error:', error);

      const errorMessage: ConversationMessage = {
        id: `msg-${Date.now()}-error`,
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Failed to send message'}`,
        timestamp: new Date().toISOString()
      };

      setMessages(prev => [...prev, errorMessage]);
      isLoadingRef.current = false;
      setIsLoading(false);
    }
  };

  const handleInterrupt = async () => {
    if (session?.id) {
      await claudeAgentSDKService.interruptSession(session.id);
      isLoadingRef.current = false;
      setIsLoading(false);
    }
  };

  const isEditTool = (toolName: string): boolean => {
    return ['Write', 'Edit', 'Create', 'Delete'].some(t => toolName.includes(t));
  };

  const toggleToolExpansion = (toolId: string) => {
    setExpandedTools(prev => {
      const next = new Set(prev);
      if (next.has(toolId)) {
        next.delete(toolId);
      } else {
        next.add(toolId);
      }
      return next;
    });
  };

  const handleSaveApiKey = () => {
    const apiKeyInput = (document.getElementById('api-key-input') as HTMLInputElement)?.value;
    if (apiKeyInput) {
      localStorage.setItem('claude-agent-sdk-api-key', apiKeyInput);
      setShowSettings(false);
      window.location.reload(); // Reload to reinitialize
    }
  };

  const renderMessage = (message: ConversationMessage) => {
    return (
      <div key={message.id} className="mb-4">
        <div className="font-mono">
          <div className={`text-xs mb-1 ${message.role === 'user' ? 'text-yellow-400' : 'text-cyan-400'}`}>
            {message.role === 'user' ? (
              <span>{'>'} USER INPUT:</span>
            ) : (
              <span>{'<'} CLAUDE RESPONSE:</span>
            )}
          </div>
          <div className={`pl-4 border-l-2 ${message.role === 'user' ? 'border-yellow-400' : 'border-cyan-400'}`}>
            <div className="text-sm text-green-400 whitespace-pre-wrap font-mono">
              {message.content}
            </div>

            {/* Tool Uses */}
            {message.toolUses && message.toolUses.length > 0 && (
              <div className="mt-3 space-y-2">
                {message.toolUses.map(toolUse => {
                  // Convert SDK ToolUseInfo to shared ToolUse format
                  const sharedTool: SharedToolUse = {
                    id: toolUse.id,
                    name: toolUse.name,
                    input: toolUse.input,
                    status: toolUse.status === 'completed' ? 'executed' :
                            toolUse.status === 'failed' ? 'error' :
                            toolUse.status === 'running' ? 'pending' : 'pending',
                    result: typeof toolUse.output === 'string' ? toolUse.output : JSON.stringify(toolUse.output, null, 2),
                    error: toolUse.error,
                    timestamp: toolUse.timestamp
                  };

                  return (
                    <ToolUseDisplay
                      key={toolUse.id}
                      tool={sharedTool}
                      themeColor="purple"
                      showApprovalButtons={false}
                      isExpanded={showToolDetails || expandedTools.has(toolUse.id)}
                      onToggleExpand={() => toggleToolExpansion(toolUse.id)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Settings Modal (only show if explicitly requested, not for initial API key errors)
  if (showSettings) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-900 p-4">
        <div className="bg-gray-800 border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-6 max-w-md w-full">
          <div className="flex items-center space-x-2 mb-4">
            <SettingsIcon className="w-6 h-6 text-cyan-400" />
            <h3 className="text-xl font-bold text-white">Claude Agent SDK Settings</h3>
          </div>

          {apiKeyError && (
            <div className="bg-red-900/20 border-2 border-red-500 p-3 mb-4 rounded">
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-5 h-5 text-red-400" />
                <span className="text-sm text-red-300">{apiKeyError}</span>
              </div>
            </div>
          )}

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Anthropic API Key
            </label>
            <input
              id="api-key-input"
              type="password"
              placeholder="sk-ant-..."
              defaultValue={localStorage.getItem('claude-agent-sdk-api-key') || ''}
              className="w-full px-3 py-2 bg-gray-700 border-2 border-black text-white rounded focus:outline-none focus:border-cyan-400"
            />
            <p className="text-xs text-gray-400 mt-2">
              Get your API key from <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">console.anthropic.com</a>
            </p>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Permission Mode
            </label>
            <select
              value={permissionMode}
              onChange={(e) => setPermissionMode(e.target.value as PermissionMode)}
              className="w-full px-3 py-2 bg-gray-700 border-2 border-black text-white rounded focus:outline-none focus:border-cyan-400"
            >
              <option value="default">Ask for approval (default)</option>
              <option value="acceptEdits">Auto-approve edits</option>
              <option value="bypassPermissions">Bypass all (dangerous)</option>
              <option value="plan">Planning only (no execution)</option>
            </select>
          </div>

          <div className="flex space-x-3">
            <button
              onClick={handleSaveApiKey}
              className="flex-1 px-4 py-2 bg-cyan-400 text-black font-bold border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all rounded"
            >
              Save & Continue
            </button>
            <button
              onClick={() => setShowSettings(false)}
              className="px-4 py-2 bg-gray-600 text-white font-bold border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all rounded"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!isInitialized) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-900 text-gray-300">
        <div className="text-center max-w-lg">
          <FileText className="w-16 h-16 mx-auto mb-6 text-purple-400 animate-pulse" />
          <p className="text-xl font-bold mb-3 text-purple-300">Connecting to Claude Agent SDK...</p>
          <p className="text-sm mb-4 text-gray-400">Direct SDK integration (no CLI required)</p>

          {/* Show API key error if present */}
          {apiKeyError && (
            <div className="mt-4 bg-red-900/20 border-2 border-red-500 p-3 rounded max-w-md mx-auto">
              <div className="flex items-center space-x-2 justify-center">
                <AlertCircle className="w-5 h-5 text-red-400" />
                <span className="text-sm text-red-300">{apiKeyError}</span>
              </div>
              <button
                onClick={() => setShowSettings(true)}
                className="mt-3 px-4 py-2 bg-cyan-400 text-black font-bold border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all rounded text-sm"
              >
                Configure API Key
              </button>
            </div>
          )}

          {/* Show recent logs */}
          {serviceLogs.length > 0 && (
            <div className="mt-6 bg-black/50 border-2 border-purple-400 rounded-lg p-4 text-left">
              <div className="text-xs font-mono space-y-1 max-h-48 overflow-y-auto">
                {serviceLogs.slice(-10).map((log, index) => (
                  <div
                    key={index}
                    className={`${
                      log.includes('✗') || log.includes('ERROR')
                        ? 'text-red-400'
                        : log.includes('✓')
                        ? 'text-green-400'
                        : log.includes('⏱')
                        ? 'text-yellow-400'
                        : 'text-gray-400'
                    }`}
                  >
                    {log}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-purple-100 p-4">
      {/* Retro Window Container */}
      <div className="flex-1 bg-gray-200 overflow-hidden flex flex-col border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
        {/* Window Chrome */}
        <div className="bg-gradient-to-b from-purple-400 to-purple-600 px-2 py-1 flex items-center border-b-4 border-black">
          <div className="flex items-center space-x-2">
            <button className="w-6 h-6 bg-gray-300 border-2 border-black hover:bg-gray-400 flex items-center justify-center font-bold text-xs">_</button>
            <button className="w-6 h-6 bg-gray-300 border-2 border-black hover:bg-gray-400 flex items-center justify-center font-bold text-xs">□</button>
            <button className="w-6 h-6 bg-red-400 border-2 border-black hover:bg-red-500 flex items-center justify-center font-bold text-xs">X</button>
          </div>

          <div className="flex-1 mx-4">
            <div className="bg-gradient-to-r from-gray-100 to-gray-300 border-2 border-black px-3 py-0.5">
              <span className="font-bold text-black text-sm font-mono tracking-wider">
                {config?.workingDirectory ? config.workingDirectory.split('/').pop()?.toUpperCase() : 'ROOT'} - [DIRECT] - {session?.id ? session.id.slice(-4).toUpperCase() : 'NULL'}
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowToolDetails(!showToolDetails)}
              className={`p-1 border-2 border-black ${
                showToolDetails ? 'bg-green-400' : 'bg-gray-300'
              }`}
              title={showToolDetails ? 'Hide tools' : 'Show tools'}
            >
              <Wrench size={16} strokeWidth={2} />
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="p-1 border-2 border-black bg-gray-300 hover:bg-cyan-300"
              title="Settings"
            >
              <SettingsIcon size={16} strokeWidth={2} />
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="bg-gray-300 border-b-2 border-black px-2 py-1 flex items-center space-x-1">
          <span className="text-xs font-mono font-bold text-black">MODE:</span>
          <span className="text-xs font-mono text-black bg-purple-400 px-2 border border-black">SDK_DIRECT</span>
          <span className="text-xs font-mono text-black mx-2">|</span>
          <span className="text-xs font-mono font-bold text-black">STATUS:</span>
          <span className={`text-xs font-mono text-black px-2 border border-black ${
            !isServiceAvailable ? 'bg-red-400 animate-pulse' : isLoading ? 'bg-yellow-300' : 'bg-green-300'
          }`}>
            {!isServiceAvailable ? 'SERVICE_DOWN' : isLoading ? 'STREAMING' : 'READY'}
          </span>
          <span className="text-xs font-mono text-black mx-2">|</span>
          <span className="text-xs font-mono font-bold text-black">PERMISSIONS:</span>
          <span className="text-xs font-mono text-black bg-cyan-300 px-2 border border-black">
            {permissionMode.toUpperCase()}
          </span>
        </div>

        {/* Messages Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className={`flex-1 overflow-y-auto p-4 ${isLoading ? 'bg-black/90' : 'bg-black'}`}>
            {messages.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center font-mono">
                  <pre className="text-purple-400 text-xs mb-4">
{`    ╔══════════════════════════╗
    ║ CLAUDE AGENT SDK DIRECT  ║
    ║      VERSION 0.1.0       ║
    ╚══════════════════════════╝`}
                  </pre>
                  <p className="text-sm font-bold mb-2 text-purple-400 animate-pulse">SDK INITIALIZED</p>
                  <p className="text-xs text-purple-300">TYPE COMMAND TO BEGIN</p>
                </div>
              </div>
            ) : (
              <>
                {messages.map(renderMessage)}
                {isLoading && !isSenseiAnalyzing && (
                  <div className="mb-4 font-mono">
                    <div className="text-xs text-cyan-400 mb-1">
                      <span className="animate-pulse">Waiting for Claude Agent...</span>
                    </div>
                    <div className="text-sm text-purple-400 pl-4 border-l-2 border-purple-400">
                      <span className="animate-pulse">█</span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Input Area */}
          <div className="border-t-4 border-black bg-gradient-to-b from-gray-800 to-black p-3">
            <div className="bg-black border-2 border-purple-400 p-2">
              <div className="flex items-center space-x-2">
                <span className="text-yellow-400 font-mono text-sm font-bold">CMD:</span>
                <span className="text-purple-400 font-mono text-sm">{'>'}</span>
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                  placeholder={isServiceAvailable ? "Enter command" : "Service unavailable - check Admin"}
                  className="flex-1 bg-transparent text-purple-400 px-1 focus:outline-none placeholder-purple-600 font-mono text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={isLoading || !isServiceAvailable}
                  autoFocus
                />
                {isLoading ? (
                  <button
                    onClick={handleInterrupt}
                    className="px-3 py-1 bg-red-600 border-2 border-black text-white font-mono text-xs font-bold hover:bg-red-700"
                  >
                    [STOP]
                  </button>
                ) : (
                  <button
                    onClick={handleSendMessage}
                    disabled={!input.trim() || !isServiceAvailable}
                    className="px-3 py-1 bg-black border-2 border-purple-400 text-purple-400 font-mono text-xs font-bold hover:bg-purple-400 hover:text-black disabled:opacity-50 disabled:cursor-not-allowed"
                    title={!isServiceAvailable ? "Claude Agent service is not available" : ""}
                  >
                    [SEND]
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Token Usage Panel */}
          <div className="border-t-4 border-black bg-gray-800">
            <div
              className="px-3 py-1 bg-gradient-to-r from-green-600 to-green-700 border-b-2 border-black flex items-center justify-between cursor-pointer hover:from-green-500 hover:to-green-600"
              onClick={() => setShowTokenUsage(!showTokenUsage)}
            >
              <div className="flex items-center space-x-2">
                {showTokenUsage ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span className="text-xs font-mono font-bold text-white">TOKEN USAGE</span>
                <span className="text-xs font-mono text-green-200">
                  ({tokenUsage.total_requests} reqs · {tokenUsage.input_tokens.toLocaleString()} in · {tokenUsage.output_tokens.toLocaleString()} out)
                </span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setTokenUsage({
                    input_tokens: 0,
                    output_tokens: 0,
                    cache_creation_input_tokens: 0,
                    cache_read_input_tokens: 0,
                    total_requests: 0
                  });
                }}
                className="text-xs font-mono text-white hover:text-red-300 px-2 py-0.5 border border-white/30 rounded"
              >
                RESET
              </button>
            </div>

            {showTokenUsage && (
              <div className="bg-black/95 p-3 font-mono text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-gray-900 p-2 rounded border border-blue-500/30">
                    <div className="text-blue-400 font-bold mb-1">INPUT TOKENS</div>
                    <div className="text-white text-lg">{tokenUsage.input_tokens.toLocaleString()}</div>
                  </div>
                  <div className="bg-gray-900 p-2 rounded border border-green-500/30">
                    <div className="text-green-400 font-bold mb-1">OUTPUT TOKENS</div>
                    <div className="text-white text-lg">{tokenUsage.output_tokens.toLocaleString()}</div>
                  </div>
                  <div className="bg-gray-900 p-2 rounded border border-purple-500/30">
                    <div className="text-purple-400 font-bold mb-1">CACHE CREATED</div>
                    <div className="text-white text-lg">{tokenUsage.cache_creation_input_tokens.toLocaleString()}</div>
                  </div>
                  <div className="bg-gray-900 p-2 rounded border border-cyan-500/30">
                    <div className="text-cyan-400 font-bold mb-1">CACHE READ</div>
                    <div className="text-white text-lg">{tokenUsage.cache_read_input_tokens.toLocaleString()}</div>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-gray-700">
                  <div className="flex justify-between text-gray-400">
                    <span>Total Tokens:</span>
                    <span className="text-white font-bold">
                      {(tokenUsage.input_tokens + tokenUsage.output_tokens + tokenUsage.cache_creation_input_tokens).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between text-gray-400 mt-1">
                    <span>Cache Savings:</span>
                    <span className="text-green-400 font-bold">
                      {tokenUsage.cache_read_input_tokens.toLocaleString()} tokens
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Service Logs Panel */}
          <div className="border-t-4 border-black bg-gray-800">
            <div
              className="px-3 py-1 bg-gradient-to-r from-cyan-600 to-cyan-700 border-b-2 border-black flex items-center justify-between cursor-pointer hover:from-cyan-500 hover:to-cyan-600"
              onClick={() => setShowServiceLogs(!showServiceLogs)}
            >
              <div className="flex items-center space-x-2">
                {showServiceLogs ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span className="text-xs font-mono font-bold text-white">SERVICE LOGS</span>
                <span className="text-xs font-mono text-cyan-200">
                  ({serviceLogs.length} entries)
                </span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (session?.id && onUpdateSessionLogs) {
                    onUpdateSessionLogs(session.id, []);
                  }
                }}
                className="text-xs font-mono text-white hover:text-red-300 px-2 py-0.5 border border-white/30 rounded"
              >
                CLEAR
              </button>
            </div>

            {showServiceLogs && (
              <div className="bg-black/95 overflow-y-auto max-h-48 p-2 font-mono text-xs">
                {serviceLogs.length === 0 ? (
                  <div className="text-gray-600 text-center py-2">
                    [No service logs yet]
                  </div>
                ) : (
                  serviceLogs.map((log, index) => (
                    <div
                      key={index}
                      className={`py-0.5 ${
                        log.includes('✗') || log.includes('ERROR')
                          ? 'text-red-400'
                          : log.includes('✓')
                          ? 'text-green-400'
                          : log.includes('←')
                          ? 'text-cyan-400'
                          : log.includes('→')
                          ? 'text-yellow-400'
                          : 'text-gray-400'
                      }`}
                    >
                      {log}
                    </div>
                  ))
                )}
                <div ref={logsEndRef} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClaudeAgentDirectUI;