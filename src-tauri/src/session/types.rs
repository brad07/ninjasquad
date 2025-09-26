use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrchestratorSession {
    pub id: String,
    pub opencode_server_id: String,
    pub wezterm_pane_id: Option<String>,
    pub status: SessionStatus,
    pub created_at: String,
    pub task: Option<Task>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum SessionStatus {
    Idle,
    Working,
    Failed(String),
    Completed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub prompt: String,
    pub assigned_at: String,
    pub completed_at: Option<String>,
    pub result: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum DistributionStrategy {
    RoundRobin,
    LeastLoaded,
    Random,
}