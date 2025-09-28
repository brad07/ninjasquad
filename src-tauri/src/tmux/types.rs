use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TmuxSession {
    pub id: String,
    pub name: String,
    pub project_path: String,
    pub created_at: String,
    pub is_active: bool,
    pub window_count: u32,
    pub pane_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TmuxOutput {
    pub session_id: String,
    pub content: String,
    pub pane_id: String,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TmuxEvent {
    OutputUpdate(TmuxOutput),
    SessionCreated(String),
    SessionDestroyed(String),
    PaneCreated(String),
    PaneDestroyed(String),
}