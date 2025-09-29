use super::types::*;
use super::api_client::OpenCodeApiClient;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio::process::{Command, Child};
use tokio::net::TcpListener;
use uuid::Uuid;

pub struct OpenCodeService {
    servers: Arc<RwLock<HashMap<String, OpenCodeServer>>>,
    processes: Arc<RwLock<HashMap<String, Child>>>,
    distributed_mode: Arc<RwLock<bool>>,
    queue_client: Option<Arc<dyn crate::queue::client::QueueClient>>,
}

impl OpenCodeService {
    pub fn new() -> Self {
        Self {
            servers: Arc::new(RwLock::new(HashMap::new())),
            processes: Arc::new(RwLock::new(HashMap::new())),
            distributed_mode: Arc::new(RwLock::new(false)),
            queue_client: None,
        }
    }

    pub fn with_queue_client(mut self, client: Arc<dyn crate::queue::client::QueueClient>) -> Self {
        self.queue_client = Some(client);
        self
    }

    pub async fn enable_distributed_mode(&self, enable: bool) {
        let mut mode = self.distributed_mode.write().await;
        *mode = enable;
    }

    pub async fn is_distributed_mode(&self) -> bool {
        *self.distributed_mode.read().await
    }

    async fn is_port_available(port: u16) -> bool {
        match TcpListener::bind(format!("127.0.0.1:{}", port)).await {
            Ok(_) => true,
            Err(_) => false,
        }
    }

    async fn cleanup_port(port: u16) -> Result<(), String> {
        // Kill any process using the port
        println!("Cleaning up port {}", port);

        // Use lsof to find process using the port
        let output = Command::new("lsof")
            .args(&["-ti", &format!(":{}", port)])
            .output()
            .await
            .map_err(|e| format!("Failed to run lsof: {}", e))?;

        if output.status.success() && !output.stdout.is_empty() {
            let pids = String::from_utf8_lossy(&output.stdout);
            for pid in pids.lines() {
                if !pid.trim().is_empty() {
                    println!("Killing process {} using port {}", pid.trim(), port);
                    let _ = Command::new("kill")
                        .arg("-9")
                        .arg(pid.trim())
                        .output()
                        .await;
                }
            }
            // Wait a bit for processes to die
            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
        }

        Ok(())
    }

