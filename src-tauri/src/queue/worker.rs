use super::types::*;
use super::client::QueueClient;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio::time::{interval, Duration};
use crate::opencode::OpenCodeService;
use uuid::Uuid;

pub struct WorkerService {
    id: String,
    queue_client: Arc<dyn QueueClient>,
    opencode_service: Arc<OpenCodeService>,
    config: QueueConfig,
    info: Arc<RwLock<WorkerInfo>>,
    running: Arc<RwLock<bool>>,
}

impl WorkerService {
    pub fn new(
        queue_client: Arc<dyn QueueClient>,
        opencode_service: Arc<OpenCodeService>,
        config: QueueConfig,
    ) -> Self {
        let hostname = hostname::get()
            .map(|h| h.to_string_lossy().to_string())
            .unwrap_or_else(|_| "unknown".to_string());

        let info = WorkerInfo {
            id: Uuid::new_v4().to_string(),
            hostname: hostname.clone(),
            ip_address: "127.0.0.1".to_string(),
            port: 5000,
            capabilities: vec![
                "run_command".to_string(),
                "create_session".to_string(),
                "execute_code".to_string(),
            ],
            status: WorkerStatus::Online,
            last_heartbeat: chrono::Utc::now(),
            current_load: 0.0,
            max_concurrent_tasks: 5,
            current_tasks: Vec::new(),
        };

        Self {
            id: info.id.clone(),
            queue_client,
            opencode_service,
            config,
            info: Arc::new(RwLock::new(info)),
            running: Arc::new(RwLock::new(false)),
        }
    }

    pub async fn start(&self) -> Result<(), String> {
        let mut running = self.running.write().await;
        if *running {
            return Err("Worker already running".to_string());
        }
        *running = true;
        drop(running);

        let info = self.info.read().await;
        self.queue_client.register_worker(info.clone()).await?;
        drop(info);

        let queue_client = self.queue_client.clone();
        let worker_id = self.id.clone();
        let heartbeat_interval = self.config.heartbeat_interval_secs;

        tokio::spawn(async move {
            let mut interval = interval(Duration::from_secs(heartbeat_interval));
            loop {
                interval.tick().await;
                if let Err(e) = queue_client.update_worker_heartbeat(&worker_id).await {
                    eprintln!("Failed to update heartbeat: {}", e);
                }
            }
        });

        let queue_client = self.queue_client.clone();
        let opencode_service = self.opencode_service.clone();
        let info = self.info.clone();
        let running = self.running.clone();

        tokio::spawn(async move {
            while *running.read().await {
                match queue_client.consume_task().await {
                    Ok(Some(task)) => {
                        let result = Self::process_task(
                            task.clone(),
                            opencode_service.clone(),
                            info.clone()
                        ).await;

                        if let Err(e) = queue_client.publish_result(result).await {
                            eprintln!("Failed to publish result: {}", e);
                        }
                    }
                    Ok(None) => {
                        tokio::time::sleep(Duration::from_secs(1)).await;
                    }
                    Err(e) => {
                        eprintln!("Failed to consume task: {}", e);
                        tokio::time::sleep(Duration::from_secs(5)).await;
                    }
                }
            }
        });

        println!("Worker {} started", self.id);
        Ok(())
    }

    pub async fn stop(&self) -> Result<(), String> {
        let mut running = self.running.write().await;
        *running = false;
        drop(running);

        self.queue_client.remove_worker(&self.id).await?;
        println!("Worker {} stopped", self.id);
        Ok(())
    }

    async fn process_task(
        task: TaskMessage,
        opencode_service: Arc<OpenCodeService>,
        info: Arc<RwLock<WorkerInfo>>,
    ) -> TaskResult {
        let start_time = std::time::Instant::now();
        let worker_id = info.read().await.id.clone();

        {
            let mut info = info.write().await;
            info.current_tasks.push(task.id.clone());
            info.status = WorkerStatus::Busy;
        }

        let result = match task.task_type {
            TaskType::RunCommand => {
                Self::handle_run_command(task.payload, opencode_service).await
            }
            TaskType::CreateSession => {
                Self::handle_create_session(task.payload, opencode_service).await
            }
            TaskType::ExecuteCode => {
                Self::handle_execute_code(task.payload, opencode_service).await
            }
            TaskType::HealthCheck => {
                Self::handle_health_check(task.payload, opencode_service).await
            }
            TaskType::FileOperation => {
                Self::handle_file_operation(task.payload).await
            }
            TaskType::Custom(ref custom_type) => {
                Err(format!("Unknown custom task type: {}", custom_type))
            }
        };

        {
            let mut info = info.write().await;
            info.current_tasks.retain(|id| id != &task.id);
            if info.current_tasks.is_empty() {
                info.status = WorkerStatus::Online;
            }
        }

        let execution_time_ms = start_time.elapsed().as_millis() as u64;

        TaskResult {
            task_id: task.id,
            worker_id,
            success: result.is_ok(),
            result: result.as_ref().ok().cloned(),
            error: result.err(),
            execution_time_ms,
            completed_at: chrono::Utc::now(),
        }
    }

