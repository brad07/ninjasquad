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

        // Get the path to the slack-service.js script
        // Working directory is typically src-tauri, so use relative path from there
        let resource_path = std::path::PathBuf::from("scripts/slack-service.js");

        // Check if the script exists
        if !resource_path.exists() {
            return Err(anyhow::anyhow!(
                "Slack service script not found at {:?}. Current dir: {:?}",
                resource_path.canonicalize().unwrap_or_else(|_| resource_path.clone()),
                std::env::current_dir().unwrap_or_default()
            ));
        }

        // Start the Node.js Slack service
        let mut cmd = Command::new("node");
        cmd.arg(&resource_path)
            .env("SLACK_SERVICE_PORT", self.port.to_string())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());

        let child = cmd.spawn()
            .map_err(|e| anyhow::anyhow!("Failed to spawn Slack service: {} (script path: {:?})", e, resource_path))?;

        *process_guard = Some(child);

        println!("Slack service started on port {}", self.port);

        // Wait for service to be ready
        tokio::time::sleep(tokio::time::Duration::from_millis(2000)).await;

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

    pub async fn status(&self) -> Result<serde_json::Value> {
        let url = format!("http://localhost:{}/status", self.port);
        let client = reqwest::Client::new();

        let response = client
            .get(&url)
            .send()
            .await
            .map_err(|e| anyhow::anyhow!("Failed to get status: {}", e))?;

        let status = response
            .json()
            .await
            .map_err(|e| anyhow::anyhow!("Failed to parse status: {}", e))?;

        Ok(status)
    }
}