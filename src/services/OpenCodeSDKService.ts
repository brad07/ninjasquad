import { createOpencodeClient, OpencodeClient } from '@opencode-ai/sdk/client';
import type {
  // Session types
  Session,
  Message,
  // Part types
  TextPartInput,
  // Configuration types
  Config,
  // Status types
  Project
} from '@opencode-ai/sdk/client';

export interface SDKServer {
  id: string;
  host: string;
  port: number;
  client: OpencodeClient;
  status: 'Starting' | 'Running' | 'Stopped' | 'Error';
  config?: Config;
}

export interface AvailableModel {
  provider: string;
  modelId: string;
  displayName: string;
}

// Extended session type that includes SDK session data
export interface ExtendedSession {
  serverId: string;
  session: Session;
  messages: Message[];
  status: 'Idle' | 'Working' | 'Completed' | 'Failed';
  lastResponse?: any; // Store the last AI response
  lastPrompt?: string; // Store the last prompt sent
}

export class OpenCodeSDKService {
  private servers: Map<string, SDKServer> = new Map();
  private sessions: Map<string, ExtendedSession> = new Map();
  private sessionResponses: Map<string, any> = new Map();
  private currentApiUrl: string = 'http://localhost:4096';
  private currentClient: OpencodeClient | null = null;

