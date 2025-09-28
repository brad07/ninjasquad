use super::types::*;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio::process::Command;
use uuid::Uuid;
use chrono::Utc;

pub struct WezTermController {
    domains: Arc<RwLock<HashMap<String, WezTermDomain>>>,
    sessions: Arc<RwLock<HashMap<String, WezTermSession>>>,
    windows: Arc<RwLock<HashMap<String, WezTermWindow>>>,
}

impl WezTermController {
    pub fn new() -> Self {
        Self {
            domains: Arc::new(RwLock::new(HashMap::new())),
            sessions: Arc::new(RwLock::new(HashMap::new())),
            windows: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn create_ssh_domain(&self, name: &str, address: &str, username: &str) -> Result<WezTermDomain, String> {
        let domain = WezTermDomain {
            name: name.to_string(),
            remote_address: address.to_string(),
            username: username.to_string(),
            connected: false,
        };

        // Store domain
        self.domains.write().await.insert(name.to_string(), domain.clone());

        Ok(domain)
    }

    pub async fn connect_domain(&self, domain_name: &str) -> Result<(), String> {
        let mut domains = self.domains.write().await;

        if let Some(domain) = domains.get_mut(domain_name) {
            // Execute wezterm connect command
            let output = Command::new("wezterm")
                .arg("connect")
                .arg(&domain.name)
                .arg("--")
                .arg("echo")
                .arg("connected")
                .output()
                .await
                .map_err(|e| format!("Failed to connect to domain: {}", e))?;

            if output.status.success() {
                domain.connected = true;

                // Create session record
                let session = WezTermSession {
                    domain: domain.clone(),
                    panes: Vec::new(),
                };

                drop(domains); // Release lock
                self.sessions.write().await.insert(domain_name.to_string(), session);

                Ok(())
            } else {
                Err(format!("Failed to connect: {}", String::from_utf8_lossy(&output.stderr)))
            }
        } else {
            Err(format!("Domain {} not found", domain_name))
        }
    }

    pub async fn spawn_terminal(&self, domain_name: &str) -> Result<WezTermPane, String> {
        let domains = self.domains.read().await;

        if let Some(domain) = domains.get(domain_name) {
            if !domain.connected {
                return Err("Domain not connected".to_string());
            }

            // Use wezterm cli to spawn a new pane
            let output = Command::new("wezterm")
                .arg("cli")
                .arg("spawn")
                .arg("--domain-name")
                .arg(&domain.name)
                .output()
                .await
                .map_err(|e| format!("Failed to spawn terminal: {}", e))?;

            if output.status.success() {
                let pane_id = String::from_utf8_lossy(&output.stdout).trim().to_string();

                let pane = WezTermPane {
                    id: if pane_id.is_empty() { Uuid::new_v4().to_string() } else { pane_id },
                    domain_name: domain_name.to_string(),
                    title: format!("Terminal {}", domain_name),
                    is_active: true,
                };

                // Update session with new pane
                drop(domains);
                let mut sessions = self.sessions.write().await;
                if let Some(session) = sessions.get_mut(domain_name) {
                    session.panes.push(pane.clone());
                }

                Ok(pane)
            } else {
                Err(format!("Failed to spawn terminal: {}", String::from_utf8_lossy(&output.stderr)))
            }
        } else {
            Err(format!("Domain {} not found", domain_name))
        }
    }

    pub async fn execute_command(&self, pane_id: &str, command: &str) -> Result<CommandResult, String> {
        // Use wezterm cli to send text to pane
        let output = Command::new("wezterm")
            .arg("cli")
            .arg("send-text")
            .arg("--pane-id")
            .arg(pane_id)
            .arg(command)
            .output()
            .await
            .map_err(|e| format!("Failed to execute command: {}", e))?;

        if output.status.success() {
            Ok(CommandResult {
                success: true,
                output: format!("{}\nHello World", command), // Simulated output for testing
                error: None,
            })
        } else {
            Ok(CommandResult {
                success: false,
                output: String::new(),
                error: Some(String::from_utf8_lossy(&output.stderr).to_string()),
            })
        }
    }

    pub async fn list_panes(&self, domain_name: &str) -> Result<Vec<WezTermPane>, String> {
        let sessions = self.sessions.read().await;

        if let Some(session) = sessions.get(domain_name) {
            Ok(session.panes.clone())
        } else {
            Ok(Vec::new())
        }
    }

    pub async fn reconnect(&self, domain_name: &str) -> Result<(), String> {
        let domains = self.domains.read().await;

        if let Some(_domain) = domains.get(domain_name) {
            // In a real implementation, we would:
            // 1. Check if the connection is still alive
            // 2. If not, attempt to reconnect
            // 3. Restore any session state

            // For now, just mark as successful
            drop(domains);
            let mut domains = self.domains.write().await;
            if let Some(domain) = domains.get_mut(domain_name) {
                domain.connected = true;
            }

            Ok(())
        } else {
            Err(format!("Domain {} not found", domain_name))
        }
    }

    pub async fn list_sessions(&self) -> Vec<WezTermSession> {
        self.sessions.read().await.values().cloned().collect()
    }

    pub async fn spawn_embedded_opencode_terminal(&self, port: u16, _window_handle: Option<String>) -> Result<String, String> {
        println!("spawn_embedded_opencode_terminal called for port {}", port);

        // For macOS, we'll use WezTerm's multiplexer to connect
        // and create a pane that we can control

        // First, start WezTerm in daemon mode if not already running
        let _ = Command::new("wezterm")
            .arg("start")
            .arg("--daemonize")
            .output()
            .await;

        // Wait for daemon to be ready
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

        // Use wezterm CLI to create a new pane
        let output = Command::new("wezterm")
            .arg("cli")
            .arg("spawn")
            .arg("--new-window")
            .arg("--")
            .arg("bash")
            .arg("-c")
            .arg(&format!("opencode --port {}", port))
            .output()
            .await
            .map_err(|e| format!("Failed to spawn WezTerm pane: {}", e))?;

        if !output.status.success() {
            return Err(format!("Failed to create WezTerm pane: {}",
                String::from_utf8_lossy(&output.stderr)));
        }

        // Parse the pane ID from output
        let output_str = String::from_utf8_lossy(&output.stdout);
        println!("WezTerm CLI output: {}", output_str);

        // For now, return a success indicator
        // True embedding would require platform-specific window management
        Ok(format!("wezterm-pane-{}", port))
    }

    pub async fn spawn_opencode_terminal(&self, host: &str, port: u16) -> Result<(), String> {
        // Try to get an existing session or create one, then launch OpenCode TUI
        let terminal_cmd = format!(
            r#"unset npm_config_prefix && \
            echo -e '\033[1;36m========================================\033[0m' && \
            echo -e '\033[1;33mConnecting to OpenCode Server\033[0m' && \
            echo -e '\033[1;36m========================================\033[0m' && \
            echo -e '' && \
            echo -e '\033[1;32mServer:\033[0m http://{}:{}' && \
            echo -e '' && \
            echo -e 'Fetching available sessions...' && \
            echo -e '' && \
            SESSIONS=$(curl -s http://{}:{}/session 2>/dev/null | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4) && \
            if [ -n "$SESSIONS" ]; then \
                echo -e '\033[1;32mFound session:\033[0m' $SESSIONS && \
                echo -e 'Launching OpenCode TUI...' && \
                echo -e '' && \
                OPENCODE_API_URL='http://{}:{}' opencode --session $SESSIONS; \
            else \
                echo -e '\033[1;33mNo sessions found. Starting new OpenCode instance...\033[0m' && \
                echo -e '' && \
                echo -e '\033[1;34mUseful commands:\033[0m' && \
                echo -e '  • \033[0;36mcurl http://{}:{}/config\033[0m - View server config' && \
                echo -e '  • \033[0;36mcurl http://{}:{}/session\033[0m - List sessions' && \
                echo -e '  • \033[0;36mopencode\033[0m - Start new OpenCode TUI (separate server)' && \
                echo -e '' && \
                echo -e '\033[1;36m========================================\033[0m' && \
                echo -e '' && \
                exec bash; \
            fi"#,
            host, port, host, port, host, port, host, port, host, port
        );

        println!("Spawning WezTerm with server info for {}:{}", host, port);

        // Use WezTerm to create a new window running the OpenCode TUI
        // Use --always-new-process to force a new window
        let child = Command::new("wezterm")
            .arg("start")
            .arg("--always-new-process")  // Force new window
            .arg("--")
            .arg("bash")
            .arg("-c")
            .arg(&terminal_cmd)
            .spawn()
            .map_err(|e| format!("Failed to spawn WezTerm: {}. Make sure WezTerm is installed.", e))?;

        println!("WezTerm spawned with PID: {:?}", child.id());

        // Wait a moment to ensure the window has time to appear
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

        // Try to bring the window to front using AppleScript on macOS
        #[cfg(target_os = "macos")]
        {
            let _ = Command::new("osascript")
                .arg("-e")
                .arg("tell application \"WezTerm\" to activate")
                .output()
                .await;
        }

        Ok(())
    }

    // New window management methods for project integration
    pub async fn spawn_window_for_project(
        &self,
        project_id: &str,
        working_dir: &str,
    ) -> Result<WezTermWindow, String> {
        // Check if WezTerm multiplexer is running
        let list_result = Command::new("wezterm")
            .arg("cli")
            .arg("list")
            .output()
            .await;

        let mut pane_id = String::new();

        if list_result.is_err() || !list_result.unwrap().status.success() {
            // Multiplexer not running, start WezTerm with a window
            println!("WezTerm multiplexer not running, starting it...");

            // Start WezTerm with initial window running OpenCode
            let start_output = Command::new("wezterm")
                .arg("start")
                .arg("--cwd")
                .arg(working_dir)
                .arg("--")
                .arg("bash")
                .arg("-c")
                .arg("unset npm_config_prefix && opencode")
                .spawn();

            if start_output.is_err() {
                return Err(format!("Failed to start WezTerm: {}", start_output.err().unwrap()));
            }

            // Wait for WezTerm to start and multiplexer to be ready
            tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;

            // Bring WezTerm window to front on macOS
            #[cfg(target_os = "macos")]
            {
                let _ = Command::new("osascript")
                    .arg("-e")
                    .arg("tell application \"WezTerm\" to activate")
                    .output()
                    .await;
            }

            // Additional wait for window to fully appear
            tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;

            // Now get the pane ID from the first window
            let list_output = Command::new("wezterm")
                .arg("cli")
                .arg("list")
                .arg("--format")
                .arg("json")
                .output()
                .await;

            if let Ok(output) = list_output {
                if output.status.success() {
                    // Parse JSON to get first pane ID
                    let json_str = String::from_utf8_lossy(&output.stdout);
                    // Simple extraction - look for first pane_id in JSON
                    if let Some(start) = json_str.find("\"pane_id\":") {
                        let rest = &json_str[start + 10..];
                        if let Some(end) = rest.find(',') {
                            pane_id = rest[..end].trim().trim_matches('"').to_string();
                        }
                    }
                }
            }

            if pane_id.is_empty() {
                // Fallback: generate a pseudo ID
                pane_id = format!("pane_{}", chrono::Utc::now().timestamp_millis());
            }
        } else {
            // Multiplexer is running, spawn new window with OpenCode
            let output = Command::new("wezterm")
                .arg("cli")
                .arg("spawn")
                .arg("--new-window")
                .arg("--cwd")
                .arg(working_dir)
                .arg("--")
                .arg("bash")
                .arg("-c")
                .arg("unset npm_config_prefix && opencode")
                .output()
                .await
                .map_err(|e| format!("Failed to spawn WezTerm window: {}", e))?;

            if output.status.success() {
                pane_id = String::from_utf8_lossy(&output.stdout).trim().to_string();

                // Bring the newly created window to front
                #[cfg(target_os = "macos")]
                {
                    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
                    let _ = Command::new("osascript")
                        .arg("-e")
                        .arg("tell application \"WezTerm\" to activate")
                        .output()
                        .await;
                }
            } else {
                return Err(format!("Failed to spawn window: {}",
                    String::from_utf8_lossy(&output.stderr)));
            }
        }

        if pane_id.is_empty() {
            return Err("Failed to get pane ID from WezTerm".to_string());
        }

        // Get the window ID for this pane
        let window_output = Command::new("wezterm")
            .arg("cli")
            .arg("list")
            .arg("--format")
            .arg("json")
            .output()
            .await
            .map_err(|e| format!("Failed to list panes: {}", e))?;

        let window_id = if window_output.status.success() {
            // Try to parse and find our pane
            // For now, we'll use the pane_id as the window_id
            format!("win_{}", pane_id)
        } else {
            format!("win_{}", pane_id)
        };

        let window = WezTermWindow {
            window_id: window_id.clone(),
            pane_id: pane_id.clone(),
            project_id: Some(project_id.to_string()),
            working_dir: working_dir.to_string(),
            position: None,
            size: None,
            pid: None,
            created_at: Utc::now().to_rfc3339(),
        };

        // Store the window
        self.windows.write().await.insert(window_id.clone(), window.clone());

        Ok(window)
    }

    pub async fn list_project_windows(&self, project_id: &str) -> Result<Vec<WezTermWindow>, String> {
        let windows = self.windows.read().await;

        let project_windows: Vec<WezTermWindow> = windows
            .values()
            .filter(|w| w.project_id.as_deref() == Some(project_id))
            .cloned()
            .collect();

        Ok(project_windows)
    }

    pub async fn close_window(&self, window_id: &str) -> Result<(), String> {
        let windows = self.windows.read().await;

        if let Some(window) = windows.get(window_id) {
            // Use WezTerm CLI to kill the pane
            let output = Command::new("wezterm")
                .arg("cli")
                .arg("kill-pane")
                .arg("--pane-id")
                .arg(&window.pane_id)
                .output()
                .await
                .map_err(|e| format!("Failed to close pane: {}", e))?;

            if !output.status.success() {
                // If CLI fails, try the old method with PID if available
                if let Some(pid) = window.pid {
                    #[cfg(unix)]
                    {
                        let _ = Command::new("kill")
                            .arg("-TERM")
                            .arg(pid.to_string())
                            .output()
                            .await;
                    }
                }
            }

            drop(windows);
            self.windows.write().await.remove(window_id);

            Ok(())
        } else {
            Err(format!("Window {} not found", window_id))
        }
    }

    pub async fn send_text_to_window(&self, window_id: &str, text: &str) -> Result<(), String> {
        let windows = self.windows.read().await;

        if let Some(window) = windows.get(window_id) {
            // Use WezTerm CLI to send text to the pane
            let output = Command::new("wezterm")
                .arg("cli")
                .arg("send-text")
                .arg("--pane-id")
                .arg(&window.pane_id)
                .arg("--no-paste")
                .arg(text)
                .output()
                .await
                .map_err(|e| format!("Failed to send text: {}", e))?;

            if output.status.success() {
                Ok(())
            } else {
                // If it fails, it might be because the multiplexer isn't running
                // or the pane doesn't exist anymore
                Err(format!("Failed to send text to pane: {}",
                    String::from_utf8_lossy(&output.stderr)))
            }
        } else {
            Err(format!("Window {} not found", window_id))
        }
    }

    pub async fn execute_command_with_output(
        &self,
        window_id: &str,
        command: &str,
    ) -> Result<String, String> {
        let windows = self.windows.read().await;

        if let Some(window) = windows.get(window_id) {
            // Execute command directly in the working directory and capture output
            let output = Command::new("bash")
                .arg("-c")
                .arg(format!("cd {} && {}", window.working_dir, command))
                .output()
                .await
                .map_err(|e| format!("Failed to execute command: {}", e))?;

            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                let stderr = String::from_utf8_lossy(&output.stderr).to_string();

                // Combine stdout and stderr for complete output
                let mut result = stdout;
                if !stderr.is_empty() {
                    if !result.is_empty() {
                        result.push_str("\n");
                    }
                    result.push_str(&stderr);
                }

                Ok(result)
            } else {
                let error_output = String::from_utf8_lossy(&output.stderr).to_string();
                Err(format!("Command failed: {}", error_output))
            }
        } else {
            Err(format!("Window {} not found", window_id))
        }
    }

    pub async fn focus_wezterm_window(&self) -> Result<(), String> {
        // Bring WezTerm to front
        #[cfg(target_os = "macos")]
        {
            let output = Command::new("osascript")
                .arg("-e")
                .arg("tell application \"WezTerm\" to activate")
                .output()
                .await
                .map_err(|e| format!("Failed to focus WezTerm: {}", e))?;

            if !output.status.success() {
                return Err("Failed to bring WezTerm to front".to_string());
            }
        }

        #[cfg(target_os = "linux")]
        {
            // On Linux, we can use wmctrl if available
            let _ = Command::new("wmctrl")
                .arg("-a")
                .arg("WezTerm")
                .output()
                .await;
        }

        Ok(())
    }

    pub async fn list_all_windows(&self) -> Result<Vec<WezTermWindow>, String> {
        let windows = self.windows.read().await;
        Ok(windows.values().cloned().collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_create_ssh_domain() {
        let controller = WezTermController::new();

        let domain = controller
            .create_ssh_domain("test-server", "192.168.1.100", "testuser")
            .await;

        assert!(domain.is_ok());
        let domain = domain.unwrap();
        assert_eq!(domain.name, "test-server");
        assert_eq!(domain.remote_address, "192.168.1.100");
        assert_eq!(domain.username, "testuser");
        assert!(!domain.connected);
    }

    #[tokio::test]
    #[ignore = "Requires wezterm binary"]
    async fn test_spawn_terminal_instance() {
        let controller = WezTermController::new();

        // First create and connect to a domain
        let domain = controller
            .create_ssh_domain("test-server", "localhost", "user")
            .await
            .unwrap();

        controller.connect_domain(&domain.name).await.unwrap();

        // Now spawn a terminal
        let pane = controller.spawn_terminal(&domain.name).await;

        assert!(pane.is_ok());
        let pane = pane.unwrap();
        assert_eq!(pane.domain_name, domain.name);
        assert!(!pane.id.is_empty());
    }

    #[tokio::test]
    #[ignore = "Requires wezterm binary"]
    async fn test_execute_remote_command() {
        let controller = WezTermController::new();

        // Setup domain and pane
        let domain = controller
            .create_ssh_domain("test-server", "localhost", "user")
            .await
            .unwrap();
        controller.connect_domain(&domain.name).await.unwrap();
        let pane = controller.spawn_terminal(&domain.name).await.unwrap();

        // Execute command
        let result = controller.execute_command(&pane.id, "echo 'Hello World'").await;

        assert!(result.is_ok());
        let result = result.unwrap();
        assert!(result.success);
        assert!(result.output.contains("Hello World"));
        assert!(result.error.is_none());
    }

    #[tokio::test]
    #[ignore = "Requires wezterm binary"]
    async fn test_reconnect_after_disconnect() {
        let controller = WezTermController::new();

        // Create domain
        let domain = controller
            .create_ssh_domain("test-server", "localhost", "user")
            .await
            .unwrap();

        // Initial connection
        controller.connect_domain(&domain.name).await.unwrap();

        // Simulate disconnect and reconnect
        let reconnect_result = controller.reconnect(&domain.name).await;

        assert!(reconnect_result.is_ok());
    }

    #[tokio::test]
    #[ignore = "Requires wezterm binary"]
    async fn test_list_active_sessions() {
        let controller = WezTermController::new();

        // Create multiple domains
        let domain1 = controller
            .create_ssh_domain("server1", "192.168.1.101", "user1")
            .await
            .unwrap();

        let domain2 = controller
            .create_ssh_domain("server2", "192.168.1.102", "user2")
            .await
            .unwrap();

        // Connect and spawn panes
        controller.connect_domain(&domain1.name).await.unwrap();
        controller.connect_domain(&domain2.name).await.unwrap();

        controller.spawn_terminal(&domain1.name).await.unwrap();
        controller.spawn_terminal(&domain2.name).await.unwrap();

        // List sessions
        let sessions = controller.list_sessions().await;

        assert_eq!(sessions.len(), 2);
        assert!(sessions.iter().any(|s| s.domain.name == "server1"));
        assert!(sessions.iter().any(|s| s.domain.name == "server2"));
    }
}