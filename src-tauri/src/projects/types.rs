use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: String,
    pub description: Option<String>,
    pub color: Option<String>,
    pub created_at: String,
    pub last_accessed: Option<String>,
    pub is_favorite: bool,
    pub settings: Option<ProjectSettings>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectSettings {
    pub default_model: Option<String>,
    pub port_range: Option<(u16, u16)>,
    pub auto_start_server: bool,
}

impl Default for ProjectSettings {
    fn default() -> Self {
        Self {
            default_model: None,
            port_range: Some((4000, 5000)),
            auto_start_server: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateProjectRequest {
    pub name: String,
    pub path: String,
    pub description: Option<String>,
    pub color: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateProjectRequest {
    pub name: Option<String>,
    pub description: Option<String>,
    pub color: Option<String>,
    pub is_favorite: Option<bool>,
    pub settings: Option<ProjectSettings>,
}