    pub async fn spawn_server(&self, port: u16, working_dir: Option<String>) -> Result<OpenCodeServer, String> {
        // Check if port is available
        if !Self::is_port_available(port).await {
            // Try to clean up the port first
            println!("Port {} is in use, attempting cleanup", port);
            if let Err(e) = Self::cleanup_port(port).await {
                println!("Warning: Failed to cleanup port: {}", e);
            }

            // Check again after cleanup
            if !Self::is_port_available(port).await {
                return Err(format!("Port {} is already in use and could not be cleaned up", port));
            }
        }

        // Generate unique server ID
        let server_id = format!("server-{}", Uuid::new_v4());

        // Use provided directory or fall back to home directory
        let working_dir = if let Some(dir) = working_dir {
            std::path::PathBuf::from(dir)
        } else {
            dirs::home_dir()
                .ok_or_else(|| "Could not determine home directory".to_string())?
        };

        // Spawn OpenCode server process
        let child = Command::new("opencode")
            .arg("serve")
            .arg("-p")
            .arg(port.to_string())
            .arg("-h")
            .arg("localhost")
            .current_dir(&working_dir)
            .kill_on_drop(true)
            .spawn()
            .map_err(|e| format!("Failed to spawn OpenCode server: {}. Make sure 'opencode' is installed and in PATH", e))?;

        let process_id = child.id();

        // Create server record
        let server = OpenCodeServer {
            id: server_id.clone(),
            host: "localhost".to_string(),
            port,
            status: ServerStatus::Starting,
            process_id,
            working_dir: Some(working_dir.to_string_lossy().to_string()),
        };

        // Store server and process
        self.servers.write().await.insert(server_id.clone(), server.clone());
        self.processes.write().await.insert(server_id.clone(), child);

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

    pub async fn spawn_tui_server(&self, port: u16, model: Option<String>, working_dir: Option<String>) -> Result<OpenCodeServer, String> {
        // Check if port is available
        if !Self::is_port_available(port).await {
            // Try to clean up the port first
            println!("Port {} is in use, attempting cleanup", port);
            if let Err(e) = Self::cleanup_port(port).await {
                println!("Warning: Failed to cleanup port: {}", e);
            }

            // Check again after cleanup
            if !Self::is_port_available(port).await {
                return Err(format!("Port {} is already in use and could not be cleaned up", port));
            }
        }

        // Generate unique server ID
        let server_id = format!("tui-server-{}", Uuid::new_v4());

        // Get the path to the TUI script
        let script_path = std::env::current_dir()
            .map_err(|e| e.to_string())?
            .join("scripts")
            .join("opencode-tui.js");

        println!("TUI server script path: {:?}", script_path);

        // Check if script exists
        if !script_path.exists() {
            return Err(format!("TUI server script not found at: {:?}", script_path));
        }

        // Use provided directory or fall back to home directory
        let working_dir = if let Some(dir) = working_dir {
            std::path::PathBuf::from(dir)
        } else {
            dirs::home_dir()
                .ok_or_else(|| "Could not determine home directory".to_string())?
        };

        // Spawn Node.js process to run the TUI with server
        let model_arg = model.unwrap_or_else(|| "claude-sonnet-4-0".to_string());
        println!("Starting OpenCode TUI with server: node {:?} {} {} in directory {:?}", script_path, port, model_arg, working_dir);

        let mut child = Command::new("node")
            .arg(&script_path)
            .arg(port.to_string())
            .arg(&model_arg)
            .current_dir(&working_dir)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .kill_on_drop(true)
            .spawn()
            .map_err(|e| format!("Failed to spawn TUI server: {}. Make sure Node.js is installed", e))?;

        let process_id = child.id();
        println!("TUI server process started with PID: {:?}", process_id);

        // Try to read initial output to see if server starts correctly
        use tokio::io::{AsyncBufReadExt, BufReader};
        if let Some(stdout) = child.stdout.take() {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();

            // Read a few initial lines to see startup messages
            tokio::spawn(async move {
                while let Ok(Some(line)) = lines.next_line().await {
                    println!("TUI server stdout: {}", line);
                }
            });
        }

        // Store process handle
        self.processes.write().await.insert(server_id.clone(), child);

        // Create server info
        let server = OpenCodeServer {
            id: server_id.clone(),
            host: "localhost".to_string(),
            port,
            status: ServerStatus::Starting,
            process_id,
            working_dir: Some(working_dir.to_string_lossy().to_string()),
        };

        // Store server info
        self.servers.write().await.insert(server_id.clone(), server.clone());

        // Wait for server to be ready (with timeout)
        let start_time = std::time::Instant::now();
        let timeout = std::time::Duration::from_secs(10);
        let mut last_error = String::new();

        while start_time.elapsed() < timeout {
            let client = OpenCodeApiClient::new("localhost", port);
            match client.health().await {
                Ok(true) => {
                    // Server is ready
                    let mut servers = self.servers.write().await;
                    if let Some(s) = servers.get_mut(&server_id) {
                        s.status = ServerStatus::Running;
                    }
                    return Ok(servers.get(&server_id).unwrap().clone());
                }
                Ok(false) => last_error = "Health check returned false".to_string(),
                Err(e) => last_error = e,
            }
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
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
        Err(format!("TUI server failed to start on port {}: {}", port, last_error))
    }

    pub async fn spawn_sdk_server(&self, port: u16, model: Option<String>, working_dir: Option<String>) -> Result<OpenCodeServer, String> {
        // Check if port is available
        if !Self::is_port_available(port).await {
            // Try to clean up the port first
            println!("Port {} is in use, attempting cleanup", port);
            if let Err(e) = Self::cleanup_port(port).await {
                println!("Warning: Failed to cleanup port: {}", e);
            }

            // Check again after cleanup
            if !Self::is_port_available(port).await {
                return Err(format!("Port {} is already in use and could not be cleaned up", port));
            }
        }

        // Generate unique server ID
        let server_id = format!("sdk-server-{}", Uuid::new_v4());

        // Get the path to the SDK script
        let script_path = std::env::current_dir()
            .map_err(|e| e.to_string())?
            .join("scripts")
            .join("sdk-server.js");

        println!("SDK server script path: {:?}", script_path);

        // Check if script exists
        if !script_path.exists() {
            return Err(format!("SDK server script not found at: {:?}", script_path));
        }

        // Use provided directory or fall back to home directory
        let working_dir = if let Some(dir) = working_dir {
            std::path::PathBuf::from(dir)
        } else {
            dirs::home_dir()
                .ok_or_else(|| "Could not determine home directory".to_string())?
        };

        // Spawn Node.js process to run the SDK server
        let model_arg = model.unwrap_or_else(|| "claude-sonnet-4-0".to_string());
        println!("Starting SDK server with: node {:?} {} {} in directory {:?}", script_path, port, model_arg, working_dir);

        let mut child = Command::new("node")
            .arg(&script_path)
            .arg(port.to_string())
            .arg(&model_arg)
            .current_dir(&working_dir)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .kill_on_drop(true)
            .spawn()
            .map_err(|e| format!("Failed to spawn SDK server: {}. Make sure Node.js is installed", e))?;

        let process_id = child.id();
        println!("SDK server process started with PID: {:?}", process_id);

        // Try to read initial output to see if server starts correctly
        use tokio::io::{AsyncBufReadExt, BufReader};
        if let Some(stdout) = child.stdout.take() {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();

            // Read a few initial lines to see startup messages
            tokio::spawn(async move {
                while let Ok(Some(line)) = lines.next_line().await {
                    println!("SDK server stdout: {}", line);
                }
            });
        }

        // Store process handle
        self.processes.write().await.insert(server_id.clone(), child);

        // Create server info
        let server = OpenCodeServer {
            id: server_id.clone(),
            host: "localhost".to_string(),
            port,
            status: ServerStatus::Starting,
            process_id,
            working_dir: Some(working_dir.to_string_lossy().to_string()),
        };

        // Store server info
        self.servers.write().await.insert(server_id.clone(), server.clone());

        // Wait for server to be ready (with timeout)
        let start_time = std::time::Instant::now();
        let timeout = std::time::Duration::from_secs(10);
        let mut last_error = String::new();

        while start_time.elapsed() < timeout {
            let client = OpenCodeApiClient::new("localhost", port);
            match client.health().await {
                Ok(true) => {
                    // Server is ready
                    let mut servers = self.servers.write().await;
                    if let Some(s) = servers.get_mut(&server_id) {
                        s.status = ServerStatus::Running;
                    }
                    return Ok(servers.get(&server_id).unwrap().clone());
                }
                Ok(false) => last_error = "Health check returned false".to_string(),
                Err(e) => last_error = e,
            }
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
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
        Err(format!("SDK server failed to start on port {}: {}", port, last_error))
    }

    pub async fn stop_server(&self, server_id: &str) -> Result<(), String> {
        // Remove and kill the process
        if let Some(mut child) = self.processes.write().await.remove(server_id) {
            let _ = child.kill().await;
        }

        let mut servers = self.servers.write().await;

        if let Some(server) = servers.get_mut(server_id) {
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

    pub async fn scan_for_servers(&self, start_port: u16, end_port: u16) -> Result<Vec<OpenCodeServer>, String> {
        println!("Scanning for OpenCode servers on ports {}-{}", start_port, end_port);
        let mut discovered_servers = Vec::new();

        for port in start_port..=end_port {
            // Check if port is open by trying to connect
            let client = OpenCodeApiClient::new("localhost", port);

            // Try to check health with a very short timeout
            match tokio::time::timeout(
                tokio::time::Duration::from_millis(100),
                client.health()
            ).await {
                Ok(Ok(true)) => {
                    println!("Found OpenCode server on port {}", port);

                    // Create a server entry for discovered server
                    let server_id = format!("discovered-{}-{}", port, Uuid::new_v4());
                    let server = OpenCodeServer {
                        id: server_id.clone(),
                        host: "localhost".to_string(),
                        port,
                        status: ServerStatus::Running,
                        process_id: None, // We don't know the PID of external servers
                        working_dir: None, // Unknown for discovered servers
                    };

                    // Check if we already track this server
                    let servers = self.servers.read().await;
                    let already_tracked = servers.values().any(|s| s.port == port);
                    drop(servers);

                    if !already_tracked {
                        // Add to our tracking
                        self.servers.write().await.insert(server_id, server.clone());
                        discovered_servers.push(server);
                    }
                }
                _ => {
                    // Port doesn't have an OpenCode server or timed out
                }
            }
        }

        println!("Scan complete. Found {} new servers", discovered_servers.len());
        Ok(discovered_servers)
    }

    pub async fn kill_all_servers(&self) -> Result<usize, String> {
        use std::process::Command;

        println!("Killing all servers: starting cleanup");

        // First, try to gracefully kill all tracked processes
        let mut processes = self.processes.write().await;
        let process_count = processes.len();
        println!("Found {} tracked processes to kill", process_count);

        for (id, mut child) in processes.drain() {
            println!("Killing tracked process: {}", id);
            let _ = child.kill().await;
        }

        // Kill all OpenCode serve processes using pkill
        println!("Running pkill for 'opencode serve'");
        let result1 = Command::new("pkill")
            .args(&["-f", "opencode serve"])
            .output();
        match result1 {
            Ok(output) => println!("pkill opencode serve: exit code {:?}", output.status.code()),
            Err(e) => println!("pkill opencode serve failed: {}", e),
        }

        // Kill all SDK server processes (Node.js processes running sdk-server.js)
        println!("Running pkill for 'sdk-server.js'");
        let result2 = Command::new("pkill")
            .args(&["-f", "sdk-server.js"])
            .output();
        match result2 {
            Ok(output) => println!("pkill sdk-server.js: exit code {:?}", output.status.code()),
            Err(e) => println!("pkill sdk-server.js failed: {}", e),
        }

        // Also kill any orphaned opencode processes
        println!("Running pkill for 'opencode'");
        let result3 = Command::new("pkill")
            .args(&["-f", "opencode"])
            .output();
        match result3 {
            Ok(output) => println!("pkill opencode: exit code {:?}", output.status.code()),
            Err(e) => println!("pkill opencode failed: {}", e),
        }

        // Clear the servers map
        let servers_count = self.servers.read().await.len();
        self.servers.write().await.clear();

        println!("Kill all servers complete. Cleared {} servers from tracking", servers_count);
        Ok(servers_count)
    }

    pub async fn kill_tracked_servers_only(&self) -> Result<usize, String> {
        println!("Killing only Ninja Squad tracked servers");

        // Get list of PIDs we're tracking
        let servers = self.servers.read().await;
        let tracked_pids: Vec<u32> = servers
            .values()
            .filter_map(|s| s.process_id)
            .collect();
        drop(servers);

        println!("Found {} PIDs to kill: {:?}", tracked_pids.len(), tracked_pids);

        // Kill each tracked process by PID
        for pid in &tracked_pids {
            println!("Killing PID {}", pid);
            let _ = tokio::process::Command::new("kill")
                .arg("-9")
                .arg(pid.to_string())
                .output()
                .await;
        }

        // Also kill via our process handles
        let mut processes = self.processes.write().await;
        let process_count = processes.len();
        println!("Killing {} tracked process handles", process_count);

        for (id, mut child) in processes.drain() {
            println!("Killing tracked process handle: {}", id);
            let _ = child.kill().await;
        }

        // Clear only the servers we spawned from tracking
        let mut servers = self.servers.write().await;
        let before_count = servers.len();
        servers.retain(|_, s| s.process_id.is_none());
        let removed = before_count - servers.len();

        println!("Killed {} Ninja Squad servers", removed);
        Ok(removed)
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