use std::process::{Child, Command};
use std::sync::Arc;
use tokio::sync::Mutex;
use serde::{Deserialize, Serialize};
use anyhow::Result;

#[derive(Debug, Clone)]
pub struct SlackService {
    process: Arc<Mutex<Option<Child>>>,
    port: u16,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SlackConfig {
    pub bot_token: String,
    pub signing_secret: String,
    pub app_token: String,
    pub channel: String,
    pub enabled: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SlackApprovalRequest {
    pub recommendation: serde_json::Value,
    pub session_id: String,
    pub server_id: String,
    pub project_name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SlackMessage {
    pub text: String,
    pub blocks: Option<Vec<serde_json::Value>>,
}

impl SlackService {
    pub fn new(port: u16) -> Self {
        Self {
            process: Arc::new(Mutex::new(None)),
            port,
        }
    }

    pub async fn start(&self, _app_handle: &tauri::AppHandle) -> Result<()> {
        let mut process_guard = self.process.lock().await;

        // Kill existing process if any
        if let Some(mut child) = process_guard.take() {
            let _ = child.kill();
        }

        // Port cleanup: kill any existing process using this port
        let port = self.port;
        tokio::spawn(async move {
            let _ = tokio::process::Command::new("sh")
                .arg("-c")
                .arg(format!("lsof -ti:{} | xargs kill -9 2>/dev/null || true", port))
                .output()
                .await;
            println!("[Slack] Port cleanup completed for {}", port);
        });
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

        // Get the path to the slack-service.ts script
        // Working directory is typically src-tauri, so use relative path from there
        let resource_path = std::path::PathBuf::from("scripts/slack-service.ts");

        // Check if the script exists
        if !resource_path.exists() {
            return Err(anyhow::anyhow!(
                "Slack service script not found at {:?}. Current dir: {:?}",
                resource_path.canonicalize().unwrap_or_else(|_| resource_path.clone()),
                std::env::current_dir().unwrap_or_default()
            ));
        }

        // Start the Node.js Slack service using tsx (TypeScript runner)
        // Use inherit for stdio so we can see output in the terminal
        let mut cmd = Command::new("npx");
        cmd.arg("tsx")
            .arg(&resource_path)
            .env("SLACK_SERVICE_PORT", self.port.to_string())
            .stdout(std::process::Stdio::inherit())
            .stderr(std::process::Stdio::inherit());

        let mut child = cmd.spawn()
            .map_err(|e| anyhow::anyhow!("Failed to spawn Slack service: {} (script path: {:?})", e, resource_path))?;

        println!("[Slack] Service process spawned with PID: {:?}", child.id());

        // Check if process started successfully
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
        match child.try_wait() {
            Ok(Some(status)) => {
                println!("[Slack] Service failed to start. Exit status: {:?}", status);
                return Err(anyhow::anyhow!("Slack service exited immediately with status {:?}", status));
            }
            Ok(None) => {
                println!("[Slack] Service process is running after startup check");
            }
            Err(e) => {
                println!("[Slack] Error checking process: {}", e);
            }
        }

        *process_guard = Some(child);

        println!("[Slack] Slack service started on port {}", self.port);

        // Wait longer for TypeScript service to fully start (tsx needs time to compile)
        println!("[Slack] Waiting for service to initialize...");
        tokio::time::sleep(tokio::time::Duration::from_millis(3000)).await;

        // Final check that process is still running
        let mut final_guard = self.process.lock().await;
        if let Some(ref mut child) = *final_guard {
            match child.try_wait() {
                Ok(Some(status)) => {
                    println!("[Slack] WARNING: Service exited during startup with status: {:?}", status);
                    *final_guard = None;
                    return Err(anyhow::anyhow!("Slack service crashed during startup with status {:?}", status));
                }
                Ok(None) => {
                    println!("[Slack] Process check: Service is still running");
                }
                Err(e) => {
                    println!("[Slack] Error in final check: {}", e);
                }
            }
        }
        drop(final_guard);

        // Try to verify the HTTP server is responding
        let url = format!("http://localhost:{}/status", self.port);
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_millis(2000))
            .build()
            .unwrap();

        println!("[Slack] Attempting to verify service at {}", url);
        match client.get(&url).send().await {
            Ok(response) => {
                println!("[Slack] ✓ Service is responding! Status code: {}", response.status());
            }
            Err(e) => {
                println!("[Slack] ⚠ Service process is running but HTTP server not responding yet: {}", e);
                println!("[Slack] This may be normal - the service might need more time to start");
            }
        }

        Ok(())
    }

    pub async fn stop(&self) -> Result<()> {
        let mut process_guard = self.process.lock().await;

        if let Some(mut child) = process_guard.take() {
            child.kill()
                .map_err(|e| anyhow::anyhow!("Failed to kill Slack service: {}", e))?;
        }

        Ok(())
    }

    pub async fn initialize(&self, config: SlackConfig) -> Result<()> {
        let url = format!("http://localhost:{}/initialize", self.port);
        let client = reqwest::Client::new();

        let response = client
            .post(&url)
            .json(&config)
            .send()
            .await
            .map_err(|e| anyhow::anyhow!("Failed to initialize Slack: {}", e))?;

        if !response.status().is_success() {
            let error = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            return Err(anyhow::anyhow!("Slack initialization failed: {}", error));
        }

        Ok(())
    }

    pub async fn send_approval_request(&self, request: SlackApprovalRequest) -> Result<()> {
        let url = format!("http://localhost:{}/send-approval", self.port);
        let client = reqwest::Client::new();

        let response = client
            .post(&url)
            .json(&request)
            .send()
            .await
            .map_err(|e| anyhow::anyhow!("Failed to send approval request: {}", e))?;

        if !response.status().is_success() {
            let error = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            return Err(anyhow::anyhow!("Failed to send approval: {}", error));
        }

        Ok(())
    }

    pub async fn send_message(&self, message: SlackMessage) -> Result<()> {
        let url = format!("http://localhost:{}/send-message", self.port);
        let client = reqwest::Client::new();

        let response = client
            .post(&url)
            .json(&message)
            .send()
            .await
            .map_err(|e| anyhow::anyhow!("Failed to send message: {}", e))?;

        if !response.status().is_success() {
            let error = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            return Err(anyhow::anyhow!("Failed to send message: {}", error));
        }

        Ok(())
    }

    pub async fn shutdown(&self) -> Result<()> {
        let url = format!("http://localhost:{}/shutdown", self.port);
        let client = reqwest::Client::new();

        let _ = client
            .post(&url)
            .send()
            .await;

        self.stop().await?;
        Ok(())
    }

    pub async fn get_approvals(&self, since: u64) -> Result<serde_json::Value> {
        let url = format!("http://localhost:{}/approvals?since={}", self.port, since);
        let client = reqwest::Client::new();

        let response = client
            .get(&url)
            .send()
            .await
            .map_err(|e| anyhow::anyhow!("Failed to get approvals: {}", e))?;

        let approvals = response
            .json()
            .await
            .map_err(|e| anyhow::anyhow!("Failed to parse approvals: {}", e))?;

        Ok(approvals)
    }

    pub async fn is_process_running(&self) -> bool {
        let mut process_guard = self.process.lock().await;

        if let Some(child) = process_guard.as_mut() {
            // Try to check if the process is still alive
            match child.try_wait() {
                Ok(Some(status)) => {
                    // Process has exited
                    println!("[Slack] Process has exited with status: {:?}", status);
                    *process_guard = None;
                    false
                }
                Ok(None) => {
                    // Process is still running
                    true
                }
                Err(e) => {
                    println!("[Slack] Error checking process status: {}", e);
                    // Assume not running if we can't check
                    *process_guard = None;
                    false
                }
            }
        } else {
            false
        }
    }

    pub async fn status(&self) -> Result<serde_json::Value> {
        println!("[Slack Health Check] Starting status check...");

        // First check if process is running
        let process_running = self.is_process_running().await;
        println!("[Slack Health Check] Process in memory: {}", process_running);

        if !process_running {
            println!("[Slack Health Check] No process found, returning offline status");
            return Ok(serde_json::json!({
                "initialized": false,
                "service_running": false,
                "port": self.port
            }));
        }

        // Try to get status from the service
        let url = format!("http://localhost:{}/status", self.port);
        println!("[Slack Health Check] Attempting HTTP request to {}", url);

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_millis(1000))
            .build()
            .unwrap();

        match client.get(&url).send().await {
            Ok(response) => {
                println!("[Slack Health Check] HTTP request succeeded, status code: {}", response.status());
                match response.json().await {
                    Ok(status) => {
                        println!("[Slack Health Check] Successfully parsed JSON status: {:?}", status);
                        Ok(status)
                    },
                    Err(e) => {
                        println!("[Slack Health Check] Failed to parse JSON: {}", e);
                        Ok(serde_json::json!({
                            "initialized": false,
                            "service_running": true,
                            "port": self.port
                        }))
                    }
                }
            },
            Err(e) => {
                println!("[Slack Health Check] HTTP request failed: {}", e);
                // Service not responding, but process exists
                Ok(serde_json::json!({
                    "initialized": false,
                    "service_running": false,
                    "port": self.port
                }))
            }
        }
    }
}