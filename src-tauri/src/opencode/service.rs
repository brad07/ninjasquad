use super::types::*;
use super::api_client::OpenCodeApiClient;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio::process::Command;
use tokio::net::TcpListener;
use uuid::Uuid;

pub struct OpenCodeService {
    servers: Arc<RwLock<HashMap<String, OpenCodeServer>>>,
}

impl OpenCodeService {
    pub fn new() -> Self {
        Self {
            servers: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    async fn is_port_available(port: u16) -> bool {
        match TcpListener::bind(format!("127.0.0.1:{}", port)).await {
            Ok(_) => true,
            Err(_) => false,
        }
    }

    pub async fn spawn_server(&self, port: u16) -> Result<OpenCodeServer, String> {
        // Check if port is available
        if !Self::is_port_available(port).await {
            return Err(format!("Port {} is already in use", port));
        }

        // Generate unique server ID
        let server_id = format!("server-{}", Uuid::new_v4());

        // Spawn OpenCode server process
        let mut child = Command::new("opencode")
            .arg("serve")
            .arg("-p")
            .arg(port.to_string())
            .arg("-h")
            .arg("127.0.0.1")
            .kill_on_drop(true)
            .spawn()
            .map_err(|e| format!("Failed to spawn OpenCode server: {}. Make sure 'opencode' is installed and in PATH", e))?;

        let process_id = child.id();

        // Create server record
        let server = OpenCodeServer {
            id: server_id.clone(),
            host: "127.0.0.1".to_string(),
            port,
            status: ServerStatus::Starting,
            process_id,
        };

        // Store server
        self.servers.write().await.insert(server_id.clone(), server.clone());

        // Wait a bit for server to start
        tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;

        // Check if server is running with retries
        let client = OpenCodeApiClient::new(&server.host, server.port);
        let mut retries = 3;
        let mut last_error = String::new();

        while retries > 0 {
            match client.health().await {
                Ok(true) => {
                    // Update status to running
                    let mut servers = self.servers.write().await;
                    if let Some(s) = servers.get_mut(&server_id) {
                        s.status = ServerStatus::Running;
                    }
                    return Ok(servers.get(&server_id).unwrap().clone());
                }
                Err(e) => {
                    last_error = e;
                    retries -= 1;
                    if retries > 0 {
                        tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
                    }
                }
                _ => {
                    last_error = "Unknown error".to_string();
                    retries -= 1;
                    if retries > 0 {
                        tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
                    }
                }
            }
        }

        // Server failed to start
        let mut servers = self.servers.write().await;
        if let Some(s) = servers.get_mut(&server_id) {
            s.status = ServerStatus::Error(format!("Failed to start: {}", last_error));
            // Try to kill the process
            if let Some(pid) = s.process_id {
                let _ = Command::new("kill")
                    .arg(pid.to_string())
                    .output()
                    .await;
            }
        }
        Err(format!("Server failed to start on port {}: {}", port, last_error))
    }

    pub async fn stop_server(&self, server_id: &str) -> Result<(), String> {
        let mut servers = self.servers.write().await;

        if let Some(server) = servers.get_mut(server_id) {
            // Kill the process if it exists
            if let Some(pid) = server.process_id {
                // Try to kill the process
                let _ = Command::new("kill")
                    .arg(pid.to_string())
                    .output()
                    .await;
            }

            server.status = ServerStatus::Stopped;
            server.process_id = None;
            Ok(())
        } else {
            Err(format!("Server {} not found", server_id))
        }
    }

    pub async fn health_check(&self, server_id: &str) -> Result<bool, String> {
        let servers = self.servers.read().await;

        if let Some(server) = servers.get(server_id) {
            let client = OpenCodeApiClient::new(&server.host, server.port);
            match client.health().await {
                Ok(healthy) => {
                    // Update server status based on health
                    drop(servers); // Release read lock
                    let mut servers = self.servers.write().await;
                    if let Some(s) = servers.get_mut(server_id) {
                        if healthy {
                            s.status = ServerStatus::Running;
                        } else {
                            s.status = ServerStatus::Error("Health check failed".to_string());
                        }
                    }
                    Ok(healthy)
                }
                Err(e) => {
                    // Server is not responding
                    drop(servers); // Release read lock
                    let mut servers = self.servers.write().await;
                    if let Some(s) = servers.get_mut(server_id) {
                        s.status = ServerStatus::Error(e.clone());
                    }
                    Err(e)
                }
            }
        } else {
            Err(format!("Server {} not found", server_id))
        }
    }

    pub async fn list_servers(&self) -> Vec<OpenCodeServer> {
        self.servers.read().await.values().cloned().collect()
    }

    pub async fn get_server(&self, server_id: &str) -> Option<OpenCodeServer> {
        self.servers.read().await.get(server_id).cloned()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    #[ignore = "Requires opencode binary"]
    async fn test_spawn_server_with_custom_port() {
        let service = OpenCodeService::new();
        let port = 4096;

        let result = service.spawn_server(port).await;

        assert!(result.is_ok());
        let server = result.unwrap();
        assert_eq!(server.port, port);
        assert_eq!(server.status, ServerStatus::Running);
        assert!(server.process_id.is_some());
    }

    #[tokio::test]
    #[ignore = "Requires opencode binary"]
    async fn test_health_check_endpoint() {
        let service = OpenCodeService::new();
        let server = service.spawn_server(4097).await.unwrap();

        let health = service.health_check(&server.id).await;

        assert!(health.is_ok());
        assert!(health.unwrap());
    }

    #[tokio::test]
    #[ignore = "Requires opencode binary"]
    async fn test_stop_server() {
        let service = OpenCodeService::new();
        let server = service.spawn_server(4098).await.unwrap();

        let result = service.stop_server(&server.id).await;

        assert!(result.is_ok());

        let stopped_server = service.get_server(&server.id).await;
        assert!(stopped_server.is_some());
        assert_eq!(stopped_server.unwrap().status, ServerStatus::Stopped);
    }

    #[tokio::test]
    #[ignore = "Requires opencode binary"]
    async fn test_list_servers() {
        let service = OpenCodeService::new();

        let server1 = service.spawn_server(4099).await.unwrap();
        let server2 = service.spawn_server(4100).await.unwrap();

        let servers = service.list_servers().await;

        assert_eq!(servers.len(), 2);
        assert!(servers.iter().any(|s| s.id == server1.id));
        assert!(servers.iter().any(|s| s.id == server2.id));
    }

    #[tokio::test]
    #[ignore = "Requires opencode binary"]
    async fn test_handle_server_crash() {
        let service = OpenCodeService::new();
        let server = service.spawn_server(4101).await.unwrap();

        // Simulate server crash by killing the process
        // This would be implemented in the actual service

        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

        let health = service.health_check(&server.id).await;

        // Should detect the server is not healthy
        assert!(health.is_err() || !health.unwrap());

        // Server status should be updated
        let crashed_server = service.get_server(&server.id).await;
        assert!(crashed_server.is_some());
        assert!(matches!(crashed_server.unwrap().status, ServerStatus::Error(_)));
    }
}