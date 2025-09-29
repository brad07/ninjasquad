use super::{CodingAgentPlugin, types::*};
use async_trait::async_trait;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio::process::{Command, Child};
use uuid::Uuid;
use chrono::Utc;

/// OpenCode plugin implementation
pub struct OpenCodePlugin {
    config: PluginConfig,
    processes: Arc<RwLock<HashMap<String, Child>>>,
    servers: Arc<RwLock<HashMap<String, AgentServer>>>,
    sessions: Arc<RwLock<HashMap<String, AgentSession>>>,
}

impl OpenCodePlugin {
    pub fn new() -> Self {
        let config = PluginConfig {
            name: "OpenCode".to_string(),
            version: "1.0.0".to_string(),
            description: "OpenCode AI coding assistant with tmux interface".to_string(),
            author: "OpenCode Team".to_string(),
            icon: Some("opencode-icon.svg".to_string()),
            supported_models: vec![
                "claude-sonnet-4-0".to_string(),
                "gpt-4".to_string(),
                "gpt-3.5-turbo".to_string(),
            ],
            default_model: "claude-sonnet-4-0".to_string(),
            requires_api_key: false,
            ui_component: UiComponentType::Tmux,
            capabilities: PluginCapabilities {
                file_operations: true,
                terminal_access: true,
                git_operations: true,
                web_search: true,
                code_execution: true,
                custom_tools: vec![],
            },
        };

        Self {
            config,
            processes: Arc::new(RwLock::new(HashMap::new())),
            servers: Arc::new(RwLock::new(HashMap::new())),
            sessions: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    async fn spawn_sdk_server_internal(
        &self,
        port: u16,
        model: Option<String>,
        working_dir: Option<String>,
    ) -> Result<(String, Child), String> {
        let server_id = format!("opencode-{}", Uuid::new_v4());
        let model = model.unwrap_or_else(|| self.config.default_model.clone());

        // Determine the working directory
        let working_dir = if let Some(dir) = working_dir {
            std::path::PathBuf::from(dir)
        } else {
            dirs::home_dir()
                .ok_or_else(|| "Could not determine home directory".to_string())?
        };

        println!("Spawning OpenCode SDK server on port {} with model {}", port, model);

        // Get the path to the SDK server script
        let script_path = std::env::current_dir()
            .map_err(|e| format!("Failed to get current directory: {}", e))?
            .parent()
            .ok_or_else(|| "Could not get parent directory".to_string())?
            .join("src-tauri")
            .join("scripts")
            .join("sdk-server.js");

        if !script_path.exists() {
            return Err(format!("SDK server script not found at: {:?}", script_path));
        }

        // Spawn the Node.js process
        let mut cmd = Command::new("node");
        cmd.arg(script_path)
            .arg(port.to_string())
            .arg(&model)
            .current_dir(&working_dir)
            .kill_on_drop(true);

        let child = cmd.spawn()
            .map_err(|e| format!("Failed to spawn SDK server: {}", e))?;

        Ok((server_id, child))
    }
}

#[async_trait]
impl CodingAgentPlugin for OpenCodePlugin {
    fn get_config(&self) -> &PluginConfig {
        &self.config
    }

    fn get_id(&self) -> &str {
        "opencode"
    }

    async fn initialize(&mut self, _settings: HashMap<String, String>) -> Result<(), String> {
        println!("Initializing OpenCode plugin");
        Ok(())
    }

    async fn spawn_server(
        &self,
        port: u16,
        model: Option<String>,
        working_dir: Option<String>,
    ) -> Result<AgentServer, String> {
        let (server_id, child) = self.spawn_sdk_server_internal(port, model.clone(), working_dir.clone()).await?;

        // Store the process
        let mut processes = self.processes.write().await;
        processes.insert(server_id.clone(), child);

        // Wait for server to be ready
        tokio::time::sleep(tokio::time::Duration::from_secs(3)).await;

        let server = AgentServer {
            id: server_id.clone(),
            plugin_id: self.get_id().to_string(),
            host: "127.0.0.1".to_string(),
            port,
            status: ServerStatus::Running,
            model: model.unwrap_or_else(|| self.config.default_model.clone()),
            working_dir: working_dir.unwrap_or_else(|| ".".to_string()),
            created_at: Utc::now().to_rfc3339(),
            metadata: HashMap::new(),
        };

        // Store server info
        let mut servers = self.servers.write().await;
        servers.insert(server_id.clone(), server.clone());

        Ok(server)
    }

    async fn stop_server(&self, server_id: &str) -> Result<(), String> {
        // Kill the process
        let mut processes = self.processes.write().await;
        if let Some(mut child) = processes.remove(server_id) {
            child.kill().await
                .map_err(|e| format!("Failed to kill server process: {}", e))?;
        }

        // Remove from servers
        let mut servers = self.servers.write().await;
        servers.remove(server_id);

        Ok(())
    }

    async fn health_check(&self, server_id: &str) -> Result<bool, String> {
        let servers = self.servers.read().await;
        if let Some(server) = servers.get(server_id) {
            // Try to connect to the server
            match tokio::net::TcpStream::connect(format!("{}:{}", server.host, server.port)).await {
                Ok(_) => Ok(true),
                Err(_) => Ok(false),
            }
        } else {
            Ok(false)
        }
    }

    async fn create_session(
        &self,
        server_id: &str,
        _session_config: HashMap<String, serde_json::Value>,
    ) -> Result<AgentSession, String> {
        let servers = self.servers.read().await;
        let _server = servers.get(server_id)
            .ok_or_else(|| format!("Server '{}' not found", server_id))?;

        let session_id = format!("session-{}", Uuid::new_v4());

        let session = AgentSession {
            id: session_id.clone(),
            server_id: server_id.to_string(),
            plugin_id: self.get_id().to_string(),
            created_at: Utc::now().to_rfc3339(),
            status: SessionStatus::Active,
            metadata: HashMap::new(),
        };

        // Store session
        let mut sessions = self.sessions.write().await;
        sessions.insert(session_id.clone(), session.clone());

        Ok(session)
    }

    async fn send_command(
        &self,
        session_id: &str,
        command: &str,
        _context: Option<HashMap<String, String>>,
    ) -> Result<AgentResponse, String> {
        let sessions = self.sessions.read().await;
        let _session = sessions.get(session_id)
            .ok_or_else(|| format!("Session '{}' not found", session_id))?;

        // For OpenCode, commands are sent via tmux, so we just return a progress response
        // The actual command execution happens through the tmux integration
        Ok(AgentResponse {
            session_id: session_id.to_string(),
            content: format!("Command sent: {}", command),
            response_type: ResponseType::Progress,
            metadata: HashMap::new(),
        })
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
        // Kill all processes
        let mut processes = self.processes.write().await;
        for (_, mut child) in processes.drain() {
            let _ = child.kill().await;
        }

        // Clear all data
        self.servers.write().await.clear();
        self.sessions.write().await.clear();

        Ok(())
    }

    fn get_terminal_command(&self, server: &AgentServer, session_id: Option<&str>) -> Option<String> {
        // OpenCode uses tmux, so we return the opencode command
        let mut cmd = format!("opencode -h {} --port {}", server.host, server.port);

        if let Some(sid) = session_id {
            cmd.push_str(&format!(" -s {}", sid));
        }

        Some(cmd)
    }
}