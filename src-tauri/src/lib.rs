pub mod opencode;
pub mod session;
pub mod wezterm;
pub mod tmux;
pub mod pty;
pub mod database;
pub mod projects;
pub mod queue;

#[cfg(feature = "tauri-app")]
mod tauri_app {
    use crate::opencode::{OpenCodeServer, OpenCodeService};
    use crate::session::{SessionManager, OrchestratorSession};
    use crate::wezterm::{WezTermController, WezTermWindow, MirrorManager, WezTermMirror};
    use crate::tmux::{TmuxManager, TmuxSession, TmuxOutput};
    use crate::pty::{PtyManager, TerminalSession};
    use crate::database::DatabaseManager;
    use crate::queue::{QueueClient, WorkerService, QueueConfig, WorkerInfo, TaskMessage, TaskType, TaskResult, LocalTestMode};
    use std::sync::{Arc, Mutex};
    use tokio::sync::Mutex as AsyncMutex;
    use tauri::{Manager, State};

    struct AppState {
        opencode_service: Arc<OpenCodeService>,
        wezterm_controller: Arc<WezTermController>,
        wezterm_mirror_manager: Arc<AsyncMutex<MirrorManager>>,
        tmux_manager: Arc<AsyncMutex<TmuxManager>>,
        session_manager: Arc<SessionManager>,
        pty_manager: Arc<Mutex<PtyManager>>,
        queue_client: Arc<dyn QueueClient>,
        worker_service: Option<Arc<WorkerService>>,
        local_test_mode: Arc<AsyncMutex<Option<LocalTestMode>>>,
    }

    #[tauri::command]
    async fn spawn_opencode_server(port: u16, working_dir: Option<String>, state: State<'_, AppState>) -> Result<OpenCodeServer, String> {
        state.opencode_service.spawn_server(port, working_dir).await
    }
    #[tauri::command]
    async fn spawn_opencode_sdk_server(port: u16, model: Option<String>, working_dir: Option<String>, state: State<'_, AppState>) -> Result<OpenCodeServer, String> {
        state.opencode_service.spawn_sdk_server(port, model, working_dir).await
    }

    #[tauri::command]
    async fn spawn_opencode_tui_server(port: u16, model: Option<String>, working_dir: Option<String>, state: State<'_, AppState>) -> Result<OpenCodeServer, String> {
        state.opencode_service.spawn_tui_server(port, model, working_dir).await
    }

    #[tauri::command]
    async fn list_opencode_servers(state: State<'_, AppState>) -> Result<Vec<OpenCodeServer>, String> {
        Ok(state.opencode_service.list_servers().await)
    }

    #[tauri::command]
    async fn stop_opencode_server(server_id: String, state: State<'_, AppState>) -> Result<(), String> {
        state.opencode_service.stop_server(&server_id).await
    }

    #[tauri::command]
    async fn kill_all_servers(state: State<'_, AppState>) -> Result<usize, String> {
        println!("Kill all servers command invoked");
        let count = state.opencode_service.kill_all_servers().await?;
        println!("Successfully killed {} servers and processes", count);
        Ok(count)
    }

    #[tauri::command]
    async fn scan_for_servers(start_port: u16, end_port: u16, state: State<'_, AppState>) -> Result<Vec<OpenCodeServer>, String> {
        println!("Scanning for servers on ports {}-{}", start_port, end_port);
        state.opencode_service.scan_for_servers(start_port, end_port).await
    }

    #[tauri::command]
    async fn health_check_server(server_id: String, state: State<'_, AppState>) -> Result<bool, String> {
        state.opencode_service.health_check(&server_id).await
    }

    #[tauri::command]
    async fn create_wezterm_domain(
        name: &str,
        address: &str,
        username: &str,
        state: State<'_, AppState>,
    ) -> Result<crate::wezterm::WezTermDomain, String> {
        state.wezterm_controller.create_ssh_domain(name, address, username).await
    }

    #[tauri::command]
    async fn open_terminal_for_server(server_id: String, state: State<'_, AppState>) -> Result<(), String> {
        println!("Opening terminal for server: {}", server_id);

        // Get the server details
        let server = state.opencode_service.get_server(&server_id).await
            .ok_or_else(|| format!("Server {} not found", server_id))?;

        // Spawn WezTerm with OpenCode TUI connected to the server
        state.wezterm_controller.spawn_opencode_terminal(&server.host, server.port).await
    }