  async connectToServerWithSDK(port: number, model?: string): Promise<SDKServer> {
    const serverId = `sdk-server-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    try {
      console.log(`Connecting to OpenCode server with SDK on port ${port}...`);

      // Create a client for this server
      const client = createOpencodeClient({
        baseUrl: `http://localhost:${port}`,
        responseStyle: 'data' // This returns the data directly instead of wrapped in { data, request, response }
      } as any);

      console.log('Created OpenCode client, testing connection...');

      // Test connection by trying to list sessions
      try {
        const sessions = await client.session.list();
        console.log('Successfully connected to server on port', port, 'Sessions:', sessions);
      } catch (error: any) {
        console.error('Failed to list sessions:', error);
        console.error('Error details:', {
          message: error?.message,
          response: error?.response,
          status: error?.response?.status,
          statusText: error?.response?.statusText,
          data: error?.response?.data
        });
        throw new Error(`Server on port ${port} is not responding. Error: ${error?.message || error}. Please ensure an OpenCode server is running.`);
      }

      // Note: Config might be fetched differently in SDK
      let config: Config | undefined = {
        model: model || 'claude-sonnet-4-0'
      };

      const sdkServer: SDKServer = {
        id: serverId,
        host: 'localhost',
        port: port,
        client,
        status: 'Running',
        config
      };

      this.servers.set(serverId, sdkServer);
      console.log(`SDK connection ${serverId} established successfully on port ${port}`);

      return sdkServer;
    } catch (error) {
      console.error(`Failed to connect to SDK server on port ${port}:`, error);
      console.error('Full error details:', error);
      if (error instanceof Error) {
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
      }
      throw new Error(`Failed to connect to server: ${error}`);
    }
  }

  async disconnectFromServerWithSDK(serverId: string): Promise<void> {
    const sdkServer = this.servers.get(serverId);
    if (!sdkServer) {
      throw new Error(`Server ${serverId} not found`);
    }

    try {
      // Just remove from our tracking, don't actually stop the server
      sdkServer.status = 'Stopped';
      this.servers.delete(serverId);
      console.log(`SDK connection ${serverId} disconnected successfully`);
    } catch (error) {
      console.error(`Failed to disconnect SDK server ${serverId}:`, error);
      throw new Error(`Failed to disconnect from server: ${error}`);
    }
  }

  async createSDKSession(serverId: string, title?: string): Promise<ExtendedSession> {
    const sdkServer = this.servers.get(serverId);
    if (!sdkServer) {
      throw new Error(`Server ${serverId} not found`);
    }

    try {
      console.log('Creating session for server:', serverId);
      console.log('SDK Server details:', sdkServer);

      // Create session using the SDK client
      // With responseStyle: 'data', this returns the session directly
      const sessionTitle = title || `Session ${Date.now()}`;
      console.log('Creating session with title:', sessionTitle);

      const session = await sdkServer.client.session.create({
        body: {
          title: sessionTitle
        }
      }) as any;

      console.log('Session created:', session);

      // Ensure session has an ID
      if (!session || !session.id) {
        console.error('Invalid session response:', session);
        throw new Error('Session response missing ID');
      }

      const extendedSession: ExtendedSession = {
        serverId: serverId,
        session: session,
        messages: [],
        status: 'Idle'
      };

      this.sessions.set(session.id, extendedSession);
      console.log(`SDK Session ${session.id} created for server ${serverId}`);
      console.log('Session details:', session);

      return extendedSession;
    } catch (error) {
      console.error(`Failed to create SDK session for server ${serverId}:`, error);
      throw new Error(`Failed to create session: ${error}`);
    }
  }

  async sendPromptToSession(sessionId: string, prompt: string): Promise<any> {
    const extendedSession = this.sessions.get(sessionId);
    if (!extendedSession) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const sdkServer = this.servers.get(extendedSession.serverId);
    if (!sdkServer) {
      throw new Error(`Server ${extendedSession.serverId} not found for session`);
    }

    try {
      // Update session status and store prompt
      extendedSession.status = 'Working';
      extendedSession.lastPrompt = prompt;
      this.sessions.set(sessionId, extendedSession);

      console.log(`Sending prompt to SDK session ${sessionId}: ${prompt}`);

      // Send the prompt using the SDK
      const response = await sdkServer.client.session.prompt({
        path: { id: sessionId },
        body: {
          parts: [
            {
              type: 'text',
              text: prompt
            } as TextPartInput
          ]
        }
      });

      // Store the response (with responseStyle: 'data', response is the data directly)
      this.sessionResponses.set(sessionId, response);

      // Fetch and store the messages
      try {
        const messages = await this.getSessionMessages(sessionId);
        extendedSession.messages = messages;
      } catch (error) {
        console.warn('Could not fetch messages after prompt:', error);
      }

      // Update session status and store response
      extendedSession.status = 'Completed';
      extendedSession.lastResponse = response;
      this.sessions.set(sessionId, extendedSession);

      console.log(`Prompt sent successfully to SDK session ${sessionId}`);
      console.log('Response:', response);

      return response;
    } catch (error) {
      // Update session status on error
      extendedSession.status = 'Failed';
      this.sessions.set(sessionId, extendedSession);

      console.error(`Failed to send prompt to SDK session ${sessionId}:`, error);
      throw new Error(`Failed to send prompt: ${error}`);
    }
  }

  async getSDKServerHealth(serverId: string): Promise<boolean> {
    const sdkServer = this.servers.get(serverId);
    if (!sdkServer) {
      return false;
    }

    try {
      // Try to list sessions to check if server is responsive
      const sessions = await sdkServer.client.session.list();
      return sessions !== null;
    } catch (error) {
      console.error(`Health check failed for SDK server ${serverId}:`, error);
      return false;
    }
  }

  async getSessionMessages(sessionId: string): Promise<Message[]> {
    const extendedSession = this.sessions.get(sessionId);
    if (!extendedSession) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const sdkServer = this.servers.get(extendedSession.serverId);
    if (!sdkServer) {
      throw new Error(`Server ${extendedSession.serverId} not found`);
    }

    try {
      // Fetch all messages for the session
      const messages: Message[] = [];

      // Get session details (unused for now)
      // const sessionDetails = await sdkServer.client.session.get({
      //   path: { id: sessionId }
      // });

      // Note: The SDK might have a different way to list messages
      // This is a simplified approach - adjust based on actual SDK API
      return messages;
    } catch (error) {
      console.error(`Failed to fetch messages for session ${sessionId}:`, error);
      return [];
    }
  }

  listSDKServers(): SDKServer[] {
    return Array.from(this.servers.values());
  }

  listSDKSessions(): ExtendedSession[] {
    return Array.from(this.sessions.values());
  }

  getSDKServer(serverId: string): SDKServer | undefined {
    return this.servers.get(serverId);
  }

  getSDKSession(sessionId: string): ExtendedSession | undefined {
    return this.sessions.get(sessionId);
  }

  getSessionResponse(sessionId: string): any | undefined {
    return this.sessionResponses.get(sessionId);
  }

  // Get available models from server config
  getAvailableModels(serverId: string): string | undefined {
    const server = this.servers.get(serverId);
    return server?.config?.model;
  }

  // Set the API URL for the SDK client
  setApiUrl(url: string): void {
    this.currentApiUrl = url;
    if (!url) {
      // Clear the client if no URL provided
      this.currentClient = null;
      return;
    }
    // Create a new client with the updated URL and responseStyle
    this.currentClient = createOpencodeClient({
      baseUrl: url,
      responseStyle: 'data' // Returns data directly instead of wrapped response
    } as any);
    console.log('SDK client initialized with URL:', url);
  }

  // Create a session using the current client
  async createSession(): Promise<Session> {
    if (!this.currentClient) {
      console.error('No client initialized. Current API URL:', this.currentApiUrl);
      throw new Error('No client initialized. Call setApiUrl first.');
    }

    try {
      console.log('Creating session with client at:', this.currentApiUrl);

      const session = await this.currentClient.session.create({
        body: {
          title: `SDK Test Session ${Date.now()}`
        }
      }) as any;

      console.log('Session created successfully:', session);

      // Store the session in our internal map
      const extendedSession: ExtendedSession = {
        serverId: 'current',
        session,
        messages: [],
        status: 'Idle',
      };
      this.sessions.set(session.id, extendedSession);

      return session;
    } catch (error: any) {
      console.error('Failed to create session:', error);
      console.error('Error details:', {
        message: error?.message,
        response: error?.response,
        status: error?.response?.status,
        data: error?.response?.data
      });
      throw new Error(`Failed to create session: ${error?.message || error}`);
    }
  }

  // Send a message to a session
  async sendMessage(sessionId: string, message: string): Promise<any> {
    if (!this.currentClient) {
      throw new Error('No client initialized. Call setApiUrl first.');
    }

    const extendedSession = this.sessions.get(sessionId);
    if (!extendedSession) {
      // For simplified client, we might not have it tracked
      console.log('Session not in local map, proceeding anyway');
    }

    try {
      // Update session status if we have it
      if (extendedSession) {
        extendedSession.status = 'Working';
        extendedSession.lastPrompt = message;
        this.sessions.set(sessionId, extendedSession);
      }

      console.log('Sending prompt to session:', sessionId, 'Message:', message);

      // The server is configured with 'claude-sonnet-4-0' which doesn't exist
      // Let's try to omit the model entirely and let it fail more gracefully
      let promptBody: any = {
        parts: [
          {
            type: 'text',
            text: message
          }
        ]
      };

      console.log('Prompt body:', JSON.stringify(promptBody, null, 2));
      console.log('API URL:', this.currentApiUrl);

      // Try direct fetch first to debug the API
      try {
        let fetchResponse = await fetch(`${this.currentApiUrl}/session/${sessionId}/message`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(promptBody)
        });

        console.log('Direct fetch response status:', fetchResponse.status);

        if (!fetchResponse.ok) {
          const errorText = await fetchResponse.text();
          console.error('API Error Response (no model):', errorText);

          // If it's a model error, try with different model formats
          if (errorText.includes('ProviderModelNotFoundError') || errorText.includes('model')) {
            console.log('Trying with claude-3-5-sonnet-latest model...');

            // Try with model as string
            promptBody.model = 'claude-3-5-sonnet-latest';
            fetchResponse = await fetch(`${this.currentApiUrl}/session/${sessionId}/message`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(promptBody)
            });

            if (!fetchResponse.ok) {
              const errorText2 = await fetchResponse.text();
              console.error('API Error Response (with model string):', errorText2);

              // Try with model object format
              promptBody.model = {
                providerID: 'anthropic',
                modelID: 'claude-3-5-sonnet-latest'
              };

              fetchResponse = await fetch(`${this.currentApiUrl}/session/${sessionId}/message`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(promptBody)
              });

              if (!fetchResponse.ok) {
                const errorText3 = await fetchResponse.text();
                console.error('API Error Response (with model object):', errorText3);
              }
            }
          }

          if (!fetchResponse.ok) {
            // If all attempts fail, try the SDK method
            const response = await (this.currentClient.session as any).prompt({
              path: { id: sessionId },
              body: promptBody
            });
            return response;
          }
        }

        const response = await fetchResponse.json();
        console.log('Direct fetch successful response:', response);
        return response;
      } catch (fetchError) {
        console.error('Direct fetch failed:', fetchError);

        // Fall back to SDK method
        const response = await (this.currentClient.session as any).prompt({
          path: { id: sessionId },
          body: promptBody
        });
        console.log('SDK fallback response:', response);
        return response;
      }

      // The response might be a stream or need polling
      // Let's wait a bit and try to get the actual response
      if (!response || (typeof response === 'object' && Object.keys(response).length === 0)) {
        // Wait for the response to be processed
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Try to get messages or the session state
        try {
          // Some SDKs return an empty object and you need to poll or stream
          // Let's try getting the session to see if there's a response
          const sessionData = await this.currentClient.session.get({
            path: { id: sessionId }
          }) as any;

          console.log('Session data after prompt:', sessionData);

          // Check if there's a last_message or similar field
          if (sessionData?.last_message) {
            extendedSession.status = 'Completed';
            extendedSession.lastResponse = sessionData.last_message;
            this.sessions.set(sessionId, extendedSession);
            return sessionData.last_message;
          }
        } catch (pollError) {
          console.error('Error polling for response:', pollError);
        }
      }

      // Update session with response if we have it
      if (extendedSession) {
        extendedSession.status = 'Completed';
        extendedSession.lastResponse = response;
        this.sessions.set(sessionId, extendedSession);
      }

      return response;
    } catch (error: any) {
      if (extendedSession) {
        extendedSession.status = 'Failed';
        this.sessions.set(sessionId, extendedSession);
      }
      console.error('Error sending message:', error);
      console.error('Error details:', {
        message: error?.message,
        response: error?.response,
        status: error?.response?.status,
        statusText: error?.response?.statusText,
        data: error?.response?.data,
        body: error?.response?.body
      });

      // Try to provide more specific error information
      if (error?.response?.status === 400) {
        throw new Error(`Bad Request: The server rejected the message format. ${error?.response?.data || error?.message || error}`);
      }
      throw new Error(`Failed to send message: ${error?.message || error}`);
    }
  }

  // Fetch all available models from providers
  async fetchAvailableModels(serverId: string): Promise<AvailableModel[]> {
    const sdkServer = this.servers.get(serverId);
    if (!sdkServer) {
      throw new Error(`Server ${serverId} not found`);
    }

    try {
      const providersData = await sdkServer.client.config.providers() as any;
      const modelMap = new Map<string, AvailableModel>();

      // Always include claude-sonnet-4-0
      modelMap.set('claude-sonnet-4-0', {
        provider: 'anthropic',
        modelId: 'claude-sonnet-4-0',
        displayName: 'claude-sonnet-4-0'
      });

      // Get the default models from providers
      if (providersData?.default) {
        for (const [providerId, modelId] of Object.entries(providersData.default)) {
          const provider = providersData.providers?.find((p: any) => p.name === providerId);
          if (provider && modelId) {
            // Use just the modelId as the key to avoid duplicates
            modelMap.set(modelId as string, {
              provider: providerId,
              modelId: modelId as string,
              displayName: `${providerId}/${modelId}`
            });
          }
        }
      }

      return Array.from(modelMap.values());
    } catch (error) {
      console.error(`Failed to fetch available models:`, error);
      // Return minimal fallback if API fails
      return [
        { provider: 'anthropic', modelId: 'claude-sonnet-4-0', displayName: 'claude-sonnet-4-0' }
      ];
    }
  }

  // Disconnect all SDK servers
  async disconnectAllSDKServers(): Promise<number> {
    const count = this.servers.size;

    for (const serverId of this.servers.keys()) {
      try {
        await this.disconnectFromServerWithSDK(serverId);
        console.log(`Disconnected SDK server ${serverId}`);
      } catch (error) {
        console.error(`Failed to disconnect SDK server ${serverId}:`, error);
      }
    }

    this.sessions.clear();
    this.sessionResponses.clear();

    return count;
  }

  // Execute a command in a session
  async executeCommand(sessionId: string, command: string): Promise<any> {
    const extendedSession = this.sessions.get(sessionId);
    if (!extendedSession) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const sdkServer = this.servers.get(extendedSession.serverId);
    if (!sdkServer) {
      throw new Error(`Server not found for session`);
    }

    try {
      const response = await sdkServer.client.session.command({
        path: { id: sessionId },
        body: {
          command: command,
          arguments: ''
        }
      });

      console.log(`Command executed in session ${sessionId}:`, command);
      return response;
    } catch (error) {
      console.error(`Failed to execute command in session ${sessionId}:`, error);
      throw error;
    }
  }

  // Get logs from the server
  async getServerLogs(serverId: string): Promise<any[]> {
    const sdkServer = this.servers.get(serverId);
    if (!sdkServer) {
      throw new Error(`Server ${serverId} not found`);
    }

    try {
      // Note: log API might be different
      return [];
    } catch (error) {
      console.error(`Failed to fetch logs for server ${serverId}:`, error);
      return [];
    }
  }

  // List available projects
  async listProjects(serverId: string): Promise<Project[]> {
    const sdkServer = this.servers.get(serverId);
    if (!sdkServer) {
      throw new Error(`Server ${serverId} not found`);
    }

    try {
      const projects = await sdkServer.client.project.list() as any;
      return projects || [];
    } catch (error) {
      console.error(`Failed to list projects for server ${serverId}:`, error);
      return [];
    }
  }

  // List existing sessions for a server
  async listSessionsForServer(serverId: string): Promise<Session[]> {
    const sdkServer = this.servers.get(serverId);
    if (!sdkServer) {
      throw new Error(`Server ${serverId} not found`);
    }

    try {
      const sessions = await sdkServer.client.session.list() as any;
      return sessions || [];
    } catch (error) {
      console.error(`Failed to list sessions for server ${serverId}:`, error);
      return [];
    }
  }

  // Connect to an existing session
  async connectToExistingSession(serverId: string, sessionId: string): Promise<ExtendedSession | null> {
    const sdkServer = this.servers.get(serverId);
    if (!sdkServer) {
      throw new Error(`Server ${serverId} not found`);
    }

    try {
      // Get the session details
      const session = await sdkServer.client.session.get({
        path: { id: sessionId }
      }) as any;

      if (session) {
        const extendedSession: ExtendedSession = {
          serverId: serverId,
          session: session,
          messages: [],
          status: 'Idle'
        };

        this.sessions.set(sessionId, extendedSession);
        console.log(`Connected to existing session ${sessionId} on server ${serverId}`);
        return extendedSession;
      }
      return null;
    } catch (error) {
      console.error(`Failed to connect to existing session ${sessionId}:`, error);
      return null;
    }
  }
}

// Export a singleton instance
export const opencodeSDKService = new OpenCodeSDKService();