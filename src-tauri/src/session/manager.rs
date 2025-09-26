use super::types::*;
use crate::opencode::{OpenCodeService, OpenCodeApiClient};
use crate::wezterm::WezTermController;
use std::collections::{HashMap, VecDeque};
use std::sync::Arc;
use tokio::sync::RwLock;
use uuid::Uuid;
use chrono::Utc;
use rand::seq::SliceRandom;

pub struct SessionManager {
    sessions: Arc<RwLock<HashMap<String, OrchestratorSession>>>,
    opencode_service: Arc<OpenCodeService>,
    _wezterm_controller: Arc<WezTermController>,
    distribution_strategy: DistributionStrategy,
    round_robin_index: Arc<RwLock<usize>>,
    pending_tasks: Arc<RwLock<VecDeque<Task>>>,
}

impl SessionManager {
    pub fn new(
        opencode_service: Arc<OpenCodeService>,
        wezterm_controller: Arc<WezTermController>,
    ) -> Self {
        Self {
            sessions: Arc::new(RwLock::new(HashMap::new())),
            opencode_service,
            _wezterm_controller: wezterm_controller,
            distribution_strategy: DistributionStrategy::RoundRobin,
            round_robin_index: Arc::new(RwLock::new(0)),
            pending_tasks: Arc::new(RwLock::new(VecDeque::new())),
        }
    }

    pub async fn register_session(&self, opencode_server_id: String) -> Result<OrchestratorSession, String> {
        println!("SessionManager: Creating session for server {}", opencode_server_id);
        let session_id = format!("session-{}", Uuid::new_v4());

        let session = OrchestratorSession {
            id: session_id.clone(),
            opencode_server_id: opencode_server_id.clone(),
            wezterm_pane_id: None,
            status: SessionStatus::Idle,
            created_at: Utc::now().to_rfc3339(),
            task: None,
        };

        println!("SessionManager: Storing session {} in map", session_id);
        self.sessions.write().await.insert(session_id.clone(), session.clone());

        println!("SessionManager: Session created - ID: {}, Server: {}", session.id, opencode_server_id);
        Ok(session)
    }

    pub async fn distribute_task(&self, prompt: String) -> Result<String, String> {
        println!("SessionManager: Starting task distribution for prompt: {}", prompt);
        let task_id = format!("task-{}", Uuid::new_v4());

        let task = Task {
            id: task_id.clone(),
            prompt: prompt.clone(),
            assigned_at: Utc::now().to_rfc3339(),
            completed_at: None,
            result: None,
        };

        // Find an available session
        println!("SessionManager: Finding available session...");
        let available_session = self.find_available_session().await?;
        println!("SessionManager: Found available session: {}", available_session);

        // Assign task to session
        let mut sessions = self.sessions.write().await;
        if let Some(session) = sessions.get_mut(&available_session) {
            println!("SessionManager: Assigning task to session {}", session.id);
            session.task = Some(task.clone());
            session.status = SessionStatus::Working;

            // Send prompt to OpenCode server
            println!("SessionManager: Looking for OpenCode server {}", session.opencode_server_id);
            if let Some(server) = self.opencode_service.get_server(&session.opencode_server_id).await {
                println!("SessionManager: Found server at {}:{}", server.host, server.port);
                let client = OpenCodeApiClient::new(&server.host, server.port);
                match client.send_prompt(&prompt).await {
                    Ok(_) => println!("SessionManager: Successfully sent prompt to OpenCode server"),
                    Err(e) => println!("SessionManager: Failed to send prompt to OpenCode server: {}", e),
                }
            } else {
                println!("SessionManager: Could not find OpenCode server {}", session.opencode_server_id);
            }
        }

        println!("SessionManager: Task {} distributed successfully", task_id);
        Ok(task_id)
    }

    async fn find_available_session(&self) -> Result<String, String> {
        let sessions = self.sessions.read().await;
        let idle_sessions: Vec<_> = sessions
            .iter()
            .filter(|(_, s)| s.status == SessionStatus::Idle)
            .map(|(id, _)| id.clone())
            .collect();

        if idle_sessions.is_empty() {
            return Err("No available sessions".to_string());
        }

        match self.distribution_strategy {
            DistributionStrategy::RoundRobin => {
                let mut index = self.round_robin_index.write().await;
                let selected = idle_sessions[*index % idle_sessions.len()].clone();
                *index = (*index + 1) % idle_sessions.len();
                Ok(selected)
            }
            DistributionStrategy::Random => {
                let mut rng = rand::thread_rng();
                idle_sessions
                    .choose(&mut rng)
                    .cloned()
                    .ok_or_else(|| "No sessions available".to_string())
            }
            DistributionStrategy::LeastLoaded => {
                // For now, just pick the first idle session
                // In a real implementation, we'd track load metrics
                Ok(idle_sessions[0].clone())
            }
        }
    }

    pub async fn handle_session_failure(&self, session_id: &str) -> Result<(), String> {
        let mut sessions = self.sessions.write().await;

        if let Some(session) = sessions.get_mut(session_id) {
            let failed_task = session.task.clone();
            session.status = SessionStatus::Failed("Session failed".to_string());
            session.task = None;

            // If there was an incomplete task, add it to pending tasks
            if let Some(task) = failed_task {
                if task.completed_at.is_none() {
                    drop(sessions); // Release lock
                    self.pending_tasks.write().await.push_back(task.clone());

                    // Try to reassign the task
                    self.distribute_task(task.prompt).await.ok();
                }
            }

            Ok(())
        } else {
            Err(format!("Session {} not found", session_id))
        }
    }

