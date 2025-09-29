use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Configuration for a coding agent plugin
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginConfig {
    pub name: String,
    pub version: String,
    pub description: String,
    pub author: String,
    pub icon: Option<String>,
    pub supported_models: Vec<String>,
    pub default_model: String,
    pub requires_api_key: bool,
    pub ui_component: UiComponentType,
    pub capabilities: PluginCapabilities,
}

/// Type of UI component the plugin uses
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum UiComponentType {
    Tmux,           // Terminal-based tmux interface
    Custom,         // Custom React component
    Webview,        // Embedded webview
    Iframe,         // Iframe to external URL
}

/// Capabilities that a plugin supports
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginCapabilities {
    pub file_operations: bool,
    pub terminal_access: bool,
    pub git_operations: bool,
    pub web_search: bool,
    pub code_execution: bool,
    pub custom_tools: Vec<String>,
}

/// Metadata about an agent server
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentServer {
    pub id: String,
    pub plugin_id: String,
    pub host: String,
    pub port: u16,
    pub status: ServerStatus,
    pub model: String,
    pub working_dir: String,
    pub created_at: String,
    pub metadata: HashMap<String, serde_json::Value>,
}

/// Server status
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ServerStatus {
    Starting,
    Running,
    Stopped,
    Error(String),
}

/// A session with a coding agent
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentSession {
    pub id: String,
    pub server_id: String,
    pub plugin_id: String,
    pub created_at: String,
    pub status: SessionStatus,
    pub metadata: HashMap<String, serde_json::Value>,
}

/// Session status
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SessionStatus {
    Active,
    Idle,
    Working,
    Completed,
    Failed(String),
}

/// Response from an agent
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentResponse {
    pub session_id: String,
    pub content: String,
    pub response_type: ResponseType,
    pub metadata: HashMap<String, serde_json::Value>,
}

/// Type of response from the agent
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ResponseType {
    Message,        // Plain text message
    Code,           // Code generation
    ToolUse,        // Tool invocation
    Error,          // Error message
    Progress,       // Progress update
    Artifact,       // Generated artifact (file, etc)
}

/// Tool use by an agent
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolUse {
    pub tool_name: String,
    pub parameters: HashMap<String, serde_json::Value>,
    pub result: Option<String>,
    pub status: ToolStatus,
}

/// Status of a tool invocation
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ToolStatus {
    Pending,
    Running,
    Completed,
    Failed(String),
    RequiresApproval,
}