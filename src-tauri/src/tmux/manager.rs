use super::types::{TmuxSession, TmuxOutput};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio::process::Command;
use uuid::Uuid;
use chrono::Utc;
use tauri::{AppHandle, Emitter};

pub struct TmuxManager {
    sessions: Arc<RwLock<HashMap<String, TmuxSession>>>,
    app_handle: Option<AppHandle>,
}

impl TmuxManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(RwLock::new(HashMap::new())),
            app_handle: None,
        }
    }

    pub fn set_app_handle(&mut self, handle: AppHandle) {
        self.app_handle = Some(handle);
    }

    pub async fn create_session(&self, project_path: &str) -> Result<TmuxSession, String> {
        let session_id = format!("tmux-{}", Uuid::new_v4().to_string().chars().take(8).collect::<String>());
        let session_name = session_id.clone();

        // Create a new tmux session in detached mode running opencode
        let output = Command::new("tmux")
            .args(&[
                "new-session",
                "-d",
                "-s", &session_name,
                "-c", project_path,
                "unset npm_config_prefix && opencode"
            ])
            .output()
            .await
            .map_err(|e| format!("Failed to create tmux session: {}", e))?;

        if !output.status.success() {
            return Err(format!("Failed to create tmux session: {}",
                String::from_utf8_lossy(&output.stderr)));
        }

        let session = TmuxSession {
            id: session_id.clone(),
            name: session_name.clone(),
            project_path: project_path.to_string(),
            created_at: Utc::now().to_rfc3339(),
            is_active: true,
            window_count: 1,
            pane_count: 1,
        };

        // Store the session
        self.sessions.write().await.insert(session_id.clone(), session.clone());

        // Start control mode monitoring
        self.start_control_mode(&session_id).await?;

        Ok(session)
    }

    async fn start_control_mode(&self, session_id: &str) -> Result<(), String> {
        // Use a different approach - write to a file with tail -f monitoring
        let output_file = format!("/tmp/tmux-{}.log", session_id);

        // Remove old file if exists
        let _ = tokio::fs::remove_file(&output_file).await;

        // Create the output file
        tokio::fs::write(&output_file, b"").await
            .map_err(|e| format!("Failed to create output file: {}", e))?;

        // Start piping the pane output directly to a file
        // This should be unbuffered by default
        Command::new("tmux")
            .args(&[
                "pipe-pane",
                "-t", session_id,
                "-o",  // Output mode
                &format!("cat >> {}", output_file)
            ])
            .output()
            .await
            .map_err(|e| format!("Failed to start pipe-pane: {}", e))?;

        // Start monitoring the output file
        let session_id_clone = session_id.to_string();
        let app_handle = self.app_handle.clone();
        let output_file_clone = output_file.clone();

        tokio::spawn(async move {
            use tokio::process::Command;
            use tokio::io::{AsyncBufReadExt, BufReader};

            // Use tail -F to follow the file with immediate updates
            let mut child = match Command::new("tail")
                .args(&["-F", "-n", "0", &output_file_clone])
                .stdout(std::process::Stdio::piped())
                .spawn()
            {
                Ok(c) => c,
                Err(e) => {
                    println!("Failed to start tail: {}", e);
                    return;
                }
            };

            let stdout = child.stdout.take().expect("Failed to get stdout");
            let mut reader = BufReader::new(stdout);
            let mut line = String::new();

            loop {
                // Read line by line from tail output
                match reader.read_line(&mut line).await {
                    Ok(0) => break, // EOF
                    Ok(_) => {
                        if !line.is_empty() {
                            if let Some(handle) = &app_handle {
                                let output = TmuxOutput {
                                    session_id: session_id_clone.clone(),
                                    content: line.clone(),
                                    pane_id: "0".to_string(),
                                    timestamp: Utc::now().to_rfc3339(),
                                };

                                let _ = handle.emit("tmux-output", output);
                            }
                        }
                        line.clear();
                    }
                    Err(e) => {
                        println!("Error reading from tail: {}", e);
                        break;
                    }
                }
            }

            // Clean up
            let _ = child.kill().await;
            let _ = tokio::fs::remove_file(&output_file_clone).await;
            println!("Output monitoring stopped for session {}", session_id_clone);
        });

        Ok(())
    }

    pub async fn send_keys(&self, session_id: &str, keys: &str) -> Result<(), String> {
        // Send keys to the tmux session
        let output = Command::new("tmux")
            .args(&[
                "send-keys",
                "-t", session_id,
                keys
            ])
            .output()
            .await
            .map_err(|e| format!("Failed to send keys: {}", e))?;

        if !output.status.success() {
            return Err(format!("Failed to send keys: {}",
                String::from_utf8_lossy(&output.stderr)));
        }

        Ok(())
    }

    pub async fn capture_pane(&self, session_id: &str) -> Result<String, String> {
        // ALWAYS use capture-pane to get the current terminal state
        // This gives us what's actually displayed, not the accumulated log
        let output = Command::new("tmux")
            .args(&[
                "capture-pane",
                "-t", session_id,
                "-p",  // Print to stdout
                "-e",  // Include escape sequences (we'll clean them in frontend)
                "-S", "-1000",  // Get last 1000 lines of scrollback
                "-E", "-"   // End at last line
            ])
            .output()
            .await
            .map_err(|e| format!("Failed to capture pane: {}", e))?;

        if !output.status.success() {
            return Err(format!("Failed to capture pane: {}",
                String::from_utf8_lossy(&output.stderr)));
        }

        let content = String::from_utf8_lossy(&output.stdout).to_string();

        // For AI context during generation, read from the log file
        // This gives us the FULL history for context
        let log_file = format!("/tmp/tmux-{}.log", session_id);
        if let Ok(log_content) = tokio::fs::read_to_string(&log_file).await {
            // Return both: current display + separator + full log for context
            // Frontend will parse this
            Ok(format!("{}<<<TMUX_SEPARATOR>>>{}", content, log_content))
        } else {
            // No log file, just return the capture
            Ok(content)
        }
    }

    pub async fn kill_session(&self, session_id: &str) -> Result<(), String> {
        // Stop the pipe-pane first
        let _ = Command::new("tmux")
            .args(&["pipe-pane", "-t", session_id])
            .output()
            .await;

        // Clean up the output file
        let output_file = format!("/tmp/tmux-{}.log", session_id);
        let _ = tokio::fs::remove_file(&output_file).await;

        // Kill the tmux session
        let output = Command::new("tmux")
            .args(&[
                "kill-session",
                "-t", session_id
            ])
            .output()
            .await
            .map_err(|e| format!("Failed to kill session: {}", e))?;

        if !output.status.success() {
            // Session might already be gone, which is okay
            let stderr = String::from_utf8_lossy(&output.stderr);
            if !stderr.contains("session not found") {
                return Err(format!("Failed to kill session: {}", stderr));
            }
        }

        // Remove from sessions map
        self.sessions.write().await.remove(session_id);

        Ok(())
    }

    pub async fn list_sessions(&self) -> Vec<TmuxSession> {
        self.sessions.read().await.values().cloned().collect()
    }

    pub async fn session_exists(&self, session_id: &str) -> bool {
        self.sessions.read().await.contains_key(session_id)
    }

    pub async fn send_command(&self, session_id: &str, command: &str) -> Result<(), String> {
        // Send command followed by Enter key
        self.send_keys(session_id, command).await?;
        self.send_keys(session_id, "Enter").await?;
        Ok(())
    }
}