    #[tauri::command]
    async fn spawn_wezterm_embedded(port: u16, state: State<'_, AppState>) -> Result<String, String> {
        println!("Spawning embedded WezTerm on port: {}", port);
        state.wezterm_controller.spawn_embedded_opencode_terminal(port, None).await
    }

    #[tauri::command]
    async fn register_session(server_id: String, state: State<'_, AppState>) -> Result<OrchestratorSession, String> {
        println!("Registering session for server_id: {}", server_id);
        let result = state.session_manager.register_session(server_id).await;
        match &result {
            Ok(session) => println!("Session created successfully: {}", session.id),
            Err(e) => println!("Failed to create session: {}", e),
        }
        result
    }

    #[tauri::command]
    async fn list_sessions(state: State<'_, AppState>) -> Result<Vec<OrchestratorSession>, String> {
        let sessions = state.session_manager.list_sessions().await;
        println!("Listing sessions: found {} sessions", sessions.len());
        for session in &sessions {
            println!("  - Session {}: server={}, status={:?}", session.id, session.opencode_server_id, session.status);
        }
        Ok(sessions)
    }

    #[tauri::command]
    async fn distribute_task(prompt: String, state: State<'_, AppState>) -> Result<String, String> {
        println!("Distributing task with prompt: {}", prompt);
        let result = state.session_manager.distribute_task(prompt).await;
        match &result {
            Ok(task_id) => println!("Task distributed successfully with ID: {}", task_id),
            Err(e) => println!("Failed to distribute task: {}", e),
        }
        result
    }

    #[tauri::command]
    async fn create_terminal(
        rows: u16,
        cols: u16,
        server_id: Option<String>,
        session_id: Option<String>,
        state: State<'_, AppState>,
    ) -> Result<TerminalSession, String> {
        // Clone the Arc to avoid holding the lock across await
        let pty_manager = state.pty_manager.clone();
        let pty = pty_manager.lock().unwrap();
        // Call the synchronous version
        pty.create_terminal_sync(rows, cols, server_id, session_id)
    }

    #[tauri::command]
    async fn write_to_terminal(
        terminal_id: String,
        data: String,
        state: State<'_, AppState>,
    ) -> Result<(), String> {
        // Clone the Arc to avoid holding the lock across await
        let pty_manager = state.pty_manager.clone();
        let pty = pty_manager.lock().unwrap();
        // Call the synchronous version
        pty.write_to_terminal_sync(&terminal_id, &data)
    }

    #[tauri::command]
    async fn resize_terminal(
        terminal_id: String,
        cols: u16,
        rows: u16,
        state: State<'_, AppState>,
    ) -> Result<(), String> {
        // Clone the Arc to avoid holding the lock across await
        let pty_manager = state.pty_manager.clone();
        let pty = pty_manager.lock().unwrap();
        // Call the synchronous version
        pty.resize_terminal_sync(&terminal_id, cols, rows)
    }

    #[tauri::command]
    async fn kill_terminal(
        terminal_id: String,
        state: State<'_, AppState>,
    ) -> Result<(), String> {
        // Clone the Arc to avoid holding the lock across await
        let pty_manager = state.pty_manager.clone();
        let pty = pty_manager.lock().unwrap();
        // Call the synchronous version
        pty.kill_terminal_sync(&terminal_id)
    }

    #[tauri::command]
    async fn get_server_details(
        server_id: String,
        state: State<'_, AppState>,
    ) -> Result<serde_json::Value, String> {
        let server = state.opencode_service.get_server(&server_id).await
            .ok_or_else(|| format!("Server {} not found", server_id))?;

        Ok(serde_json::json!({
            "host": server.host,
            "port": server.port,
            "working_dir": server.working_dir
        }))
    }

    #[tauri::command]
    async fn enable_distributed_mode(enable: bool, state: State<'_, AppState>) -> Result<(), String> {
        state.opencode_service.enable_distributed_mode(enable).await;
        Ok(())
    }

    #[tauri::command]
    async fn get_active_workers(state: State<'_, AppState>) -> Result<Vec<WorkerInfo>, String> {
        state.queue_client.get_active_workers().await
    }

