import React, { useState, useRef, useEffect } from 'react';
import { FileText, CheckCircle, XCircle, ChevronDown, ChevronRight, Loader, Copy, Check, Wrench } from 'lucide-react';
import type { PluginUIProps, ConversationMessage, Artifact, ToolUse } from '../../types/plugin';
import { claudeCodeSDKService } from '../../services/ClaudeCodeSDKService';
import { emit, listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { senseiService } from '../../services/SenseiService';
import '../../styles/sensei-animations.css';

/**
 * Claude Code Plugin UI Component
 * Provides a chat interface for interacting with Claude Agent SDK
 */
const ClaudeCodeUI: React.FC<PluginUIProps> = ({
  plugin,
  session,
  server,
  onCommand,
  onToolApproval,
  config
}) => {
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const [showToolDetails, setShowToolDetails] = useState(true);
  const [localSessionId, setLocalSessionId] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Use session ID from props if available, otherwise use local
  const sessionId = session?.id || localSessionId;
  const sessionIdRef = useRef<string | null>(null);

  // Track working directory to prevent unnecessary updates
  const workingDirRef = useRef<string | undefined>(undefined);

  // Initialize Claude Agent SDK when model or working directory changes
  useEffect(() => {
    // Skip initialization if we don't have a session from props yet
    // Parent component should provide the session
    if (!session?.id) {
      console.log('Waiting for session ID from parent component...');
      return;
    }

    const initializeClaudeCode = async () => {
      console.log('=== ClaudeCodeUI initialization with session from parent ===', {
        timestamp: Date.now(),
        sessionFromProps: session?.id,
        config: config
      });

      try {
        const model = config?.model || plugin.defaultModel;
        const workingDirectory = config?.workingDirectory;

        await claudeCodeSDKService.initialize({
          model: model,
          workingDirectory: workingDirectory
        });

        // ALWAYS use the session from props - never create a new one
        const sid = session.id;

        // Ensure the session exists in the service
        const existingSession = claudeCodeSDKService.getSession(sid);
        if (!existingSession) {
          console.log('Registering session in service with ID:', sid);
          await claudeCodeSDKService.createSession(sid, workingDirectory);
        } else if (workingDirectory && workingDirectory !== workingDirRef.current) {
          // Only update working directory if it actually changed
          claudeCodeSDKService.updateSessionWorkingDirectory(sid, workingDirectory);
          workingDirRef.current = workingDirectory;
          console.log('Updated session working directory:', {
            sessionId: sid,
            workingDirectory: workingDirectory
          });
        }

        // Update refs with the session ID from props
        sessionIdRef.current = sid;
        setLocalSessionId(sid);
        setIsInitialized(true);
      } catch (error) {
        console.error('Failed to initialize Claude Code:', error);
      }
    };

    initializeClaudeCode();
  }, [config?.model, config?.workingDirectory, plugin.defaultModel, session?.id]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Listen for approved Sensei recommendations - set up only once
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let isMounted = true;

    const setupListener = async () => {
      unlisten = await listen('sensei-approved', (event) => {
        if (!isMounted) return; // Prevent processing if unmounted

        const payload = event.payload as {
          sessionId: string;
          recommendation: string;
          confidence: number;
          timestamp: string;
        };

        console.log('Received Sensei-approved recommendation:', payload);

        // Check for duplicate messages (same timestamp and content)
        const isDuplicate = messages.some(msg =>
          msg.timestamp === payload.timestamp &&
          msg.content?.includes(payload.recommendation)
        );

        if (isDuplicate) {
          console.log('Duplicate Sensei message detected, ignoring');
          return;
        }

        // Add as a new message from user and send to Claude
        const senseiMessage: ConversationMessage = {
          id: `sensei-${Date.now()}-${Math.random()}`,
          role: 'user',
          content: payload.recommendation,
          timestamp: new Date().toISOString()
        };

        // Add to messages
        setMessages(prev => [...prev, senseiMessage]);

        // Send to Claude Code for processing if we have a session
        if (sessionIdRef.current) {
          console.log('Processing approved recommendation with session:', sessionIdRef.current);
          // Process the approved recommendation as a new message
          handleApprovedRecommendation(payload.recommendation);
        } else {
          console.error('No session available to process approved recommendation');
        }
      });
    };

    setupListener();

    return () => {
      isMounted = false;
      if (unlisten) {
        unlisten();
      }
    };
  }, []); // Empty dependency array - only set up once

  const handleApprovedRecommendation = async (messageContent: string) => {
    const currentSessionId = sessionIdRef.current || sessionId;

    console.log('handleApprovedRecommendation called with:', {
      hasSessionIdRef: !!sessionIdRef.current,
      hasSessionId: !!sessionId,
      currentSessionId,
      messagePreview: messageContent.substring(0, 50)
    });

    if (!currentSessionId) {
      console.error('Cannot process approved recommendation - no session ID available');
      return;
    }

    const assistantMessageId = `msg-${Date.now() + 1}`;

    setIsLoading(true);

    try {
      // Create initial assistant message for streaming
      const assistantMessage: ConversationMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString()
      };

      setMessages(prev => [...prev, assistantMessage]);

      console.log('Streaming approved message to Claude Agent...');
      // Stream message to Claude Agent SDK
      const response = await claudeCodeSDKService.streamMessage(
        currentSessionId,
        messageContent,
        (chunk: string) => {
          // Update the assistant message with streaming chunks
          setMessages(prev => prev.map(msg =>
            msg.id === assistantMessageId
              ? { ...msg, content: msg.content + chunk }
              : msg
          ));

          // For approved messages, we don't need to update Sensei
          // The original recommendation is already displayed
        }
      );

      // Parse response for tool uses if any
      const toolUses: ToolUse[] = [];
      // Check if response mentions file operations or commands
      if (response.includes('```') || response.includes('command:') || response.includes('execute:')) {
        // Extract potential commands
        const codeBlocks = response.match(/```[\s\S]*?```/g) || [];
        codeBlocks.forEach((block, index) => {
          toolUses.push({
            toolId: `tool-${Date.now()}-${index}`,
            toolName: 'code_execution',
            input: block.replace(/```/g, '').trim(),
            status: 'pending'
          });
        });
      }

      // Update message with tool uses
      if (toolUses.length > 0) {
        setMessages(prev => prev.map(msg =>
          msg.id === assistantMessageId
            ? { ...msg, toolUses }
            : msg
        ));
      }

      setIsLoading(false);

      // For approved messages, we don't need to update Sensei
      // The original recommendation is already displayed
      console.log('Completed processing approved recommendation');
    } catch (error) {
      console.error('Failed to process approved recommendation:', error);

      // Show error message to user
      const errorMessage: ConversationMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Failed to process. Please check your API key and try again.'}`,
        timestamp: new Date().toISOString()
      };

      setMessages(prev => prev.map(msg =>
        msg.id === assistantMessageId ? errorMessage : msg
      ));
      setIsLoading(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = async () => {
    console.log('handleSendMessage called:', {
      hasInput: !!input.trim(),
      hasSessionId: !!sessionId,
      sessionId,
      input: input.substring(0, 50)
    });

    if (!input.trim() || !sessionId) {
      console.error('Cannot send message:', {
        inputEmpty: !input.trim(),
        sessionIdMissing: !sessionId
      });
      return;
    }

    const messageContent = input.trim();
    const userMessage: ConversationMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: messageContent,
      timestamp: new Date().toISOString()
    };

    const assistantMessageId = `msg-${Date.now() + 1}`;

    console.log('Creating user message:', {
      messageId: userMessage.id,
      sessionId,
      messageLength: messageContent.length
    });

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      console.log('Starting Claude Code stream for session:', sessionId);
      // Create initial assistant message for streaming
      const assistantMessage: ConversationMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString()
      };

      setMessages(prev => [...prev, assistantMessage]);

      // Track streaming state
      let streamingRecommendationId: string | null = null;
      let accumulatedResponse = '';
      let lastUpdateTime = Date.now();
      const UPDATE_INTERVAL = 300; // Update Sensei every 300ms
      let firstChunkReceived = false;

      // Stream message to Claude Agent SDK
      console.log('Calling claudeCodeSDKService.streamMessage...');
      const response = await claudeCodeSDKService.streamMessage(
        sessionId,
        messageContent,
        (chunk: string) => {
          // Log first chunk
          if (!firstChunkReceived) {
            console.log('Received first chunk from Claude:', chunk.substring(0, 50));
          }

          // Update the assistant message with streaming chunks
          setMessages(prev => prev.map(msg =>
            msg.id === assistantMessageId
              ? { ...msg, content: msg.content + chunk }
              : msg
          ));

          // Accumulate response for Sensei update
          accumulatedResponse += chunk;

          // Create Sensei recommendation on first chunk (not before)
          if (!firstChunkReceived && sessionId && chunk.trim()) {
            firstChunkReceived = true;
            streamingRecommendationId = senseiService.startStreamingRecommendation(
              'claude-code',
              sessionId,
              messageContent,
              'claude-code'
            );
            console.log('Started streaming recommendation after first chunk:', streamingRecommendationId);
          }

          // Update Sensei periodically during streaming
          const now = Date.now();
          if (streamingRecommendationId && sessionId && (now - lastUpdateTime > UPDATE_INTERVAL)) {
            senseiService.updateStreamingRecommendation(
              'claude-code',
              sessionId,
              streamingRecommendationId,
              messageContent,
              accumulatedResponse,
              'claude-code'
            );
            lastUpdateTime = now;
          }
        }
      );

      // Parse response for tool uses if any
      const toolUses: ToolUse[] = [];
      // Check if response mentions file operations or commands
      if (response.includes('```') || response.includes('command:') || response.includes('execute:')) {
        // Extract potential commands
        const codeBlocks = response.match(/```[\s\S]*?```/g) || [];
        codeBlocks.forEach((block, index) => {
          toolUses.push({
            toolId: `tool-${Date.now()}-${index}`,
            toolName: 'code_execution',
            input: block.replace(/```/g, '').trim(),
            status: 'pending'
          });
        });
      }

      // Update message with tool uses
      if (toolUses.length > 0) {
        setMessages(prev => prev.map(msg =>
          msg.id === assistantMessageId
            ? { ...msg, toolUses }
            : msg
        ));
      }

      setIsLoading(false);

      // Final update to Sensei with complete response
      if (streamingRecommendationId && sessionId) {
        senseiService.updateStreamingRecommendation(
          'claude-code',
          sessionId,
          streamingRecommendationId,
          messageContent,
          response,
          'claude-code'
        );
        console.log('Completed streaming recommendation:', {
          sessionId,
          message: messageContent.substring(0, 50),
          response: response.substring(0, 50)
        });
      } else if (sessionId) {
        // Fallback if streaming wasn't started
        senseiService.addAgentRecommendation(
          'claude-code',
          sessionId,
          messageContent,
          response,
          'claude-code',
          0.95
        );
      }

      // Also trigger Sensei's own analysis of the Claude response
      // This will generate Sensei's insights about what Claude said
      if (sessionId) {
        // Emit an event to indicate Sensei is starting analysis
        window.dispatchEvent(new CustomEvent('sensei-analyzing', {
          detail: {
            serverId: 'claude-code',
            sessionId,
            analyzing: true
          }
        }));

        const conversationContext = `User asked: ${messageContent}\n\nClaude Code responded: ${response}`;
        await senseiService.appendOutput('claude-code', sessionId, conversationContext, true);
        console.log('Triggered Sensei analysis of Claude response');
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      console.error('Error details:', {
        errorType: typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        sessionId,
        messageContent: messageContent.substring(0, 50)
      });

      // Show error message to user
      const errorMessage: ConversationMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Failed to send message. Please check your API key and try again.'}`,
        timestamp: new Date().toISOString()
      };

      setMessages(prev => prev.map(msg =>
        msg.id === assistantMessageId ? errorMessage : msg
      ));
      setIsLoading(false);
    }
  };

  const handleToolApproval = (toolUse: ToolUse, approved: boolean) => {
    if (onToolApproval) {
      onToolApproval(toolUse, approved);
    }
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
                  {message.toolUses.map(toolUse => (
                    <div key={toolUse.toolId} className="border border-gray-700 rounded p-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => toggleToolExpansion(toolUse.toolId)}
                            className="text-gray-400 hover:text-gray-200"
                          >
                            {expandedTools.has(toolUse.toolId) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </button>
                          <span className="text-sm font-mono text-yellow-400">{toolUse.toolName}</span>
                          {toolUse.status === 'approved' && <CheckCircle className="w-4 h-4 text-green-500" />}
                          {toolUse.status === 'rejected' && <XCircle className="w-4 h-4 text-red-500" />}
                        </div>
                        {toolUse.status === 'pending' && (
                          <div className="flex space-x-2">
                            <button
                              onClick={() => handleToolApproval(toolUse, true)}
                              className="px-2 py-1 bg-green-900/50 hover:bg-green-900/70 text-green-400 text-xs rounded"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => handleToolApproval(toolUse, false)}
                              className="px-2 py-1 bg-red-900/50 hover:bg-red-900/70 text-red-400 text-xs rounded"
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </div>
                      {(showToolDetails || expandedTools.has(toolUse.toolId)) && (
                        <div className="mt-2">
                          <pre className="text-xs text-gray-300 overflow-x-auto">{toolUse.input}</pre>
                          {toolUse.output && (
                            <div className="mt-2 pt-2 border-t border-gray-700">
                              <div className="text-xs text-gray-500 mb-1">Output:</div>
                              <pre className="text-xs text-gray-400 overflow-x-auto">{toolUse.output}</pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Artifacts */}
              {message.artifacts && message.artifacts.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {message.artifacts.map(artifact => (
                    <button
                      key={artifact.id}
                      onClick={() => setSelectedArtifact(artifact)}
                      className="flex items-center space-x-1 px-2 py-1 bg-purple-900/50 hover:bg-purple-900/70 text-purple-400 rounded text-xs"
                    >
                      <FileText className="w-3 h-3" />
                      <span>{artifact.title || artifact.id}</span>
                    </button>
                  ))}
                </div>
              )}
          </div>
        </div>
      </div>
    );
  };

  // Check if Claude CLI is available
  const checkClaudeCodeAvailable = async () => {
    try {
      await invoke('check_claude_code_available');
      return true;
    } catch {
      return false;
    }
  };

  if (!isInitialized) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        <div className="text-center">
          <FileText className="w-12 h-12 mx-auto mb-4 text-gray-600" />
          <p className="text-lg font-semibold mb-2">Setting up Claude Agent</p>
          <p className="text-sm mb-4">Claude uses your system's existing authentication</p>
          <div className="bg-gray-800 p-4 rounded-lg max-w-md mx-auto">
            <p className="text-xs text-gray-400 mb-2">Make sure Claude CLI is installed:</p>
            <ol className="text-xs text-gray-400 text-left space-y-1">
              <li>1. Install Claude CLI: <code className="bg-gray-700 px-1 rounded">npm install -g @anthropic-ai/claude-agent-sdk</code></li>
              <li>2. Authenticate: <code className="bg-gray-700 px-1 rounded">claude auth</code></li>
              <li>3. Claude will use your existing authentication</li>
              <li>4. No API key needed in this app!</li>
            </ol>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-purple-100 p-4">
      {/* Retro Window Container */}
      <div className="flex-1 bg-gray-200 overflow-hidden flex flex-col border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
        {/* Retro Window Chrome */}
        <div className="bg-gradient-to-b from-blue-400 to-blue-600 px-2 py-1 flex items-center border-b-4 border-black">
          {/* Left side controls */}
          <div className="flex items-center space-x-2">
            {/* Retro minimize/maximize/close buttons */}
            <button className="w-6 h-6 bg-gray-300 border-2 border-black hover:bg-gray-400 flex items-center justify-center font-bold text-xs">
              _
            </button>
            <button className="w-6 h-6 bg-gray-300 border-2 border-black hover:bg-gray-400 flex items-center justify-center font-bold text-xs">
              □
            </button>
            <button className="w-6 h-6 bg-red-400 border-2 border-black hover:bg-red-500 flex items-center justify-center font-bold text-xs">
              X
            </button>
          </div>

          {/* Window Title Bar */}
          <div className="flex-1 mx-4">
            <div className="bg-gradient-to-r from-gray-100 to-gray-300 border-2 border-black px-3 py-0.5">
              <span className="font-bold text-black text-sm font-mono tracking-wider">
                CLAUDE_CODE.EXE - [SESSION {sessionId ? sessionId.slice(-4).toUpperCase() : 'NULL'}]
              </span>
            </div>
          </div>

          {/* Right side status */}
          <div className="flex items-center space-x-2">
            <div className="bg-gray-300 border-2 border-black px-2 py-0.5">
              <span className="text-xs font-mono font-bold text-black">
                {config?.workingDirectory ? `C:\\${config.workingDirectory.split('/').pop()?.toUpperCase()}` : 'C:\\ROOT'}
              </span>
            </div>
            <button
              onClick={() => setShowToolDetails(!showToolDetails)}
              className={`p-1 border-2 border-black ${
                showToolDetails
                  ? 'bg-green-400 text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                  : 'bg-gray-300 text-black hover:bg-yellow-300'
              }`}
              title={showToolDetails ? 'Hide tool details' : 'Show tool details'}
            >
              <Wrench size={16} strokeWidth={2} />
            </button>
          </div>
        </div>

        {/* Retro toolbar */}
        <div className="bg-gray-300 border-b-2 border-black px-2 py-1 flex items-center space-x-1">
          <span className="text-xs font-mono font-bold text-black">MODE:</span>
          <span className="text-xs font-mono text-black bg-green-400 px-2 border border-black">ACTIVE</span>
          <span className="text-xs font-mono text-black mx-2">|</span>
          <span className="text-xs font-mono font-bold text-black">STATUS:</span>
          <span className="text-xs font-mono text-black bg-yellow-300 px-2 border border-black">
            {isLoading ? 'PROCESSING' : 'READY'}
          </span>
        </div>

        {/* Terminal Body */}
        <div className={`flex-1 flex overflow-hidden transition-all duration-500 ${
          isLoading ? 'sensei-analyzing-bg' : 'bg-purple-50'
        }`}>
          <div className="flex-1 flex flex-col h-full">
            {/* Messages - Scrollable */}
            <div className={`flex-1 overflow-y-auto p-4 transition-all duration-500 ${
              isLoading ? 'bg-black/90' : 'bg-black'
            }`} style={{
              backgroundImage: !isLoading ? 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0, 255, 0, 0.03) 2px, rgba(0, 255, 0, 0.03) 4px)' : 'none'
            }}>
              {messages.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center font-mono">
                    <pre className="text-green-400 text-xs mb-4">
{`    ╔════════════════════════╗
    ║  CLAUDE CODE TERMINAL  ║
    ║    VERSION 1.337       ║
    ╚════════════════════════╝`}
                    </pre>
                    <p className="text-sm font-bold mb-2 text-green-400 animate-pulse">SYSTEM READY</p>
                    <p className="text-xs text-green-300">TYPE COMMAND TO BEGIN SESSION</p>
                    <p className="text-xs text-green-300 mt-2 animate-pulse">█</p>
                  </div>
                </div>
              ) : (
                <>
                  {messages.map(renderMessage)}
                  {isLoading && (
                    <div className="mb-4 font-mono">
                      <div className="text-xs text-cyan-400 mb-1">
                        <span className="animate-pulse">[CLAUDE IS ANALYZING...]</span>
                      </div>
                      <div className="text-sm text-green-400 pl-4 border-l-2 border-yellow-400">
                        <span className="animate-pulse">AWAITING CLAUDE RESPONSE</span>
                        <span className="ml-2 inline-block animate-pulse">█</span>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {/* Retro Input Area */}
            <div className="border-t-4 border-black bg-gradient-to-b from-gray-800 to-black p-3 flex-shrink-0">
              <div className="bg-black border-2 border-green-400 p-2">
                <div className="flex items-center space-x-2">
                  <span className="text-yellow-400 font-mono text-sm font-bold">CMD:</span>
                  <span className="text-green-400 font-mono text-sm">{'>'}</span>
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                    placeholder="ENTER_COMMAND"
                    className="flex-1 bg-transparent text-green-400 px-1 focus:outline-none placeholder-green-600 font-mono text-sm uppercase"
                    disabled={isLoading}
                    autoFocus
                    style={{
                      textShadow: '0 0 2px #00ff00'
                    }}
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={isLoading || !input.trim()}
                    className="px-3 py-1 bg-black border-2 border-green-400 text-green-400 font-mono text-xs font-bold hover:bg-green-400 hover:text-black disabled:opacity-50 transition-colors"
                  >
                    [SEND]
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Artifact Viewer */}
          {selectedArtifact && (
            <div className="w-96 border-l border-gray-700 bg-gray-850 flex flex-col">
              <div className="bg-gray-800 border-b border-gray-700 p-3 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-gray-100">{selectedArtifact.title || 'Artifact'}</h4>
                <button
                  onClick={() => setSelectedArtifact(null)}
                  className="text-gray-400 hover:text-gray-200"
                >
                  ×
                </button>
              </div>
              <div className="flex-1 p-4 overflow-auto">
                <pre className="text-sm text-gray-300 whitespace-pre-wrap">{selectedArtifact.content}</pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ClaudeCodeUI;