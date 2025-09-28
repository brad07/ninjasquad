use super::*;
use crate::opencode::OpenCodeService;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio::time::{interval, Duration};

/// Local test mode that simulates distributed workers on the same machine
pub struct LocalTestMode {
    queue_client: Arc<dyn QueueClient>,
    opencode_service: Arc<OpenCodeService>,
    workers: Vec<Arc<WorkerService>>,
    running: Arc<RwLock<bool>>,
}

impl LocalTestMode {
    pub fn new(opencode_service: Arc<OpenCodeService>) -> Self {
        // Use in-memory queue for local testing
        let _config = QueueConfig {
            redis_url: None,
            rabbitmq_url: None,
            queue_type: QueueType::InMemory,
            task_queue_name: "local:tasks".to_string(),
            result_queue_name: "local:results".to_string(),
            worker_queue_name: "local:workers".to_string(),
            heartbeat_interval_secs: 5, // Faster heartbeat for testing
            task_timeout_secs: 60,
        };

        let queue_client = Arc::new(InMemoryQueueClient::new());

        Self {
            queue_client,
            opencode_service,
            workers: Vec::new(),
            running: Arc::new(RwLock::new(false)),
        }
    }

    /// Start local test mode with specified number of simulated workers
    pub async fn start(&mut self, num_workers: usize) -> Result<(), String> {
        let mut running = self.running.write().await;
        if *running {
            return Err("Local test mode already running".to_string());
        }
        *running = true;
        drop(running);

        println!("🚀 Starting local test mode with {} simulated workers", num_workers);

        // Create and start local workers
        for i in 0..num_workers {
            let config = QueueConfig {
                redis_url: None,
                rabbitmq_url: None,
                queue_type: QueueType::InMemory,
                task_queue_name: "local:tasks".to_string(),
                result_queue_name: "local:results".to_string(),
                worker_queue_name: "local:workers".to_string(),
                heartbeat_interval_secs: 5,
                task_timeout_secs: 60,
            };

            let worker = WorkerService::new(
                self.queue_client.clone(),
                self.opencode_service.clone(),
                config,
            );

            // Override worker info for testing
            let worker_info = WorkerInfo {
                id: format!("local-worker-{}", i),
                hostname: format!("localhost-{}", i),
                ip_address: "127.0.0.1".to_string(),
                port: (5000 + i) as u16,
                capabilities: vec![
                    "run_command".to_string(),
                    "create_session".to_string(),
                    "execute_code".to_string(),
                    "health_check".to_string(),
                ],
                status: WorkerStatus::Online,
                last_heartbeat: chrono::Utc::now(),
                current_load: 0.0,
                max_concurrent_tasks: 2, // Lower for testing
                current_tasks: Vec::new(),
            };

            // Register worker
            self.queue_client.register_worker(worker_info).await?;

            // Start worker
            worker.start().await?;
            self.workers.push(Arc::new(worker));

            println!("  ✅ Started local worker {}", i);
        }

        // Start monitoring task
        let queue_client = self.queue_client.clone();
        let running = self.running.clone();

        tokio::spawn(async move {
            let mut interval = interval(Duration::from_secs(10));

            while *running.read().await {
                interval.tick().await;

                if let Ok(workers) = queue_client.get_active_workers().await {
                    println!("📊 Active workers: {}", workers.len());
                    for worker in workers {
                        println!("  - {} ({}): Load={:.1}%, Tasks={}",
                            worker.id,
                            worker.status.to_string(),
                            worker.current_load * 100.0,
                            worker.current_tasks.len()
                        );
                    }
                }
            }
        });

        println!("✨ Local test mode started successfully!");
        Ok(())
    }

    /// Stop all local workers
    pub async fn stop(&self) -> Result<(), String> {
        let mut running = self.running.write().await;
        *running = false;
        drop(running);

        println!("🛑 Stopping local test mode...");

        for (i, worker) in self.workers.iter().enumerate() {
            worker.stop().await?;
            println!("  ✅ Stopped local worker {}", i);
        }

        println!("✨ Local test mode stopped successfully!");
        Ok(())
    }

    /// Get the queue client for publishing tasks
    pub fn get_queue_client(&self) -> Arc<dyn QueueClient> {
        self.queue_client.clone()
    }

    /// Simulate a task execution
    pub async fn simulate_task(&self, task_type: &str) -> Result<String, String> {
        let task = match task_type {
            "create_session" => {
                TaskMessage::new(
                    TaskType::CreateSession,
                    serde_json::json!({
                        "port": 4097,
                        "model": "claude-sonnet-4-0",
                        "working_dir": "/tmp/test"
                    })
                )
            },
            "run_command" => {
                TaskMessage::new(
                    TaskType::RunCommand,
                    serde_json::json!({
                        "server_id": "test-server",
                        "command": "echo 'Hello from distributed system!'"
                    })
                )
            },
            "health_check" => {
                TaskMessage::new(
                    TaskType::HealthCheck,
                    serde_json::json!({
                        "server_id": "test-server"
                    })
                )
            },
            _ => return Err(format!("Unknown task type: {}", task_type))
        };

        let task_id = task.id.clone();
        self.queue_client.publish_task(task).await?;

        println!("📤 Published task: {} ({})", task_id, task_type);

        // Wait for result
        let mut attempts = 0;
        loop {
            tokio::time::sleep(Duration::from_secs(1)).await;

            if let Some(result) = self.queue_client.consume_result(&task_id).await? {
                if result.success {
                    println!("✅ Task completed successfully by {}", result.worker_id);
                    return Ok(format!("Task {} completed: {:?}", task_id, result.result));
                } else {
                    println!("❌ Task failed: {:?}", result.error);
                    return Err(result.error.unwrap_or_else(|| "Unknown error".to_string()));
                }
            }

            attempts += 1;
            if attempts > 30 {
                return Err("Task timeout after 30 seconds".to_string());
            }
        }
    }

    /// Get statistics about the local test environment
    pub async fn get_stats(&self) -> serde_json::Value {
        let workers = self.queue_client.get_active_workers().await
            .unwrap_or_default();

        let total_load: f32 = workers.iter().map(|w| w.current_load).sum();
        let total_tasks: usize = workers.iter().map(|w| w.current_tasks.len()).sum();

        serde_json::json!({
            "mode": "local_test",
            "running": *self.running.read().await,
            "num_workers": self.workers.len(),
            "active_workers": workers.len(),
            "total_load": total_load,
            "total_tasks": total_tasks,
            "workers": workers.iter().map(|w| serde_json::json!({
                "id": w.id,
                "status": w.status.to_string(),
                "load": w.current_load,
                "tasks": w.current_tasks.len()
            })).collect::<Vec<_>>()
        })
    }
}

impl WorkerStatus {
    fn to_string(&self) -> &'static str {
        match self {
            WorkerStatus::Online => "Online",
            WorkerStatus::Busy => "Busy",
            WorkerStatus::Offline => "Offline",
            WorkerStatus::Maintenance => "Maintenance",
        }
    }
}