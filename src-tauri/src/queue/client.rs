use super::types::*;
use std::sync::Arc;
use tokio::sync::RwLock;
use std::collections::HashMap;
use async_trait::async_trait;

#[async_trait]
pub trait QueueClient: Send + Sync {
    async fn publish_task(&self, task: TaskMessage) -> Result<(), String>;
    async fn consume_task(&self) -> Result<Option<TaskMessage>, String>;
    async fn publish_result(&self, result: TaskResult) -> Result<(), String>;
    async fn consume_result(&self, task_id: &str) -> Result<Option<TaskResult>, String>;
    async fn register_worker(&self, worker: WorkerInfo) -> Result<(), String>;
    async fn update_worker_heartbeat(&self, worker_id: &str) -> Result<(), String>;
    async fn get_active_workers(&self) -> Result<Vec<WorkerInfo>, String>;
    async fn remove_worker(&self, worker_id: &str) -> Result<(), String>;
}

pub struct InMemoryQueueClient {
    tasks: Arc<RwLock<Vec<TaskMessage>>>,
    results: Arc<RwLock<HashMap<String, TaskResult>>>,
    workers: Arc<RwLock<HashMap<String, WorkerInfo>>>,
}

impl InMemoryQueueClient {
    pub fn new() -> Self {
        Self {
            tasks: Arc::new(RwLock::new(Vec::new())),
            results: Arc::new(RwLock::new(HashMap::new())),
            workers: Arc::new(RwLock::new(HashMap::new())),
        }
    }
}

#[async_trait]
impl QueueClient for InMemoryQueueClient {
    async fn publish_task(&self, task: TaskMessage) -> Result<(), String> {
        let mut tasks = self.tasks.write().await;
        tasks.push(task);
        tasks.sort_by(|a, b| b.priority.cmp(&a.priority));
        Ok(())
    }

    async fn consume_task(&self) -> Result<Option<TaskMessage>, String> {
        let mut tasks = self.tasks.write().await;
        Ok(tasks.pop())
    }

    async fn publish_result(&self, result: TaskResult) -> Result<(), String> {
        let mut results = self.results.write().await;
        results.insert(result.task_id.clone(), result);
        Ok(())
    }

    async fn consume_result(&self, task_id: &str) -> Result<Option<TaskResult>, String> {
        let mut results = self.results.write().await;
        Ok(results.remove(task_id))
    }

    async fn register_worker(&self, worker: WorkerInfo) -> Result<(), String> {
        let mut workers = self.workers.write().await;
        workers.insert(worker.id.clone(), worker);
        Ok(())
    }

    async fn update_worker_heartbeat(&self, worker_id: &str) -> Result<(), String> {
        let mut workers = self.workers.write().await;
        if let Some(worker) = workers.get_mut(worker_id) {
            worker.last_heartbeat = chrono::Utc::now();
            Ok(())
        } else {
            Err(format!("Worker {} not found", worker_id))
        }
    }

    async fn get_active_workers(&self) -> Result<Vec<WorkerInfo>, String> {
        let workers = self.workers.read().await;
        let now = chrono::Utc::now();
        let active: Vec<WorkerInfo> = workers
            .values()
            .filter(|w| {
                let time_since_heartbeat = now.signed_duration_since(w.last_heartbeat);
                time_since_heartbeat.num_seconds() < 60
            })
            .cloned()
            .collect();
        Ok(active)
    }

    async fn remove_worker(&self, worker_id: &str) -> Result<(), String> {
        let mut workers = self.workers.write().await;
        workers.remove(worker_id);
        Ok(())
    }
}

#[cfg(feature = "redis")]
pub struct RedisQueueClient {
    client: redis::Client,
    config: QueueConfig,
}

#[cfg(feature = "redis")]
impl RedisQueueClient {
    pub fn new(config: QueueConfig) -> Result<Self, String> {
        let redis_url = config.redis_url.clone()
            .ok_or_else(|| "Redis URL not configured".to_string())?;

        let client = redis::Client::open(redis_url)
            .map_err(|e| format!("Failed to create Redis client: {}", e))?;

        Ok(Self { client, config })
    }
}

#[cfg(feature = "redis")]
#[async_trait]
impl QueueClient for RedisQueueClient {
    async fn publish_task(&self, task: TaskMessage) -> Result<(), String> {
        use redis::AsyncCommands;

        let mut con = self.client.get_async_connection().await
            .map_err(|e| format!("Redis connection failed: {}", e))?;

        let task_json = serde_json::to_string(&task)
            .map_err(|e| format!("Failed to serialize task: {}", e))?;

        con.lpush(&self.config.task_queue_name, task_json).await
            .map_err(|e| format!("Failed to publish task: {}", e))?;

        Ok(())
    }

    async fn consume_task(&self) -> Result<Option<TaskMessage>, String> {
        use redis::AsyncCommands;

        let mut con = self.client.get_async_connection().await
            .map_err(|e| format!("Redis connection failed: {}", e))?;

        let task_json: Option<String> = con.rpop(&self.config.task_queue_name, None).await
            .map_err(|e| format!("Failed to consume task: {}", e))?;

        if let Some(json) = task_json {
            let task = serde_json::from_str(&json)
                .map_err(|e| format!("Failed to deserialize task: {}", e))?;
            Ok(Some(task))
        } else {
            Ok(None)
        }
    }