    #[tauri::command]
    async fn publish_task(task_type: String, payload: serde_json::Value, state: State<'_, AppState>) -> Result<String, String> {
        let task_type = match task_type.as_str() {
            "run_command" => TaskType::RunCommand,
            "create_session" => TaskType::CreateSession,
            "execute_code" => TaskType::ExecuteCode,
            "health_check" => TaskType::HealthCheck,
            "file_operation" => TaskType::FileOperation,
            custom => TaskType::Custom(custom.to_string()),
        };

        let task = TaskMessage::new(task_type, payload);
        let task_id = task.id.clone();
        state.queue_client.publish_task(task).await?;
        Ok(task_id)
    }

    #[tauri::command]
    async fn get_task_result(task_id: String, state: State<'_, AppState>) -> Result<Option<TaskResult>, String> {
        state.queue_client.consume_result(&task_id).await
    }

    #[tauri::command]
    async fn start_worker_service(state: State<'_, AppState>) -> Result<(), String> {
        if let Some(ref worker) = state.worker_service {
            worker.start().await
        } else {
            Err("Worker service not initialized".to_string())
        }
    }

    #[tauri::command]
    async fn stop_worker_service(state: State<'_, AppState>) -> Result<(), String> {
        if let Some(ref worker) = state.worker_service {
            worker.stop().await
        } else {
            Err("Worker service not initialized".to_string())
        }
    }

    #[tauri::command]
    async fn start_local_test_mode(num_workers: usize, state: State<'_, AppState>) -> Result<(), String> {
        let mut test_mode_guard = state.local_test_mode.lock().await;

        if test_mode_guard.is_none() {
            let mut test_mode = LocalTestMode::new(state.opencode_service.clone());
            test_mode.start(num_workers).await?;

            // Update the main queue client to use the test mode's queue
            // This is a simplified approach - in production you'd handle this differently
            *test_mode_guard = Some(test_mode);
        } else {
            return Err("Local test mode already running".to_string());
        }

        Ok(())
    }

    #[tauri::command]
    async fn stop_local_test_mode(state: State<'_, AppState>) -> Result<(), String> {
        let mut test_mode_guard = state.local_test_mode.lock().await;

        if let Some(test_mode) = test_mode_guard.as_ref() {
            test_mode.stop().await?;
            *test_mode_guard = None;
            Ok(())
        } else {
            Err("Local test mode not running".to_string())
        }
    }

    #[tauri::command]
    async fn simulate_distributed_task(task_type: String, state: State<'_, AppState>) -> Result<String, String> {
        let test_mode_guard = state.local_test_mode.lock().await;

        if let Some(test_mode) = test_mode_guard.as_ref() {
            test_mode.simulate_task(&task_type).await
        } else {
            Err("Local test mode not running".to_string())
        }
    }

    #[tauri::command]
    async fn get_local_test_stats(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
        let test_mode_guard = state.local_test_mode.lock().await;

        if let Some(test_mode) = test_mode_guard.as_ref() {
            Ok(test_mode.get_stats().await)
        } else {
            Ok(serde_json::json!({
                "mode": "local_test",
                "running": false,
                "message": "Local test mode not running"
            }))
        }
    }

    // WezTerm window management commands
    #[tauri::command]
    async fn spawn_wezterm_for_project(
        project_id: String,
        working_dir: String,
        state: State<'_, AppState>,
    ) -> Result<WezTermWindow, String> {
        state.wezterm_controller.spawn_window_for_project(&project_id, &working_dir).await
    }

    #[tauri::command]
    async fn list_project_wezterm_windows(
        project_id: String,
        state: State<'_, AppState>,
    ) -> Result<Vec<WezTermWindow>, String> {
        state.wezterm_controller.list_project_windows(&project_id).await
    }

    #[tauri::command]
    async fn close_wezterm_window(
        window_id: String,
        state: State<'_, AppState>,
    ) -> Result<(), String> {
        state.wezterm_controller.close_window(&window_id).await
    }

    #[tauri::command]
    async fn send_text_to_wezterm(
        window_id: String,
        text: String,
        state: State<'_, AppState>,
    ) -> Result<(), String> {
        state.wezterm_controller.send_text_to_window(&window_id, &text).await
    }

