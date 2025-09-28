use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WezTermDomain {
    pub name: String,
    pub remote_address: String,
    pub username: String,
    pub connected: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WezTermPane {
    pub id: String,
    pub domain_name: String,
    pub title: String,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WezTermSession {
    pub domain: WezTermDomain,
    pub panes: Vec<WezTermPane>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandResult {
    pub success: bool,
    pub output: String,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WezTermWindow {
    pub window_id: String,
    pub pane_id: String,
    pub project_id: Option<String>,
    pub working_dir: String,
    pub position: Option<(i32, i32)>,
    pub size: Option<(u32, u32)>,
    pub pid: Option<u32>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowPosition {
    pub x: i32,
    pub y: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowSize {
    pub width: u32,
    pub height: u32,
}