    async fn handle_run_command(
        payload: serde_json::Value,
        _opencode_service: Arc<OpenCodeService>,
    ) -> Result<serde_json::Value, String> {
        let _server_id = payload["server_id"]
            .as_str()
            .ok_or("Missing server_id")?;

        let command = payload["command"]
            .as_str()
            .ok_or("Missing command")?;

        // For test mode, simulate command execution
        // In production, this would execute on the actual server

        // Simulate some processing time
        tokio::time::sleep(tokio::time::Duration::from_millis(300)).await;

        // Return simulated command output
        Ok(serde_json::json!({
            "stdout": format!("Test output for command: {}\nSimulated execution successful", command),
            "stderr": "",
            "exit_code": 0,
            "message": "Command executed in test mode"
        }))
    }

    async fn handle_create_session(
        payload: serde_json::Value,
        _opencode_service: Arc<OpenCodeService>,
    ) -> Result<serde_json::Value, String> {
        let port = payload["port"]
            .as_u64()
            .ok_or("Missing port")? as u16;

        let model = payload["model"]
            .as_str()
            .map(String::from)
            .unwrap_or_else(|| "claude-sonnet-4-0".to_string());

        let working_dir = payload["working_dir"]
            .as_str()
            .map(String::from);

        // For test mode, simulate creating a server without actually spawning it
        // In production, this would call opencode_service.spawn_sdk_server

        // Simulate some processing time
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

        // Return simulated server information
        Ok(serde_json::json!({
            "id": format!("test-server-{}", uuid::Uuid::new_v4()),
            "host": "127.0.0.1",
            "port": port,
            "process_id": Some(99999), // Simulated PID
            "mode": "SDK",
            "model": model,
            "working_dir": working_dir,
            "status": "Running",
            "created_at": chrono::Utc::now().to_rfc3339(),
            "message": "Test server created (simulated)"
        }))
    }

    async fn handle_execute_code(
        payload: serde_json::Value,
        _opencode_service: Arc<OpenCodeService>,
    ) -> Result<serde_json::Value, String> {
        let code = payload["code"]
            .as_str()
            .ok_or("Missing code")?;

        let language = payload["language"]
            .as_str()
            .unwrap_or("bash");

        match language {
            "bash" | "sh" => {
                use tokio::process::Command;
                let output = Command::new("bash")
                    .arg("-c")
                    .arg(code)
                    .output()
                    .await
                    .map_err(|e| format!("Code execution failed: {}", e))?;

                Ok(serde_json::json!({
                    "output": String::from_utf8_lossy(&output.stdout),
                    "error": String::from_utf8_lossy(&output.stderr),
                    "exit_code": output.status.code(),
                }))
            }
            _ => Err(format!("Unsupported language: {}", language))
        }
    }

    async fn handle_health_check(
        payload: serde_json::Value,
        _opencode_service: Arc<OpenCodeService>,
    ) -> Result<serde_json::Value, String> {
        let server_id = payload["server_id"]
            .as_str()
            .unwrap_or("test-server");

        // For test mode, always return healthy
        // In production, this would check actual server health

        // Simulate some processing time
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

        Ok(serde_json::json!({
            "healthy": true,
            "server_id": server_id,
            "timestamp": chrono::Utc::now(),
            "message": "Test server is healthy (simulated)",
            "latency_ms": 10
        }))
    }

    async fn handle_file_operation(
        payload: serde_json::Value,
    ) -> Result<serde_json::Value, String> {
        let operation = payload["operation"]
            .as_str()
            .ok_or("Missing operation")?;

        let path = payload["path"]
            .as_str()
            .ok_or("Missing path")?;

        match operation {
            "read" => {
                let content = tokio::fs::read_to_string(path).await
                    .map_err(|e| format!("Failed to read file: {}", e))?;

                Ok(serde_json::json!({
                    "content": content,
                }))
            }
            "write" => {
                let content = payload["content"]
                    .as_str()
                    .ok_or("Missing content")?;

                tokio::fs::write(path, content).await
                    .map_err(|e| format!("Failed to write file: {}", e))?;

                Ok(serde_json::json!({
                    "success": true,
                }))
            }
            "exists" => {
                let exists = tokio::fs::metadata(path).await.is_ok();

                Ok(serde_json::json!({
                    "exists": exists,
                }))
            }
            _ => Err(format!("Unknown file operation: {}", operation))
        }
    }

    pub async fn get_info(&self) -> WorkerInfo {
        self.info.read().await.clone()
    }

    pub async fn update_load(&self, load: f32) {
        let mut info = self.info.write().await;
        info.current_load = load;
    }
}