    #[tauri::command]
    async fn execute_command_in_wezterm(
        window_id: String,
        command: String,
        state: State<'_, AppState>,
    ) -> Result<String, String> {
        state.wezterm_controller.execute_command_with_output(&window_id, &command).await
    }

    #[tauri::command]
    async fn focus_wezterm_window(
        state: State<'_, AppState>,
    ) -> Result<(), String> {
        state.wezterm_controller.focus_wezterm_window().await
    }

    #[tauri::command]
    async fn list_all_wezterm_windows(
        state: State<'_, AppState>,
    ) -> Result<Vec<WezTermWindow>, String> {
        state.wezterm_controller.list_all_windows().await
    }

    // WezTerm Mirror Commands
    #[tauri::command]
    async fn start_wezterm_mirror(
        project_path: String,
        state: State<'_, AppState>,
    ) -> Result<WezTermMirror, String> {
        let mirror_manager = state.wezterm_mirror_manager.lock().await;
        mirror_manager.create_mirror(&project_path).await
    }

    #[tauri::command]
    async fn stop_wezterm_mirror(
        mirror_id: String,
        state: State<'_, AppState>,
    ) -> Result<(), String> {
        let mirror_manager = state.wezterm_mirror_manager.lock().await;
        mirror_manager.stop_mirror(&mirror_id).await
    }

    #[tauri::command]
    async fn send_input_to_mirror(
        mirror_id: String,
        text: String,
        state: State<'_, AppState>,
    ) -> Result<(), String> {
        let mirror_manager = state.wezterm_mirror_manager.lock().await;
        mirror_manager.send_input(&mirror_id, &text).await
    }

    #[tauri::command]
    async fn get_mirror_content(
        mirror_id: String,
        state: State<'_, AppState>,
    ) -> Result<String, String> {
        let mirror_manager = state.wezterm_mirror_manager.lock().await;
        mirror_manager.get_mirror_content(&mirror_id).await
    }

    #[tauri::command]
    async fn list_mirrors(
        state: State<'_, AppState>,
    ) -> Result<Vec<WezTermMirror>, String> {
        let mirror_manager = state.wezterm_mirror_manager.lock().await;
        Ok(mirror_manager.list_mirrors().await)
    }

    // Tmux Commands
    #[tauri::command]
    async fn create_tmux_session(
        project_path: String,
        state: State<'_, AppState>,
    ) -> Result<TmuxSession, String> {
        let tmux_manager = state.tmux_manager.lock().await;
        tmux_manager.create_session(&project_path).await
    }

    #[tauri::command]
    async fn kill_tmux_session(
        session_id: String,
        state: State<'_, AppState>,
    ) -> Result<(), String> {
        let tmux_manager = state.tmux_manager.lock().await;
        tmux_manager.kill_session(&session_id).await
    }

    #[tauri::command]
    async fn send_tmux_keys(
        session_id: String,
        keys: String,
        state: State<'_, AppState>,
    ) -> Result<(), String> {
        let tmux_manager = state.tmux_manager.lock().await;
        tmux_manager.send_keys(&session_id, &keys).await
    }

    #[tauri::command]
    async fn send_tmux_command(
        session_id: String,
        command: String,
        state: State<'_, AppState>,
    ) -> Result<(), String> {
        let tmux_manager = state.tmux_manager.lock().await;
        tmux_manager.send_command(&session_id, &command).await
    }

    #[tauri::command]
    async fn capture_tmux_pane(
        session_id: String,
        state: State<'_, AppState>,
    ) -> Result<String, String> {
        let tmux_manager = state.tmux_manager.lock().await;
        tmux_manager.capture_pane(&session_id).await
    }

    #[tauri::command]
    async fn list_tmux_sessions(
        state: State<'_, AppState>,
    ) -> Result<Vec<TmuxSession>, String> {
        let tmux_manager = state.tmux_manager.lock().await;
        Ok(tmux_manager.list_sessions().await)
    }