    async fn publish_result(&self, result: TaskResult) -> Result<(), String> {
        use redis::AsyncCommands;

        let mut con = self.client.get_async_connection().await
            .map_err(|e| format!("Redis connection failed: {}", e))?;

        let result_json = serde_json::to_string(&result)
            .map_err(|e| format!("Failed to serialize result: {}", e))?;

        let key = format!("{}:{}", self.config.result_queue_name, result.task_id);
        con.set_ex(&key, result_json, self.config.task_timeout_secs as usize).await
            .map_err(|e| format!("Failed to publish result: {}", e))?;

        Ok(())
    }

    async fn consume_result(&self, task_id: &str) -> Result<Option<TaskResult>, String> {
        use redis::AsyncCommands;

        let mut con = self.client.get_async_connection().await
            .map_err(|e| format!("Redis connection failed: {}", e))?;

        let key = format!("{}:{}", self.config.result_queue_name, task_id);
        let result_json: Option<String> = con.get(&key).await
            .map_err(|e| format!("Failed to get result: {}", e))?;

        if let Some(json) = result_json {
            let result = serde_json::from_str(&json)
                .map_err(|e| format!("Failed to deserialize result: {}", e))?;

            let _: () = con.del(&key).await
                .map_err(|e| format!("Failed to delete result: {}", e))?;

            Ok(Some(result))
        } else {
            Ok(None)
        }
    }

    async fn register_worker(&self, worker: WorkerInfo) -> Result<(), String> {
        use redis::AsyncCommands;

        let mut con = self.client.get_async_connection().await
            .map_err(|e| format!("Redis connection failed: {}", e))?;

        let worker_json = serde_json::to_string(&worker)
            .map_err(|e| format!("Failed to serialize worker: {}", e))?;

        let key = format!("{}:{}", self.config.worker_queue_name, worker.id);
        con.set_ex(&key, worker_json, self.config.heartbeat_interval_secs as usize * 2).await
            .map_err(|e| format!("Failed to register worker: {}", e))?;

        Ok(())
    }

    async fn update_worker_heartbeat(&self, worker_id: &str) -> Result<(), String> {
        use redis::AsyncCommands;

        let mut con = self.client.get_async_connection().await
            .map_err(|e| format!("Redis connection failed: {}", e))?;

        let key = format!("{}:{}", self.config.worker_queue_name, worker_id);

        let worker_json: Option<String> = con.get(&key).await
            .map_err(|e| format!("Failed to get worker: {}", e))?;

        if let Some(json) = worker_json {
            let mut worker: WorkerInfo = serde_json::from_str(&json)
                .map_err(|e| format!("Failed to deserialize worker: {}", e))?;

            worker.last_heartbeat = chrono::Utc::now();

            let updated_json = serde_json::to_string(&worker)
                .map_err(|e| format!("Failed to serialize worker: {}", e))?;

            con.set_ex(&key, updated_json, self.config.heartbeat_interval_secs as usize * 2).await
                .map_err(|e| format!("Failed to update heartbeat: {}", e))?;

            Ok(())
        } else {
            Err(format!("Worker {} not found", worker_id))
        }
    }

    async fn get_active_workers(&self) -> Result<Vec<WorkerInfo>, String> {
        use redis::AsyncCommands;

        let mut con = self.client.get_async_connection().await
            .map_err(|e| format!("Redis connection failed: {}", e))?;

        let pattern = format!("{}:*", self.config.worker_queue_name);
        let keys: Vec<String> = con.keys(&pattern).await
            .map_err(|e| format!("Failed to get worker keys: {}", e))?;

        let mut workers = Vec::new();
        for key in keys {
            let worker_json: Option<String> = con.get(&key).await
                .map_err(|e| format!("Failed to get worker data: {}", e))?;

            if let Some(json) = worker_json {
                let worker: WorkerInfo = serde_json::from_str(&json)
                    .map_err(|e| format!("Failed to deserialize worker: {}", e))?;
                workers.push(worker);
            }
        }

        Ok(workers)
    }

    async fn remove_worker(&self, worker_id: &str) -> Result<(), String> {
        use redis::AsyncCommands;

        let mut con = self.client.get_async_connection().await
            .map_err(|e| format!("Redis connection failed: {}", e))?;

        let key = format!("{}:{}", self.config.worker_queue_name, worker_id);
        let _: () = con.del(&key).await
            .map_err(|e| format!("Failed to remove worker: {}", e))?;

        Ok(())
    }
}

pub fn create_queue_client(config: QueueConfig) -> Arc<dyn QueueClient> {
    match config.queue_type {
        #[cfg(feature = "redis")]
        QueueType::Redis => {
            match RedisQueueClient::new(config) {
                Ok(client) => Arc::new(client),
                Err(e) => {
                    eprintln!("Failed to create Redis client: {}, falling back to in-memory", e);
                    Arc::new(InMemoryQueueClient::new())
                }
            }
        }
        _ => Arc::new(InMemoryQueueClient::new()),
    }
}