use super::types::*;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio::process::Command;
use uuid::Uuid;
use chrono::Utc;
use std::fs;
use std::path::PathBuf;

pub struct ClaudeProcess {
    pub session: ClaudeSession,
    pub session_file: Option<PathBuf>,  // Store session file path for --resume
}

pub struct ClaudeProcessManager {
    processes: Arc<RwLock<HashMap<String, ClaudeProcess>>>,
}

impl ClaudeProcessManager {
    pub fn new() -> Self {
        Self {
            processes: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn create_session(
        &self,
        project_id: String,
        working_directory: Option<String>,
        model: Option<String>,
    ) -> Result<String, String> {
        let session_id = format!("claude-session-{}", Uuid::new_v4());

        println!("[ClaudeManager] Creating new session: {}", session_id);
        println!("[ClaudeManager] Working directory: {:?}", working_directory);
        println!("[ClaudeManager] Model: {:?}", model);

        // Create session info
        let session = ClaudeSession {
            id: session_id.clone(),
            project_id,
            working_directory,
            model,
            process_id: None,  // We don't maintain a persistent process anymore
            created_at: Utc::now().to_rfc3339(),
            last_used: Utc::now().to_rfc3339(),
        };

        // Create a session file for --resume functionality
        let session_dir = dirs::cache_dir()
            .unwrap_or_else(|| PathBuf::from("/tmp"))
            .join("ninja-squad-claude-sessions");

        fs::create_dir_all(&session_dir)
            .map_err(|e| format!("Failed to create session directory: {}", e))?;

        let session_file = session_dir.join(format!("{}.session", session_id));

        // Store the process info
        let process = ClaudeProcess {
            session: session.clone(),
            session_file: Some(session_file),
        };

        self.processes.write().await.insert(session_id.clone(), process);

        println!("[ClaudeManager] Session created successfully: {}", session_id);
        Ok(session_id)
    }

    pub async fn send_message(
        &self,
        session_id: &str,
        message: String,
    ) -> Result<String, String> {
        println!("[ClaudeManager] Sending message to session: {}", session_id);

        let processes = self.processes.read().await;
        let process = processes.get(session_id)
            .ok_or_else(|| format!("Session {} not found", session_id))?;

        // Build the Claude command with --print for one-shot response
        let mut cmd = Command::new("claude");
        cmd.arg("--print");

        // Don't use --continue or --resume for now as they may cause issues
        // Each message is independent

        // Set working directory if specified
        if let Some(dir) = &process.session.working_directory {
            println!("[ClaudeManager] Setting working directory: {}", dir);
            // Set the actual working directory of the process
            cmd.current_dir(dir.clone());
            // Also add the directory for tool access
            cmd.arg("--add-dir").arg(dir);
        } else {
            println!("[ClaudeManager] WARNING: No working directory set for session!");
        }

        // Set model if specified
        if let Some(model_name) = &process.session.model {
            println!("[ClaudeManager] Using model: {}", model_name);
            cmd.arg("--model").arg(model_name);
        }

        // Set up pipes
        cmd.stdin(std::process::Stdio::piped())
           .stdout(std::process::Stdio::piped())
           .stderr(std::process::Stdio::piped());

        println!("[ClaudeManager] Executing Claude command with --print and session context");

        // Spawn the process
        let mut child = cmd.spawn()
            .map_err(|e| format!("Failed to spawn Claude process: {}", e))?;

        // Write the message to stdin
        if let Some(mut stdin) = child.stdin.take() {
            use tokio::io::AsyncWriteExt;
            stdin.write_all(message.as_bytes()).await
                .map_err(|e| format!("Failed to write prompt: {}", e))?;
            stdin.flush().await
                .map_err(|e| format!("Failed to flush stdin: {}", e))?;
            drop(stdin);  // Close stdin
        }

        // Wait for the process with timeout
        let output = tokio::time::timeout(
            tokio::time::Duration::from_secs(60),
            child.wait_with_output()
        ).await
            .map_err(|_| "Claude command timed out after 60 seconds".to_string())?
            .map_err(|e| format!("Failed to read Claude output: {}", e))?;

        if !output.status.success() {
            let error = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Claude error: {}", error));
        }

        let response = String::from_utf8(output.stdout)
            .map_err(|e| format!("Failed to parse output: {}", e))?;

        if response.is_empty() {
            return Err("No response received from Claude".to_string());
        }

        // Update session file if we have one
        if let Some(session_file) = &process.session_file {
            // The session is automatically saved by Claude when using --resume
            println!("[ClaudeManager] Session saved to: {:?}", session_file);
        }

        println!("[ClaudeManager] Received response: {} chars", response.len());
        Ok(response)
    }

    pub async fn close_session(&self, session_id: &str) -> Result<(), String> {
        println!("[ClaudeManager] Closing session: {}", session_id);

        let mut processes = self.processes.write().await;

        if let Some(process) = processes.remove(session_id) {
            // Clean up session file if it exists
            if let Some(session_file) = &process.session_file {
                if session_file.exists() {
                    let _ = fs::remove_file(session_file);
                    println!("[ClaudeManager] Removed session file: {:?}", session_file);
                }
            }
            println!("[ClaudeManager] Session {} closed", session_id);
            Ok(())
        } else {
            Err(format!("Session {} not found", session_id))
        }
    }

    pub async fn list_sessions(&self) -> Vec<ClaudeSession> {
        let processes = self.processes.read().await;
        processes.values()
            .map(|p| p.session.clone())
            .collect()
    }

    pub async fn get_session(&self, session_id: &str) -> Option<ClaudeSession> {
        let processes = self.processes.read().await;
        processes.get(session_id)
            .map(|p| p.session.clone())
    }

    pub async fn cleanup_inactive_sessions(&self) {
        println!("[ClaudeManager] Cleaning up inactive sessions");

        let mut processes = self.processes.write().await;
        let mut to_remove = Vec::new();

        // Check for old sessions (e.g., older than 24 hours)
        let now = Utc::now();
        for (id, process) in processes.iter() {
            if let Ok(last_used) = chrono::DateTime::parse_from_rfc3339(&process.session.last_used) {
                let age = now.signed_duration_since(last_used);
                if age.num_hours() > 24 {
                    println!("[ClaudeManager] Session {} is older than 24 hours", id);
                    to_remove.push(id.clone());
                }
            }
        }

        for id in to_remove {
            if let Some(process) = processes.remove(&id) {
                // Clean up session file if it exists
                if let Some(session_file) = &process.session_file {
                    if session_file.exists() {
                        let _ = fs::remove_file(session_file);
                    }
                }
            }
        }
    }
}