    #[cfg_attr(mobile, tauri::mobile_entry_point)]
    pub fn run() {
        let queue_config = QueueConfig::default();
        let queue_client = crate::queue::client::create_queue_client(queue_config.clone());

        let opencode_service = Arc::new(OpenCodeService::new().with_queue_client(queue_client.clone()));
        let wezterm_controller = Arc::new(WezTermController::new());
        let session_manager = Arc::new(SessionManager::new(
            opencode_service.clone(),
            wezterm_controller.clone(),
        ));
        let pty_manager = Arc::new(Mutex::new(PtyManager::new()));

        let worker_service = Some(Arc::new(WorkerService::new(
            queue_client.clone(),
            opencode_service.clone(),
            queue_config,
        )));

        let mirror_manager = Arc::new(AsyncMutex::new(MirrorManager::new()));
        let tmux_manager = Arc::new(AsyncMutex::new(TmuxManager::new()));

        let app_state = AppState {
            opencode_service,
            wezterm_controller,
            wezterm_mirror_manager: mirror_manager.clone(),
            tmux_manager: tmux_manager.clone(),
            session_manager,
            pty_manager: pty_manager.clone(),
            queue_client,
            worker_service,
            local_test_mode: Arc::new(AsyncMutex::new(None)),
        };

        tauri::Builder::default()
            .plugin(tauri_plugin_opener::init())
            .plugin(tauri_plugin_dialog::init())
            .invoke_handler(tauri::generate_handler![
                spawn_opencode_server,
                spawn_opencode_sdk_server,
                spawn_opencode_tui_server,
                list_opencode_servers,
                stop_opencode_server,
                kill_all_servers,
                scan_for_servers,
                health_check_server,
                create_wezterm_domain,
                open_terminal_for_server,
                spawn_wezterm_embedded,
                register_session,
                list_sessions,
                distribute_task,
                create_terminal,
                write_to_terminal,
                resize_terminal,
                kill_terminal,
                get_server_details,
                enable_distributed_mode,
                get_active_workers,
                publish_task,
                get_task_result,
                start_worker_service,
                stop_worker_service,
                start_local_test_mode,
                stop_local_test_mode,
                simulate_distributed_task,
                get_local_test_stats,
                spawn_wezterm_for_project,
                list_project_wezterm_windows,
                close_wezterm_window,
                send_text_to_wezterm,
                execute_command_in_wezterm,
                focus_wezterm_window,
                list_all_wezterm_windows,
                start_wezterm_mirror,
                stop_wezterm_mirror,
                send_input_to_mirror,
                get_mirror_content,
                list_mirrors,
                create_tmux_session,
                kill_tmux_session,
                send_tmux_keys,
                send_tmux_command,
                capture_tmux_pane,
                list_tmux_sessions,
                crate::projects::create_project,
                crate::projects::get_project,
                crate::projects::get_project_by_path,
                crate::projects::list_projects,
                crate::projects::list_favorite_projects,
                crate::projects::list_recent_projects,
                crate::projects::update_project,
                crate::projects::update_project_last_accessed,
                crate::projects::delete_project,
                crate::projects::project_exists,
            ])
            .setup(move |app| {
                // Initialize database
                let db_manager = DatabaseManager::new(&app.handle())
                    .expect("Failed to initialize database");
                app.manage(db_manager);

                // Manage app state
                app.manage(app_state);
                // Set up PTY manager with app handle
                pty_manager.lock().unwrap().set_app_handle(app.handle().clone());
                // Set up MirrorManager with app handle
                {
                    let handle = app.handle();
                    let state: State<AppState> = handle.state();
                    let mirror_manager = state.wezterm_mirror_manager.clone();
                    tauri::async_runtime::block_on(async move {
                        mirror_manager.lock().await.set_app_handle(handle.clone());
                    });
                }
                // Set up TmuxManager with app handle
                {
                    let handle = app.handle();
                    let state: State<AppState> = handle.state();
                    let tmux_manager = state.tmux_manager.clone();
                    tauri::async_runtime::block_on(async move {
                        tmux_manager.lock().await.set_app_handle(handle.clone());
                    });
                }

                if let Some(window) = app.get_webview_window("main") {
                    // Maximize the window on launch
                    let _ = window.maximize();
                }

                Ok(())
            })
            .run(tauri::generate_context!())
            .expect("error while running tauri application");
    }
}

#[cfg(feature = "tauri-app")]
pub use tauri_app::run;
