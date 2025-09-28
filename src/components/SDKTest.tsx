import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { opencodeSDKService } from '../services/OpenCodeSDKService';

interface SDKServer {
  id: string;
  host: string;
  port: number;
  status: string;
  model?: string;
}

interface SDKSession {
  id: string;
  created_at: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const SDKTest: React.FC = () => {
  const [server, setServer] = useState<SDKServer | null>(null);
  const [session, setSession] = useState<SDKSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [port, setPort] = useState(4098);
  const [model, setModel] = useState('claude-3-5-sonnet-20241022');  // Use a real Claude model

  // Server Management
  const spawnServer = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Spawn SDK server
      const newServer = await invoke<SDKServer>('spawn_opencode_sdk_server', {
        port,
        model,
        working_dir: null
      });

      setServer(newServer);

      // Wait for server to be ready
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Connect SDK to the server - this sets the currentClient
      opencodeSDKService.setApiUrl(`http://localhost:${port}`);

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `✅ Server started on port ${port} with model ${model}`,
        timestamp: new Date()
      }]);
    } catch (err) {
      setError(`Failed to spawn server: ${err}`);
    } finally {
      setIsLoading(false);
    }
  };

  const stopServer = async () => {
    if (!server) return;

    setIsLoading(true);
    try {
      // The error says it expects 'serverId' (camelCase)
      await invoke('stop_opencode_server', { serverId: server.id });

      setServer(null);
      setSession(null);
      // Clear the client when stopping server
      opencodeSDKService.setApiUrl('');
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '🛑 Server stopped',
        timestamp: new Date()
      }]);
    } catch (err) {
      setError(`Failed to stop server: ${err}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Session Management
  const createSession = async () => {
    if (!server) return;

    setIsLoading(true);
    try {
      const newSession = await opencodeSDKService.createSession();
      setSession(newSession);

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `📦 Session created: ${newSession.id}`,
        timestamp: new Date()
      }]);
    } catch (err) {
      setError(`Failed to create session: ${err}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Chat Interaction
  const sendMessage = async () => {
    if (!session || !inputMessage.trim()) return;

    const userMessage = inputMessage;
    setInputMessage('');
    setMessages(prev => [...prev, {
      role: 'user',
      content: userMessage,
      timestamp: new Date()
    }]);

    setIsLoading(true);
    try {
      // Send message to OpenCode SDK
      const response = await opencodeSDKService.sendMessage(session.id, userMessage);

      // Add assistant response with better formatting
      console.log('Processing response:', response);

      let responseContent = 'No response';
      if (response !== undefined && response !== null) {
        if (typeof response === 'string' && response.trim() !== '') {
          responseContent = response;
        } else if (response.content) {
          responseContent = response.content;
        } else if (response.text) {
          responseContent = response.text;
        } else if (response.message) {
          responseContent = response.message;
        } else if (response.parts && Array.isArray(response.parts)) {
          // Handle parts array response
          const parts = response.parts
            .map((part: any) => {
              if (typeof part === 'string') return part;
              if (part.text) return part.text;
              if (part.content) return part.content;
              return JSON.stringify(part);
            })
            .filter((text: string) => text && text.trim() !== '');

          if (parts.length > 0) {
            responseContent = parts.join('\n');
          }
        } else if (response.result) {
          // Some APIs return result field
          responseContent = typeof response.result === 'string'
            ? response.result
            : JSON.stringify(response.result, null, 2);
        } else if (typeof response === 'object' && Object.keys(response).length > 0) {
          // If it's an object with content, show it
          responseContent = JSON.stringify(response, null, 2);
        }
      }

      // Add a note if we're still getting no response
      if (responseContent === 'No response' || responseContent === '{}') {
        responseContent = 'No response received. The prompt was sent but no content was returned. Check browser console for details.';
      }

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: responseContent,
        timestamp: new Date()
      }]);
    } catch (err) {
      setError(`Failed to send message: ${err}`);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `❌ Error: ${err}`,
        timestamp: new Date()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  // Test executing a command through prompts
  const testExecuteCommand = async (command: string, description: string) => {
    if (!session) return;

    setIsLoading(true);
    try {
      // Send the command as a prompt message
      const promptText = `Please execute this command and show me the output: ${command}`;

      setMessages(prev => [...prev, {
        role: 'user',
        content: `🔧 ${description}\nCommand: ${command}`,
        timestamp: new Date()
      }]);

      const response = await opencodeSDKService.sendMessage(session.id, promptText);

      // Parse the response
      let responseContent = 'No response';
      if (response) {
        if (typeof response === 'string') {
          responseContent = response;
        } else if (response.content) {
          responseContent = response.content;
        } else if (response.text) {
          responseContent = response.text;
        } else if (response.parts && Array.isArray(response.parts)) {
          responseContent = response.parts
            .map((part: any) => part.text || part.content || JSON.stringify(part))
            .join('\n');
        } else {
          responseContent = JSON.stringify(response, null, 2);
        }
      }

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: responseContent,
        timestamp: new Date()
      }]);
    } catch (err) {
      setError(`Failed to execute command: ${err}`);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `❌ Command failed: ${command}\nError: ${err}`,
        timestamp: new Date()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  // Check available models
  const checkAvailableModels = async () => {
    if (!server) return;

    setIsLoading(true);
    try {
      // Check what models are available
      const response = await fetch(`http://localhost:${server.port}/config/providers`);

      if (response.ok) {
        const data = await response.json();
        console.log('Available providers and models:', data);

        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `📋 Available Models:\n${JSON.stringify(data, null, 2)}`,
          timestamp: new Date()
        }]);
      } else {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `❌ Failed to fetch available models\nStatus: ${response.status}`,
          timestamp: new Date()
        }]);
      }
    } catch (err) {
      console.error('Failed to check models:', err);
      setError(`Failed to check models: ${err}`);
    } finally {
      setIsLoading(false);
    }
  };

  // SDK API Tests - Use /config endpoint for status check
  const testHealthCheck = async () => {
    if (!server) return;

    setIsLoading(true);
    try {
      // Use /config endpoint to check server status and get configuration
      const response = await fetch(`http://localhost:${server.port}/config`);

      if (response.ok) {
        const contentType = response.headers.get('content-type');
        let data;

        if (contentType && contentType.includes('application/json')) {
          data = await response.json();
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `✅ Server is running!\n\nConfiguration:\n${JSON.stringify(data, null, 2)}`,
            timestamp: new Date()
          }]);
        } else {
          data = await response.text();
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `✅ Server is running!\n\nResponse: ${data}`,
            timestamp: new Date()
          }]);
        }
      } else {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `❌ Server check failed\nStatus: ${response.status} ${response.statusText}`,
          timestamp: new Date()
        }]);
      }
    } catch (err) {
      // Connection error means server is not running
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `❌ Server is not responding\nError: ${err}`,
        timestamp: new Date()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const testGetConfig = async () => {
    if (!server) return;

    setIsLoading(true);
    try {
      const response = await fetch(`http://localhost:${server.port}/config`);
      const contentType = response.headers.get('content-type');

      let data;
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `⚙️ Config Response:\nStatus: ${response.status} ${response.statusText}\n${
          typeof data === 'string' ? data : JSON.stringify(data, null, 2)
        }`,
        timestamp: new Date()
      }]);
    } catch (err) {
      setError(`Failed to get config: ${err}`);
    } finally {
      setIsLoading(false);
    }
  };

  const testListSessions = async () => {
    if (!server) return;

    setIsLoading(true);
    try {
      const response = await fetch(`http://localhost:${server.port}/session`);
      const contentType = response.headers.get('content-type');

      let data;
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `📋 Sessions Response:\nStatus: ${response.status} ${response.statusText}\n${
          typeof data === 'string' ? data : JSON.stringify(data, null, 2)
        }`,
        timestamp: new Date()
      }]);
    } catch (err) {
      setError(`Failed to list sessions: ${err}`);
    } finally {
      setIsLoading(false);
    }
  };

  const clearMessages = () => {
    setMessages([]);
  };

  return (
    <div className="flex flex-col h-full bg-gray-900 text-gray-100">
      {/* Header */}
      <div className="bg-gray-800 p-4 border-b border-gray-700">
        <h1 className="text-2xl font-bold text-blue-400 mb-4">🧪 SDK API Test Console</h1>

        {/* Server Controls */}
        <div className="flex items-center space-x-4 mb-4">
          {!server ? (
            <>
              <input
                type="number"
                value={port}
                onChange={(e) => setPort(parseInt(e.target.value))}
                className="w-24 px-3 py-2 bg-gray-700 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
                placeholder="Port"
              />
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="px-3 py-2 bg-gray-700 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
              >
                <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</option>
                <option value="claude-3-5-haiku-20241022">Claude 3.5 Haiku</option>
                <option value="claude-3-opus-20240229">Claude 3 Opus</option>
              </select>
              <button
                onClick={spawnServer}
                disabled={isLoading}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition-colors disabled:opacity-50"
              >
                🚀 Start Server
              </button>
            </>
          ) : (
            <>
              <span className="text-green-400">
                Server running on port {server.port}
              </span>
              <button
                onClick={stopServer}
                disabled={isLoading}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50"
              >
                🛑 Stop Server
              </button>
            </>
          )}
        </div>

        {/* Session Controls */}
        {server && (
          <div className="flex items-center space-x-4 mb-4">
            {!session ? (
              <button
                onClick={createSession}
                disabled={isLoading}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors disabled:opacity-50"
              >
                📦 Create Session
              </button>
            ) : (
              <span className="text-purple-400">
                Session: {session.id.slice(0, 8)}...
              </span>
            )}
          </div>
        )}

        {/* API Test Buttons */}
        {server && (
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <button
                onClick={testHealthCheck}
                disabled={isLoading}
                className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded transition-colors disabled:opacity-50 text-sm"
              >
                Check Status
              </button>
              <button
                onClick={testGetConfig}
                disabled={isLoading}
                className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded transition-colors disabled:opacity-50 text-sm"
              >
                Get Config
              </button>
              <button
                onClick={testListSessions}
                disabled={isLoading}
                className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded transition-colors disabled:opacity-50 text-sm"
              >
                List Sessions
              </button>
              <button
                onClick={checkAvailableModels}
                disabled={isLoading}
                className="px-3 py-1 bg-purple-700 hover:bg-purple-600 rounded transition-colors disabled:opacity-50 text-sm"
              >
                Check Models
              </button>
              <button
                onClick={clearMessages}
                className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded transition-colors text-sm ml-auto"
              >
                Clear
              </button>
            </div>

            {/* Command Test Buttons - Only show when session exists */}
            {session && (
              <div className="pt-2 border-t border-gray-700">
                <div className="text-xs text-gray-400 mb-2">Test Commands:</div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => testExecuteCommand('ls -la', 'List files in current directory')}
                    disabled={isLoading}
                    className="px-3 py-1 bg-blue-700 hover:bg-blue-600 rounded transition-colors disabled:opacity-50 text-sm"
                  >
                    📁 List Files
                  </button>
                  <button
                    onClick={() => testExecuteCommand('pwd', 'Show current directory')}
                    disabled={isLoading}
                    className="px-3 py-1 bg-blue-700 hover:bg-blue-600 rounded transition-colors disabled:opacity-50 text-sm"
                  >
                    📍 Current Dir
                  </button>
                  <button
                    onClick={() => testExecuteCommand('echo "Hello from OpenCode!"', 'Echo test message')}
                    disabled={isLoading}
                    className="px-3 py-1 bg-blue-700 hover:bg-blue-600 rounded transition-colors disabled:opacity-50 text-sm"
                  >
                    💬 Echo Test
                  </button>
                  <button
                    onClick={() => testExecuteCommand('date', 'Show current date/time')}
                    disabled={isLoading}
                    className="px-3 py-1 bg-blue-700 hover:bg-blue-600 rounded transition-colors disabled:opacity-50 text-sm"
                  >
                    🕐 Date/Time
                  </button>
                  <button
                    onClick={() => testExecuteCommand('whoami', 'Show current user')}
                    disabled={isLoading}
                    className="px-3 py-1 bg-blue-700 hover:bg-blue-600 rounded transition-colors disabled:opacity-50 text-sm"
                  >
                    👤 Who Am I
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="mt-2 p-2 bg-red-900/20 border border-red-500 text-red-400 rounded">
            {error}
          </div>
        )}
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-3xl p-3 rounded-lg ${
                msg.role === 'user'
                  ? 'bg-blue-900/30 border border-blue-700'
                  : 'bg-gray-800 border border-gray-700'
              }`}
            >
              <div className="text-xs text-gray-500 mb-1">
                {msg.role === 'user' ? 'You' : 'OpenCode'} • {msg.timestamp.toLocaleTimeString()}
              </div>
              <pre className="whitespace-pre-wrap font-mono text-sm">{msg.content}</pre>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-800 p-3 rounded-lg">
              <div className="animate-pulse">Processing...</div>
            </div>
          </div>
        )}
      </div>

      {/* Input Area */}
      {server && session && (
        <div className="border-t border-gray-700 p-4">
          <div className="flex space-x-2">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              placeholder="Type a message to send to OpenCode..."
              disabled={isLoading}
              className="flex-1 px-4 py-2 bg-gray-800 rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none disabled:opacity-50"
            />
            <button
              onClick={sendMessage}
              disabled={isLoading || !inputMessage.trim()}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
            >
              Send
            </button>
          </div>
          <div className="text-xs text-gray-500 mt-2">
            Press Enter to send • This sends real API requests to the OpenCode SDK server
          </div>
        </div>
      )}

      {/* Instructions when no server */}
      {!server && (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center max-w-2xl">
            <h2 className="text-xl font-semibold mb-4">SDK API Testing</h2>
            <p className="text-gray-400 mb-6">
              This interface lets you test real interactions with an OpenCode server using the SDK API.
            </p>
            <div className="text-left space-y-2 text-sm text-gray-500">
              <p>1. Click "Start Server" to spawn a real OpenCode SDK server</p>
              <p>2. Create a session to begin interacting</p>
              <p>3. Send messages or test API endpoints</p>
              <p>4. All interactions are real SDK API calls, not simulated</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SDKTest;