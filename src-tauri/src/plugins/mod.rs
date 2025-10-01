pub mod types;
pub mod manager;
pub mod opencode;
pub mod claude_code;
pub mod sessions;

use async_trait::async_trait;
use std::collections::HashMap;
use crate::plugins::types::*;

/// Core trait that all coding agent plugins must implement
#[async_trait]
pub trait CodingAgentPlugin: Send + Sync {
    /// Get the plugin's configuration
    fn get_config(&self) -> &PluginConfig;

    /// Get the plugin's unique identifier
    fn get_id(&self) -> &str;

    /// Initialize the plugin
    async fn initialize(&mut self, settings: HashMap<String, String>) -> Result<(), String>;

    /// Spawn a new server/instance for this agent
    async fn spawn_server(
        &self,
        port: u16,
        model: Option<String>,
        working_dir: Option<String>
    ) -> Result<AgentServer, String>;

    /// Stop a running server
    async fn stop_server(&self, server_id: &str) -> Result<(), String>;

    /// Check if a server is healthy
    async fn health_check(&self, server_id: &str) -> Result<bool, String>;

    /// Create a new session with the agent
    async fn create_session(
        &self,
        server_id: &str,
        session_config: HashMap<String, serde_json::Value>
    ) -> Result<AgentSession, String>;

    /// Send a command/prompt to the agent
    async fn send_command(
        &self,
        session_id: &str,
        command: &str,
        context: Option<HashMap<String, String>>
    ) -> Result<AgentResponse, String>;

    /// Get the current session status
    async fn get_session_status(&self, session_id: &str) -> Result<SessionStatus, String>;

    /// List all active sessions
    async fn list_sessions(&self) -> Vec<AgentSession>;

    /// Clean up resources when plugin is unloaded
    async fn cleanup(&mut self) -> Result<(), String>;

    /// Handle tool use approval (for Sensei integration)
    async fn handle_tool_approval(
        &self,
        _session_id: &str,
        _tool_use: &ToolUse,
        approved: bool
    ) -> Result<(), String> {
        // Default implementation - plugins can override if they support tool approval
        if approved {
            Ok(())
        } else {
            Err("Tool use rejected".to_string())
        }
    }

    /// Get plugin-specific terminal command (for tmux-based agents)
    fn get_terminal_command(&self, _server: &AgentServer, _session_id: Option<&str>) -> Option<String> {
        // Default: no terminal command (for API-based agents)
        None
    }

    /// Stream responses (for agents that support streaming)
    async fn stream_response(
        &self,
        _session_id: &str,
        _callback: Box<dyn Fn(String) + Send>
    ) -> Result<(), String> {
        // Default: not supported
        Err("Streaming not supported by this plugin".to_string())
    }
}