use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio::process::Command;
use tokio::time::{sleep, Duration};
use uuid::Uuid;
use chrono::Utc;
use tauri::{AppHandle, Emitter};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MirrorUpdate {
    pub mirror_id: String,
    pub content: String,
    pub cursor_x: u16,
    pub cursor_y: u16,
    pub viewport_start: i32,
    pub viewport_end: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WezTermMirror {
    pub id: String,
    pub pane_id: String,
    pub window_id: String,
    pub project_path: String,
    pub last_content: String,
    pub is_active: bool,
    pub created_at: String,
}

pub struct MirrorManager {
    mirrors: Arc<RwLock<HashMap<String, WezTermMirror>>>,
    app_handle: Option<AppHandle>,
}

impl MirrorManager {
    pub fn new() -> Self {
        Self {
            mirrors: Arc::new(RwLock::new(HashMap::new())),
            app_handle: None,
        }
    }

    pub fn set_app_handle(&mut self, handle: AppHandle) {
        self.app_handle = Some(handle);
    }

    pub async fn create_mirror(&self, project_path: &str) -> Result<WezTermMirror, String> {
        // First spawn a minimized WezTerm window
        let output = Command::new("wezterm")
            .arg("cli")
            .arg("spawn")
            .arg("--new-window")
            .arg("--cwd")
            .arg(project_path)
            .arg("--")
            .arg("bash")
            .arg("-c")
            .arg("unset npm_config_prefix && opencode")
            .output()
            .await;

        let output = match output {
            Ok(o) => o,
            Err(_) => {
                // If CLI fails, try starting WezTerm first
                println!("Starting WezTerm multiplexer...");

                let _ = Command::new("wezterm")
                    .arg("start")
                    .arg("--cwd")
                    .arg(project_path)
                    .arg("--")
                    .arg("bash")
                    .arg("-c")
                    .arg("unset npm_config_prefix && opencode")
                    .spawn()
                    .map_err(|e| format!("Failed to start WezTerm: {}", e))?;

                // Wait for it to start
                sleep(Duration::from_secs(2)).await;

                // Try spawning again
                Command::new("wezterm")
                    .arg("cli")
                    .arg("spawn")
                    .arg("--new-window")
                    .arg("--cwd")
                    .arg(project_path)
                    .arg("--")
                    .arg("bash")
                    .arg("-c")
                    .arg("unset npm_config_prefix && opencode")
                    .output()
                    .await
                    .map_err(|e| format!("Failed to spawn after starting: {}", e))?
            }
        };

        if !output.status.success() {
            return Err(format!("Failed to spawn WezTerm: {}",
                String::from_utf8_lossy(&output.stderr)));
        }

        let pane_id = String::from_utf8_lossy(&output.stdout).trim().to_string();

        if pane_id.is_empty() {
            return Err("Failed to get pane ID from WezTerm".to_string());
        }

        let mirror_id = Uuid::new_v4().to_string();
        let window_id = format!("win_{}", pane_id);

        let mirror = WezTermMirror {
            id: mirror_id.clone(),
            pane_id: pane_id.clone(),
            window_id,
            project_path: project_path.to_string(),
            last_content: String::new(),
            is_active: true,
            created_at: Utc::now().to_rfc3339(),
        };

        // Store the mirror
        self.mirrors.write().await.insert(mirror_id.clone(), mirror.clone());

        // Start polling for this mirror
        self.start_polling(mirror_id.clone()).await;

        Ok(mirror)
    }

    async fn start_polling(&self, mirror_id: String) {
        let mirrors = self.mirrors.clone();
        let app_handle = self.app_handle.clone();

        tokio::spawn(async move {
            loop {
                // Check if mirror still exists and is active
                let should_continue = {
                    let mirrors_lock = mirrors.read().await;
                    if let Some(mirror) = mirrors_lock.get(&mirror_id) {
                        mirror.is_active
                    } else {
                        false
                    }
                };

                if !should_continue {
                    break;
                }

                // Get the pane_id
                let pane_id = {
                    let mirrors_lock = mirrors.read().await;
                    if let Some(mirror) = mirrors_lock.get(&mirror_id) {
                        mirror.pane_id.clone()
                    } else {
                        break;
                    }
                };

                // Get terminal content with escape sequences
                let output = Command::new("wezterm")
                    .arg("cli")
                    .arg("get-text")
                    .arg("--pane-id")
                    .arg(&pane_id)
                    .arg("--escapes")
                    .output()
                    .await;

                if let Ok(output) = output {
                    if output.status.success() {
                        let content = String::from_utf8_lossy(&output.stdout).to_string();

                        // Check if content changed
                        let changed = {
                            let mut mirrors_lock = mirrors.write().await;
                            if let Some(mirror) = mirrors_lock.get_mut(&mirror_id) {
                                if mirror.last_content != content {
                                    mirror.last_content = content.clone();
                                    true
                                } else {
                                    false
                                }
                            } else {
                                false
                            }
                        };

                        if changed {
                            // Emit update event
                            if let Some(handle) = &app_handle {
                                let update = MirrorUpdate {
                                    mirror_id: mirror_id.clone(),
                                    content,
                                    cursor_x: 0, // TODO: Get actual cursor position
                                    cursor_y: 0,
                                    viewport_start: 0,
                                    viewport_end: 24, // TODO: Get actual viewport
                                };

                                let _ = handle.emit("wezterm-mirror-update", update);
                            }
                        }
                    }
                }

                // Poll every 100ms
                sleep(Duration::from_millis(100)).await;
            }

            println!("Polling stopped for mirror {}", mirror_id);
        });
    }

    pub async fn send_input(&self, mirror_id: &str, text: &str) -> Result<(), String> {
        let mirrors = self.mirrors.read().await;

        if let Some(mirror) = mirrors.get(mirror_id) {
            let output = Command::new("wezterm")
                .arg("cli")
                .arg("send-text")
                .arg("--pane-id")
                .arg(&mirror.pane_id)
                .arg("--no-paste")
                .arg(text)
                .output()
                .await
                .map_err(|e| format!("Failed to send input: {}", e))?;

            if output.status.success() {
                Ok(())
            } else {
                Err(format!("Failed to send text: {}",
                    String::from_utf8_lossy(&output.stderr)))
            }
        } else {
            Err(format!("Mirror {} not found", mirror_id))
        }
    }

    pub async fn stop_mirror(&self, mirror_id: &str) -> Result<(), String> {
        let mut mirrors = self.mirrors.write().await;

        if let Some(mirror) = mirrors.get_mut(mirror_id) {
            mirror.is_active = false;

            // Kill the WezTerm pane
            let _ = Command::new("wezterm")
                .arg("cli")
                .arg("kill-pane")
                .arg("--pane-id")
                .arg(&mirror.pane_id)
                .output()
                .await;
        }

        mirrors.remove(mirror_id);
        Ok(())
    }

    pub async fn get_mirror_content(&self, mirror_id: &str) -> Result<String, String> {
        let mirrors = self.mirrors.read().await;

        if let Some(mirror) = mirrors.get(mirror_id) {
            // Get fresh content
            let output = Command::new("wezterm")
                .arg("cli")
                .arg("get-text")
                .arg("--pane-id")
                .arg(&mirror.pane_id)
                .arg("--escapes")
                .output()
                .await
                .map_err(|e| format!("Failed to get content: {}", e))?;

            if output.status.success() {
                Ok(String::from_utf8_lossy(&output.stdout).to_string())
            } else {
                Err(format!("Failed to get text: {}",
                    String::from_utf8_lossy(&output.stderr)))
            }
        } else {
            Err(format!("Mirror {} not found", mirror_id))
        }
    }

    pub async fn list_mirrors(&self) -> Vec<WezTermMirror> {
        self.mirrors.read().await.values().cloned().collect()
    }
}