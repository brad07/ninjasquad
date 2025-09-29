use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeSession {
    pub id: String,
    pub project_id: String,
    pub working_directory: Option<String>,
    pub model: Option<String>,
    pub process_id: Option<u32>,
    pub created_at: String,
    pub last_used: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeMessage {
    pub role: String,  // "user" or "assistant"
    pub content: String,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeResponse {
    pub content: String,
    pub session_id: String,
    pub timestamp: String,
}