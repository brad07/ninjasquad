use super::{CodingAgentPlugin, types::*};
use async_trait::async_trait;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use uuid::Uuid;
use chrono::Utc;

/// Claude Agent plugin implementation (using Claude API directly)
/// Note: The frontend uses Claude CLI which uses the Agent SDK internally
pub struct ClaudeCodePlugin {
    config: PluginConfig,
    api_key: Option<String>,
    sessions: Arc<RwLock<HashMap<String, AgentSession>>>,
    session_contexts: Arc<RwLock<HashMap<String, SessionContext>>>,
}

struct SessionContext {
    messages: Vec<Message>,
    #[allow(dead_code)]
    artifacts: Vec<Artifact>,
    current_tools: Vec<ToolUse>,
}

#[allow(dead_code)]
struct Message {
    role: String,
    content: String,
    timestamp: String,
}

#[allow(dead_code)]
struct Artifact {
    id: String,
    file_path: String,
    content: String,
    version: u32,
}

impl ClaudeCodePlugin {
    pub fn new() -> Self {
        let config = PluginConfig {
            name: "Claude Code".to_string(),
            version: "1.0.0".to_string(),
            description: "Claude AI agent with rich chat interface and tool use visualization (powered by Claude Agent SDK)".to_string(),
            author: "Anthropic Integration".to_string(),
            icon: Some("claude-icon.svg".to_string()),
            supported_models: vec![
                "claude-3-opus-20240229".to_string(),
                "claude-3-sonnet-20240229".to_string(),
                "claude-3-5-sonnet-20241022".to_string(),
                "claude-3-haiku-20240307".to_string(),
            ],
            default_model: "claude-3-5-sonnet-20241022".to_string(),
            requires_api_key: true,
            ui_component: UiComponentType::Custom,
            capabilities: PluginCapabilities {
                file_operations: true,
                terminal_access: false,
                git_operations: true,
                web_search: true,
                code_execution: false,
                custom_tools: vec![
                    "read_file".to_string(),
                    "write_file".to_string(),
                    "list_directory".to_string(),
                    "search_files".to_string(),
                    "run_command".to_string(),
                ],
            },
        };

        Self {
            config,
            api_key: None,
            sessions: Arc::new(RwLock::new(HashMap::new())),
            session_contexts: Arc::new(RwLock::new(HashMap::new())),
        }
    }
}

#[async_trait]
impl CodingAgentPlugin for ClaudeCodePlugin {
    fn get_config(&self) -> &PluginConfig {
        &self.config
    }

    fn get_id(&self) -> &str {
        "claude-code"
    }

    async fn initialize(&mut self, settings: HashMap<String, String>) -> Result<(), String> {
        println!("Initializing Claude Agent plugin");

        // Get API key from settings
        if let Some(api_key) = settings.get("api_key") {
            self.api_key = Some(api_key.clone());
            println!("Claude Agent API key configured");
        } else {
            return Err("Claude Agent requires an API key".to_string());
        }

        Ok(())
    }

    async fn spawn_server(
        &self,
        _port: u16,
        _model: Option<String>,
        _working_dir: Option<String>,
    ) -> Result<AgentServer, String> {
        // Claude Code doesn't need a server - it connects directly to the API
        let server_id = format!("claude-api-{}", Uuid::new_v4());

        Ok(AgentServer {
            id: server_id,
            plugin_id: self.get_id().to_string(),
            host: "api.anthropic.com".to_string(),
            port: 443,
            status: ServerStatus::Running,
            model: self.config.default_model.clone(),
            working_dir: ".".to_string(),
            created_at: Utc::now().to_rfc3339(),
            metadata: HashMap::new(),
        })
    }

    async fn stop_server(&self, _server_id: &str) -> Result<(), String> {
        // No server to stop for API-based plugin
        Ok(())
    }

    async fn health_check(&self, _server_id: &str) -> Result<bool, String> {
        // Check if API key is configured
        Ok(self.api_key.is_some())
    }

    async fn create_session(
        &self,
        server_id: &str,
        session_config: HashMap<String, serde_json::Value>,
    ) -> Result<AgentSession, String> {
        if self.api_key.is_none() {
            return Err("API key not configured".to_string());
        }

        let session_id = format!("claude-session-{}", Uuid::new_v4());

        let session = AgentSession {
            id: session_id.clone(),
            server_id: server_id.to_string(),
            plugin_id: self.get_id().to_string(),
            created_at: Utc::now().to_rfc3339(),
            status: SessionStatus::Active,
            metadata: session_config,
        };

        // Initialize session context
        let context = SessionContext {
            messages: Vec::new(),
            artifacts: Vec::new(),
            current_tools: Vec::new(),
        };

        let mut sessions = self.sessions.write().await;
        sessions.insert(session_id.clone(), session.clone());

        let mut contexts = self.session_contexts.write().await;
        contexts.insert(session_id.clone(), context);

        Ok(session)
    }

    async fn send_command(
        &self,
        session_id: &str,
        command: &str,
        context: Option<HashMap<String, String>>,
    ) -> Result<AgentResponse, String> {
        if self.api_key.is_none() {
            return Err("API key not configured".to_string());
        }

        // Add message to session context
        let mut contexts = self.session_contexts.write().await;
        if let Some(session_ctx) = contexts.get_mut(session_id) {
            session_ctx.messages.push(Message {
                role: "user".to_string(),
                content: command.to_string(),
                timestamp: Utc::now().to_rfc3339(),
            });

            // TODO: Implement actual Claude API call here
            // For now, return a placeholder response
            let response = AgentResponse {
                session_id: session_id.to_string(),
                content: format!("Claude would process: {}", command),
                response_type: ResponseType::Message,
                metadata: context.unwrap_or_default().into_iter()
                    .map(|(k, v)| (k, serde_json::Value::String(v)))
                    .collect(),
            };

            session_ctx.messages.push(Message {
                role: "assistant".to_string(),
                content: response.content.clone(),
                timestamp: Utc::now().to_rfc3339(),
            });

            Ok(response)
        } else {
            Err(format!("Session '{}' not found", session_id))
        }
    }

    async fn get_session_status(&self, session_id: &str) -> Result<SessionStatus, String> {
        let sessions = self.sessions.read().await;
        sessions.get(session_id)
            .map(|s| s.status.clone())
            .ok_or_else(|| format!("Session '{}' not found", session_id))
    }

    async fn list_sessions(&self) -> Vec<AgentSession> {
        let sessions = self.sessions.read().await;
        sessions.values().cloned().collect()
    }

    async fn cleanup(&mut self) -> Result<(), String> {
        self.sessions.write().await.clear();
        self.session_contexts.write().await.clear();
        Ok(())
    }

    async fn handle_tool_approval(
        &self,
        session_id: &str,
        tool_use: &ToolUse,
        approved: bool,
    ) -> Result<(), String> {
        // Claude Code can handle tool approvals for file operations
        let mut contexts = self.session_contexts.write().await;
        if let Some(session_ctx) = contexts.get_mut(session_id) {
            // Update tool status based on approval
            for tool in &mut session_ctx.current_tools {
                if tool.tool_name == tool_use.tool_name {
                    tool.status = if approved {
                        ToolStatus::Completed
                    } else {
                        ToolStatus::Failed("Rejected by user".to_string())
                    };
                }
            }
            Ok(())
        } else {
            Err(format!("Session '{}' not found", session_id))
        }
    }

    async fn stream_response(
        &self,
        _session_id: &str,
        _callback: Box<dyn Fn(String) + Send>,
    ) -> Result<(), String> {
        // TODO: Implement streaming with Claude API
        Ok(())
    }
}