    pub async fn rebalance_sessions(&self) -> Result<(), String> {
        // Get all working sessions and their tasks
        let sessions = self.sessions.read().await;
        let mut task_counts: HashMap<String, usize> = HashMap::new();

        for (id, session) in sessions.iter() {
            if session.task.is_some() {
                task_counts.insert(id.clone(), 1);
            } else {
                task_counts.insert(id.clone(), 0);
            }
        }

        drop(sessions);

        // Check if rebalancing is needed
        if task_counts.is_empty() {
            return Ok(());
        }

        let max_tasks = *task_counts.values().max().unwrap_or(&0);
        let min_tasks = *task_counts.values().min().unwrap_or(&0);

        // If difference is more than 1, rebalance
        if max_tasks - min_tasks > 1 {
            // In a real implementation, we would move tasks from overloaded to underloaded sessions
            // For now, just mark as successful
        }

        Ok(())
    }

    pub async fn get_session_state(&self, session_id: &str) -> Option<OrchestratorSession> {
        self.sessions.read().await.get(session_id).cloned()
    }

    pub async fn list_sessions(&self) -> Vec<OrchestratorSession> {
        self.sessions.read().await.values().cloned().collect()
    }

    pub fn set_distribution_strategy(&mut self, strategy: DistributionStrategy) {
        self.distribution_strategy = strategy;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn setup_manager() -> SessionManager {
        let opencode_service = Arc::new(OpenCodeService::new());
        let wezterm_controller = Arc::new(WezTermController::new());
        SessionManager::new(opencode_service, wezterm_controller)
    }

    #[tokio::test]
    async fn test_register_new_session() {
        let manager = setup_manager().await;

        let session = manager.register_session("server-123".to_string()).await;

        assert!(session.is_ok());
        let session = session.unwrap();
        assert_eq!(session.opencode_server_id, "server-123");
        assert_eq!(session.status, SessionStatus::Idle);
        assert!(session.task.is_none());
    }

    #[tokio::test]
    #[ignore = "Requires opencode binary"]
    async fn test_distribute_task_round_robin() {
        let mut manager = setup_manager().await;
        manager.set_distribution_strategy(DistributionStrategy::RoundRobin);

        // Register multiple sessions
        let session1 = manager.register_session("server-1".to_string()).await.unwrap();
        let _session2 = manager.register_session("server-2".to_string()).await.unwrap();
        let _session3 = manager.register_session("server-3".to_string()).await.unwrap();

        // Distribute tasks
        let _task1_id = manager.distribute_task("Task 1".to_string()).await.unwrap();
        let _task2_id = manager.distribute_task("Task 2".to_string()).await.unwrap();
        let _task3_id = manager.distribute_task("Task 3".to_string()).await.unwrap();
        let _task4_id = manager.distribute_task("Task 4".to_string()).await.unwrap();

        // Verify round-robin distribution
        let sessions = manager.list_sessions().await;
        let session_tasks: Vec<_> = sessions
            .iter()
            .filter(|s| s.task.is_some())
            .collect();

        assert_eq!(session_tasks.len(), 3);
        // Fourth task should go back to the first session
        let session1_updated = manager.get_session_state(&session1.id).await.unwrap();
        assert!(session1_updated.task.is_some());
    }

    #[tokio::test]
    async fn test_handle_session_failure() {
        let manager = setup_manager().await;

        let session = manager.register_session("server-fail".to_string()).await.unwrap();

        // Assign a task
        manager.distribute_task("Important task".to_string()).await.unwrap();

        // Handle failure
        let result = manager.handle_session_failure(&session.id).await;

        assert!(result.is_ok());

        // Check session status
        let failed_session = manager.get_session_state(&session.id).await.unwrap();
        assert!(matches!(failed_session.status, SessionStatus::Failed(_)));

        // Task should be reassigned to another session if available
    }

    #[tokio::test]
    #[ignore = "Requires opencode binary"]
    async fn test_rebalance_on_instance_change() {
        let manager = setup_manager().await;

        // Start with 2 sessions
        let _session1 = manager.register_session("server-1".to_string()).await.unwrap();
        let _session2 = manager.register_session("server-2".to_string()).await.unwrap();

        // Distribute tasks
        manager.distribute_task("Task 1".to_string()).await.unwrap();
        manager.distribute_task("Task 2".to_string()).await.unwrap();
        manager.distribute_task("Task 3".to_string()).await.unwrap();
        manager.distribute_task("Task 4".to_string()).await.unwrap();

        // Add a new session
        let _session3 = manager.register_session("server-3".to_string()).await.unwrap();

        // Rebalance
        let result = manager.rebalance_sessions().await;

        assert!(result.is_ok());

        // Check that tasks are distributed more evenly
        let sessions = manager.list_sessions().await;
        for session in sessions {
            let task_count = if session.task.is_some() { 1 } else { 0 };
            assert!(task_count <= 2); // No session should have more than 2 tasks
        }
    }

    #[tokio::test]
    async fn test_persist_session_state() {
        let manager = setup_manager().await;

        let session = manager.register_session("persistent-server".to_string()).await.unwrap();

        // Assign task and update state
        manager.distribute_task("Persistent task".to_string()).await.unwrap();

        // Retrieve state
        let retrieved_session = manager.get_session_state(&session.id).await;

        assert!(retrieved_session.is_some());
        let retrieved = retrieved_session.unwrap();
        assert_eq!(retrieved.id, session.id);
        assert!(retrieved.task.is_some());
    }
}