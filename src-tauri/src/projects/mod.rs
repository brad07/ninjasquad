pub mod manager;
pub mod types;

use crate::database::DatabaseManager;
use manager::ProjectsManager;
use tauri::State;
use types::{CreateProjectRequest, Project, UpdateProjectRequest};

#[tauri::command]
pub async fn create_project(
    db: State<'_, DatabaseManager>,
    request: CreateProjectRequest,
) -> Result<Project, String> {
    let manager = ProjectsManager::new(&db);
    manager.create(request).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_project(
    db: State<'_, DatabaseManager>,
    id: String,
) -> Result<Option<Project>, String> {
    let manager = ProjectsManager::new(&db);
    manager.get(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_project_by_path(
    db: State<'_, DatabaseManager>,
    path: String,
) -> Result<Option<Project>, String> {
    let manager = ProjectsManager::new(&db);
    manager.get_by_path(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_projects(
    db: State<'_, DatabaseManager>,
) -> Result<Vec<Project>, String> {
    let manager = ProjectsManager::new(&db);
    manager.list().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_favorite_projects(
    db: State<'_, DatabaseManager>,
) -> Result<Vec<Project>, String> {
    let manager = ProjectsManager::new(&db);
    manager.list_favorites().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_recent_projects(
    db: State<'_, DatabaseManager>,
    limit: usize,
) -> Result<Vec<Project>, String> {
    let manager = ProjectsManager::new(&db);
    manager.list_recent(limit).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_project(
    db: State<'_, DatabaseManager>,
    id: String,
    request: UpdateProjectRequest,
) -> Result<Option<Project>, String> {
    let manager = ProjectsManager::new(&db);
    manager.update(&id, request).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_project_last_accessed(
    db: State<'_, DatabaseManager>,
    id: String,
) -> Result<(), String> {
    let manager = ProjectsManager::new(&db);
    manager.update_last_accessed(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_project(
    db: State<'_, DatabaseManager>,
    id: String,
) -> Result<bool, String> {
    let manager = ProjectsManager::new(&db);
    manager.delete(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn project_exists(
    db: State<'_, DatabaseManager>,
    path: String,
) -> Result<bool, String> {
    let manager = ProjectsManager::new(&db);
    manager.exists(&path).map_err(|e| e.to_string())
}