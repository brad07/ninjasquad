use std::process::{Child, Command};
use std::sync::Arc;
use tokio::sync::Mutex;
use anyhow::Result;

#[derive(Debug, Clone)]
pub struct ClaudeAgentService {
    process: Arc<Mutex<Option<Child>>>,
    port: u16,
}

impl ClaudeAgentService {
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
            println!("[ClaudeAgent] Port cleanup completed for {}", port);
        });
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

        // Get the path to the claude-agent-service.ts script
        // Working directory is typically src-tauri, so use relative path from there
        let resource_path = std::path::PathBuf::from("scripts/claude-agent-service.ts");

        // Check if the script exists
        if !resource_path.exists() {
            return Err(anyhow::anyhow!(
                "Claude Agent service script not found at {:?}. Current dir: {:?}",
                resource_path.canonicalize().unwrap_or_else(|_| resource_path.clone()),
                std::env::current_dir().unwrap_or_default()
            ));
        }

        // Start the Node.js Claude Agent service using tsx
        let mut cmd = Command::new("npx");
        cmd.arg("tsx")
            .arg(&resource_path)
            .env("CLAUDE_AGENT_SERVICE_PORT", self.port.to_string())
            .stdout(std::process::Stdio::inherit())
            .stderr(std::process::Stdio::inherit());

        let child = cmd.spawn()
            .map_err(|e| anyhow::anyhow!("Failed to spawn Claude Agent service: {} (script path: {:?})", e, resource_path))?;

        *process_guard = Some(child);

        println!("Claude Agent service started on port {}", self.port);

        // Wait for service to be ready
        tokio::time::sleep(tokio::time::Duration::from_millis(3000)).await;

        Ok(())
    }

    pub async fn stop(&self) -> Result<()> {
        let mut process_guard = self.process.lock().await;

        if let Some(mut child) = process_guard.take() {
            child.kill()
                .map_err(|e| anyhow::anyhow!("Failed to kill Claude Agent service: {}", e))?;
        }

        Ok(())
    }

    pub async fn initialize(&self, api_key: String, model: Option<String>) -> Result<()> {
        let url = format!("http://localhost:{}/initialize", self.port);
        let client = reqwest::Client::new();

        let mut payload = serde_json::json!({
            "api_key": api_key
        });

        if let Some(model_name) = model {
            payload["default_model"] = serde_json::Value::String(model_name);
        }

        let response = client
            .post(&url)
            .json(&payload)
            .send()
            .await
            .map_err(|e| anyhow::anyhow!("Failed to initialize Claude Agent: {}", e))?;

        if !response.status().is_success() {
            let error = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            return Err(anyhow::anyhow!("Claude Agent initialization failed: {}", error));
        }

        Ok(())
    }

    pub async fn health_check(&self) -> Result<serde_json::Value> {
        let url = format!("http://localhost:{}/health", self.port);
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(5))
            .build()?;

        let response = client
            .get(&url)
            .send()
            .await
            .map_err(|e| anyhow::anyhow!("Failed to check health: {}", e))?;

        let health = response
            .json()
            .await
            .map_err(|e| anyhow::anyhow!("Failed to parse health response: {}", e))?;

        Ok(health)
    }

    pub async fn shutdown(&self) -> Result<()> {
        self.stop().await?;
        Ok(())
    }
}