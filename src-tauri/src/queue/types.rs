use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::{DateTime, Utc};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskMessage {
    pub id: String,
    pub task_type: TaskType,
    pub payload: serde_json::Value,
    pub created_at: DateTime<Utc>,
    pub priority: u8,
    pub retry_count: u32,
    pub max_retries: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TaskType {
    RunCommand,
    CreateSession,
    ExecuteCode,
    HealthCheck,
    FileOperation,
    Custom(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkerInfo {
    pub id: String,
    pub hostname: String,
    pub ip_address: String,
    pub port: u16,
    pub capabilities: Vec<String>,
    pub status: WorkerStatus,
    pub last_heartbeat: DateTime<Utc>,
    pub current_load: f32,
    pub max_concurrent_tasks: usize,
    pub current_tasks: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum WorkerStatus {
    Online,
    Busy,
    Offline,
    Maintenance,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskResult {
    pub task_id: String,
    pub worker_id: String,
    pub success: bool,
    pub result: Option<serde_json::Value>,
    pub error: Option<String>,
    pub execution_time_ms: u64,
    pub completed_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueueConfig {
    pub redis_url: Option<String>,
    pub rabbitmq_url: Option<String>,
    pub queue_type: QueueType,
    pub task_queue_name: String,
    pub result_queue_name: String,
    pub worker_queue_name: String,
    pub heartbeat_interval_secs: u64,
    pub task_timeout_secs: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum QueueType {
    Redis,
    RabbitMQ,
    InMemory,
}

impl Default for QueueConfig {
    fn default() -> Self {
        Self {
            redis_url: Some("redis://127.0.0.1:6379".to_string()),
            rabbitmq_url: None,
            queue_type: QueueType::Redis,
            task_queue_name: "ninja:tasks".to_string(),
            result_queue_name: "ninja:results".to_string(),
            worker_queue_name: "ninja:workers".to_string(),
            heartbeat_interval_secs: 30,
            task_timeout_secs: 300,
        }
    }
}

impl TaskMessage {
    pub fn new(task_type: TaskType, payload: serde_json::Value) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            task_type,
            payload,
            created_at: Utc::now(),
            priority: 5,
            retry_count: 0,
            max_retries: 3,
        }
    }

    pub fn with_priority(mut self, priority: u8) -> Self {
        self.priority = priority;
        self
    }

    pub fn with_retries(mut self, max_retries: u32) -> Self {
        self.max_retries = max_retries;
        self
    }
}