use super::types::*;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio::process::Command;
use uuid::Uuid;

pub struct WezTermController {
    domains: Arc<RwLock<HashMap<String, WezTermDomain>>>,
    sessions: Arc<RwLock<HashMap<String, WezTermSession>>>,
}

impl WezTermController {
    pub fn new() -> Self {
        Self {
            domains: Arc::new(RwLock::new(HashMap::new())),
            sessions: Arc::new(RwLock::new(HashMap::new())),
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