pub mod opencode;
pub mod session;
pub mod wezterm;
pub mod pty;
pub mod database;
pub mod projects;

#[cfg(feature = "tauri-app")]
mod tauri_app {
    use crate::opencode::{OpenCodeServer, OpenCodeService};
    use crate::session::{SessionManager, OrchestratorSession};
    use crate::wezterm::WezTermController;
    use crate::pty::{PtyManager, TerminalSession};
    use crate::database::DatabaseManager;
    use std::sync::{Arc, Mutex};
    use tauri::{Manager, State};

    struct AppState {
        opencode_service: Arc<OpenCodeService>,
        wezterm_controller: Arc<WezTermController>,
        session_manager: Arc<SessionManager>,
        pty_manager: Arc<Mutex<PtyManager>>,
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
            "port": server.port
        }))
    }

    #[cfg_attr(mobile, tauri::mobile_entry_point)]
    pub fn run() {
        let opencode_service = Arc::new(OpenCodeService::new());
        let wezterm_controller = Arc::new(WezTermController::new());
        let session_manager = Arc::new(SessionManager::new(
            opencode_service.clone(),
            wezterm_controller.clone(),
        ));
        let pty_manager = Arc::new(Mutex::new(PtyManager::new()));

        let app_state = AppState {
            opencode_service,
            wezterm_controller,
            session_manager,
            pty_manager: pty_manager.clone(),
        };

        tauri::Builder::default()
            .plugin(tauri_plugin_opener::init())
            .plugin(tauri_plugin_dialog::init())
            .invoke_handler(tauri::generate_handler![
                spawn_opencode_server,
                spawn_opencode_sdk_server,
                list_opencode_servers,
                stop_opencode_server,
                kill_all_servers,
                scan_for_servers,
                health_check_server,
                create_wezterm_domain,
                open_terminal_for_server,
                register_session,
                list_sessions,
                distribute_task,
                create_terminal,
                write_to_terminal,
                resize_terminal,
                kill_terminal,
                get_server_details,
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
