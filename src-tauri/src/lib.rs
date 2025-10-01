pub mod opencode;
pub mod session;
pub mod wezterm;
pub mod tmux;
pub mod pty;
pub mod database;
pub mod projects;
pub mod queue;
pub mod plugins;
pub mod claude;
pub mod slack;

#[cfg(feature = "tauri-app")]
mod tauri_app {
    use crate::opencode::{OpenCodeServer, OpenCodeService};
    use crate::session::{SessionManager, OrchestratorSession};
    use crate::wezterm::{WezTermController, WezTermWindow, MirrorManager, WezTermMirror};
    use crate::tmux::{TmuxManager, TmuxSession};
    use crate::pty::{PtyManager, TerminalSession};
    use crate::database::DatabaseManager;
    use crate::queue::{QueueClient, WorkerService, QueueConfig, WorkerInfo, TaskMessage, TaskType, TaskResult, LocalTestMode};
    use crate::plugins::manager::PluginManager;
    use crate::claude::{ClaudeProcessManager, ClaudeSession, ClaudeAgentService};
    use crate::slack::{SlackService, SlackConfig, SlackApprovalRequest, SlackMessage};
    use std::sync::{Arc, Mutex};
    use tokio::sync::Mutex as AsyncMutex;
    use tauri::{Manager, State, Emitter};

    struct AppState {
        opencode_service: Arc<OpenCodeService>,
        wezterm_controller: Arc<WezTermController>,
        wezterm_mirror_manager: Arc<AsyncMutex<MirrorManager>>,
        tmux_manager: Arc<AsyncMutex<TmuxManager>>,
        session_manager: Arc<SessionManager>,
        claude_manager: Arc<ClaudeProcessManager>,
        pty_manager: Arc<Mutex<PtyManager>>,
        queue_client: Arc<dyn QueueClient>,
        worker_service: Option<Arc<WorkerService>>,
        local_test_mode: Arc<AsyncMutex<Option<LocalTestMode>>>,
        plugin_manager: Arc<AsyncMutex<PluginManager>>,
        slack_service: Arc<SlackService>,
        claude_agent_service: Arc<ClaudeAgentService>,
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
    async fn get_ninja_squad_processes(state: State<'_, AppState>) -> Result<Vec<serde_json::Value>, String> {
        let servers = state.opencode_service.list_servers().await;
        let result: Vec<serde_json::Value> = servers
            .into_iter()
            .filter(|s| s.process_id.is_some()) // Only servers we spawned have PIDs
            .map(|s| {
                serde_json::json!({
                    "id": s.id,
                    "type": if s.id.starts_with("tui-") { "opencode-tui" } else { "opencode" },
                    "port": s.port,
                    "pid": s.process_id,
                    "status": format!("{:?}", s.status),
                    "working_dir": s.working_dir
                })
            })
            .collect();

        // Note: Claude Code processes would need separate tracking
        // Currently we're only tracking OpenCode processes spawned by Ninja Squad
        Ok(result)
    }

    #[tauri::command]
    async fn kill_ninja_squad_processes_only(state: State<'_, AppState>) -> Result<usize, String> {
        println!("Killing only Ninja Squad spawned processes");
        let count = state.opencode_service.kill_tracked_servers_only().await?;
        println!("Successfully killed {} Ninja Squad processes", count);
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

    // Git Commands
    #[tauri::command]
    async fn get_git_diff(
        file_path: Option<String>,
        working_dir: String,
    ) -> Result<String, String> {
        use std::process::Command;

        let mut cmd = Command::new("git");
        cmd.arg("diff");

        // Add specific file if provided
        if let Some(path) = file_path {
            cmd.arg("--").arg(path);
        }

        // Set working directory
        cmd.current_dir(&working_dir);

        // Execute git diff
        let output = cmd.output()
            .map_err(|e| format!("Failed to execute git diff: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Git diff failed: {}", stderr));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        Ok(stdout.to_string())
    }

    #[tauri::command]
    async fn get_git_changed_files(
        working_dir: String,
    ) -> Result<Vec<String>, String> {
        use std::process::Command;

        let mut cmd = Command::new("git");
        cmd.args(&["diff", "--name-only"]);
        cmd.current_dir(&working_dir);

        let output = cmd.output()
            .map_err(|e| format!("Failed to execute git diff: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Git diff failed: {}", stderr));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let files: Vec<String> = stdout
            .lines()
            .filter(|line| !line.is_empty())
            .map(|line| line.to_string())
            .collect();

        Ok(files)
    }

    // Browser Automation
    #[tauri::command]
    async fn open_browser(url: String) -> Result<(), String> {
        use std::process::Command;

        // Get the path to the browser script
        let resource_path = std::path::PathBuf::from("scripts/browser-launcher.ts");

        if !resource_path.exists() {
            return Err(format!(
                "Browser launcher script not found at {:?}",
                resource_path
            ));
        }

        // Launch browser using npx tsx
        Command::new("npx")
            .arg("tsx")
            .arg(&resource_path)
            .arg(&url)
            .spawn()
            .map_err(|e| format!("Failed to launch browser: {}", e))?;

        Ok(())
    }

    #[tauri::command]
    async fn launch_playwright_browser(url: String, headless: bool) -> Result<(), String> {
        use std::process::Command;

        // Get the path to the browser script
        let resource_path = std::path::PathBuf::from("scripts/browser-launcher.ts");

        if !resource_path.exists() {
            return Err(format!(
                "Browser launcher script not found at {:?}",
                resource_path
            ));
        }

        // Launch browser using npx tsx with headless parameter
        Command::new("npx")
            .arg("tsx")
            .arg(&resource_path)
            .arg(&url)
            .arg(headless.to_string())
            .spawn()
            .map_err(|e| format!("Failed to launch Playwright browser: {}", e))?;

        Ok(())
    }

    // Dev Server Process Management
    #[tauri::command]
    async fn spawn_dev_server(
        command: String,
        working_dir: String,
        app_handle: tauri::AppHandle,
    ) -> Result<u32, String> {
        use std::process::{Command, Stdio};

        // Spawn the process in the background with piped stdout/stderr
        let mut child = Command::new("sh")
            .arg("-c")
            .arg(&command)
            .current_dir(&working_dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to spawn dev server: {}", e))?;

        let pid = child.id();

        // Stream stdout in a background task
        if let Some(stdout) = child.stdout.take() {
            use std::io::{BufRead, BufReader};
            let app_handle_clone = app_handle.clone();
            tokio::spawn(async move {
                let reader = BufReader::new(stdout);
                for line in reader.lines() {
                    if let Ok(line) = line {
                        let _ = app_handle_clone.emit("dev-server-output", line);
                    }
                }
            });
        }

        // Stream stderr in a background task
        if let Some(stderr) = child.stderr.take() {
            use std::io::{BufRead, BufReader};
            let app_handle_clone = app_handle.clone();
            tokio::spawn(async move {
                let reader = BufReader::new(stderr);
                for line in reader.lines() {
                    if let Ok(line) = line {
                        let _ = app_handle_clone.emit("dev-server-error", line);
                    }
                }
            });
        }

        // Wait for process to exit in background
        tokio::spawn(async move {
            let _ = child.wait();
        });

        Ok(pid)
    }

    // Dev Server Terminal Spawning (legacy - opens external terminal)
    #[tauri::command]
    async fn spawn_external_terminal(
        command: String,
        working_dir: String,
        title: String,
    ) -> Result<u32, String> {
        use std::process::Command;

        #[cfg(target_os = "macos")]
        {
            // Use osascript to spawn Terminal.app with the command
            // Escape single quotes and backslashes for AppleScript
            let escaped_dir = working_dir.replace("\\", "\\\\").replace("'", "\\'");
            let escaped_title = title.replace("\\", "\\\\").replace("'", "\\'");
            let escaped_command = command.replace("\\", "\\\\").replace("'", "\\'");

            let script = format!(
                r#"tell application "Terminal"
    activate
    do script "cd '{}' && printf '\\033]0;{}\\007' && {}"
end tell"#,
                escaped_dir, escaped_title, escaped_command
            );

            let output = Command::new("osascript")
                .arg("-e")
                .arg(&script)
                .output()
                .map_err(|e| format!("Failed to spawn terminal: {}", e))?;

            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                return Err(format!("Failed to execute terminal command: {}", stderr));
            }

            // Terminal.app doesn't easily give us the PID, so return 0 as a placeholder
            Ok(0)
        }

        #[cfg(target_os = "linux")]
        {
            // Try common Linux terminal emulators
            let terminals = vec![
                ("gnome-terminal", vec!["--working-directory", &working_dir, "--title", &title, "--", "bash", "-c", &command]),
                ("konsole", vec!["--workdir", &working_dir, "-p", &format!("tabtitle={}", title), "-e", "bash", "-c", &command]),
                ("xterm", vec!["-T", &title, "-e", &format!("cd {:?} && {}", working_dir, command)]),
            ];

            for (terminal, args) in terminals {
                if let Ok(mut child) = Command::new(terminal)
                    .args(&args)
                    .spawn()
                {
                    return Ok(child.id());
                }
            }

            Err("No compatible terminal emulator found".to_string())
        }

        #[cfg(target_os = "windows")]
        {
            // Use Windows Terminal or fallback to cmd
            let result = Command::new("wt")
                .arg("-d")
                .arg(&working_dir)
                .arg("--title")
                .arg(&title)
                .arg("cmd")
                .arg("/k")
                .arg(&command)
                .spawn();

            match result {
                Ok(mut child) => Ok(child.id()),
                Err(_) => {
                    // Fallback to cmd
                    let mut child = Command::new("cmd")
                        .arg("/c")
                        .arg("start")
                        .arg(&title)
                        .arg("cmd")
                        .arg("/k")
                        .arg(&format!("cd /d {} && {}", working_dir, command))
                        .spawn()
                        .map_err(|e| format!("Failed to spawn terminal: {}", e))?;

                    Ok(child.id())
                }
            }
        }

        #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
        {
            Err("Unsupported operating system".to_string())
        }
    }

    // Slack Commands
    #[tauri::command]
    async fn start_slack_service(
        app: tauri::AppHandle,
        state: State<'_, AppState>,
    ) -> Result<(), String> {
        state.slack_service.start(&app).await
            .map_err(|e| e.to_string())
    }

    #[tauri::command]
    async fn stop_slack_service(
        state: State<'_, AppState>,
    ) -> Result<(), String> {
        state.slack_service.stop().await
            .map_err(|e| e.to_string())
    }

    #[tauri::command]
    async fn initialize_slack(
        config: SlackConfig,
        state: State<'_, AppState>,
    ) -> Result<(), String> {
        state.slack_service.initialize(config).await
            .map_err(|e| e.to_string())
    }

    #[tauri::command]
    async fn send_slack_approval(
        request: SlackApprovalRequest,
        state: State<'_, AppState>,
    ) -> Result<(), String> {
        state.slack_service.send_approval_request(request).await
            .map_err(|e| e.to_string())
    }

    #[tauri::command]
    async fn send_slack_message(
        message: SlackMessage,
        state: State<'_, AppState>,
    ) -> Result<(), String> {
        state.slack_service.send_message(message).await
            .map_err(|e| e.to_string())
    }

    #[tauri::command]
    async fn shutdown_slack(
        state: State<'_, AppState>,
    ) -> Result<(), String> {
        state.slack_service.shutdown().await
            .map_err(|e| e.to_string())
    }

    #[tauri::command]
    async fn get_slack_status(
        state: State<'_, AppState>,
    ) -> Result<serde_json::Value, String> {
        state.slack_service.status().await
            .map_err(|e| e.to_string())
    }

    #[tauri::command]
    async fn get_slack_approvals(
        state: State<'_, AppState>,
        since: u64,
    ) -> Result<serde_json::Value, String> {
        state.slack_service.get_approvals(since).await
            .map_err(|e| e.to_string())
    }

    // Claude Agent Service commands
    #[tauri::command]
    async fn start_claude_agent_service(
        app: tauri::AppHandle,
        state: State<'_, AppState>,
    ) -> Result<(), String> {
        state.claude_agent_service.start(&app).await
            .map_err(|e| e.to_string())
    }

    #[tauri::command]
    async fn stop_claude_agent_service(
        state: State<'_, AppState>,
    ) -> Result<(), String> {
        state.claude_agent_service.stop().await
            .map_err(|e| e.to_string())
    }

    #[tauri::command]
    async fn initialize_claude_agent(
        api_key: String,
        model: Option<String>,
        state: State<'_, AppState>,
    ) -> Result<(), String> {
        state.claude_agent_service.initialize(api_key, model).await
            .map_err(|e| e.to_string())
    }

    #[tauri::command]
    async fn get_claude_agent_health(
        state: State<'_, AppState>,
    ) -> Result<serde_json::Value, String> {
        state.claude_agent_service.health_check().await
            .map_err(|e| e.to_string())
    }

    #[tauri::command]
    async fn shutdown_claude_agent(
        state: State<'_, AppState>,
    ) -> Result<(), String> {
        state.claude_agent_service.shutdown().await
            .map_err(|e| e.to_string())
    }

    #[tauri::command]
    async fn initialize_plugins(
        state: State<'_, AppState>,
    ) -> Result<(), String> {
        let pm = state.plugin_manager.lock().await;

        // Register OpenCode plugin if not already registered
        if !pm.has_plugin("opencode").await {
            let opencode_plugin = Box::new(crate::plugins::opencode::OpenCodePlugin::new());
            pm.register_plugin(opencode_plugin).await?;
            println!("Registered OpenCode plugin");
        } else {
            println!("OpenCode plugin already registered");
        }

        // Register Claude Code plugin if not already registered
        if !pm.has_plugin("claude-code").await {
            let claude_plugin = Box::new(crate::plugins::claude_code::ClaudeCodePlugin::new());
            pm.register_plugin(claude_plugin).await?;
            println!("Registered Claude Code plugin");
        } else {
            println!("Claude Code plugin already registered");
        }

        println!("Plugins initialization complete");
        Ok(())
    }

    #[tauri::command]
    async fn list_plugins(
        state: State<'_, AppState>,
    ) -> Result<Vec<crate::plugins::types::PluginConfig>, String> {
        let pm = state.plugin_manager.lock().await;
        Ok(pm.list_plugins().await)
    }

    #[tauri::command]
    async fn get_active_plugin(
        state: State<'_, AppState>,
    ) -> Result<String, String> {
        let pm = state.plugin_manager.lock().await;
        pm.get_active_plugin().await
    }

    #[tauri::command]
    async fn set_active_plugin(
        plugin_id: String,
        state: State<'_, AppState>,
    ) -> Result<(), String> {
        let pm = state.plugin_manager.lock().await;
        pm.set_active_plugin(&plugin_id).await
    }

    #[tauri::command]
    async fn check_claude_code_available() -> Result<bool, String> {
        // Check if Claude Code CLI is installed
        match std::process::Command::new("which")
            .arg("claude")
            .output()
        {
            Ok(output) => Ok(output.status.success()),
            Err(_) => Ok(false)
        }
    }

    // Linear-specific commands
    #[tauri::command]
    async fn update_linear_config(
        config: serde_json::Value,
        _state: State<'_, AppState>,
    ) -> Result<(), String> {
        println!("Linear config updated: {:?}", config);
        // Store config securely if needed
        Ok(())
    }

    #[tauri::command]
    async fn assign_issue_to_agent(
        assignment: serde_json::Value,
        _state: State<'_, AppState>,
    ) -> Result<(), String> {
        println!("Issue assigned to agent: {:?}", assignment);
        // Here we would integrate with the actual agent system
        Ok(())
    }

    #[tauri::command]
    async fn execute_agent_task(
        issue_id: String,
        agent_id: String,
        _issue: serde_json::Value,
        _plan: serde_json::Value,
        _state: State<'_, AppState>,
    ) -> Result<(), String> {
        println!("Executing task for issue {} with agent {}", issue_id, agent_id);
        // Here we would route to the appropriate agent
        Ok(())
    }

    #[tauri::command]
    async fn test_claude_ping() -> Result<String, String> {
        println!("test_claude_ping called");
        Ok("Claude test ping successful".to_string())
    }

    // New Claude session management commands
    #[tauri::command]
    async fn claude_create_session(
        state: State<'_, AppState>,
        project_id: String,
        working_directory: Option<String>,
        model: Option<String>
    ) -> Result<String, String> {
        println!("[claude_create_session] Creating session for project: {}", project_id);
        state.claude_manager.create_session(project_id, working_directory, model).await
    }

    #[tauri::command]
    async fn claude_send_message(
        state: State<'_, AppState>,
        session_id: String,
        message: String
    ) -> Result<String, String> {
        println!("[claude_send_message] Session: {}, Message length: {} chars", session_id, message.len());
        state.claude_manager.send_message(&session_id, message).await
    }

    #[tauri::command]
    async fn claude_close_session(
        state: State<'_, AppState>,
        session_id: String
    ) -> Result<(), String> {
        println!("[claude_close_session] Closing session: {}", session_id);
        state.claude_manager.close_session(&session_id).await
    }

    #[tauri::command]
    async fn claude_list_sessions(
        state: State<'_, AppState>
    ) -> Result<Vec<ClaudeSession>, String> {
        Ok(state.claude_manager.list_sessions().await)
    }

    #[tauri::command]
    async fn claude_get_session(
        state: State<'_, AppState>,
        session_id: String
    ) -> Result<Option<ClaudeSession>, String> {
        Ok(state.claude_manager.get_session(&session_id).await)
    }

    #[tauri::command]
    async fn claude_update_session_model(
        state: State<'_, AppState>,
        session_id: String,
        model: String
    ) -> Result<(), String> {
        println!("[claude_update_session_model] Updating session {} to model: {}", session_id, model);
        state.claude_manager.update_session_model(&session_id, model).await
    }

    // Legacy execute_claude_code - now uses session manager internally
    #[tauri::command]
    async fn execute_claude_code(
        state: State<'_, AppState>,
        prompt: String,
        model: Option<String>,
        working_directory: Option<String>
    ) -> Result<String, String> {
        // Legacy support - now uses the session manager for better efficiency
        println!("[execute_claude_code] Legacy call - creating temporary session");

        // Create a temporary session for this one-off command
        let session_id = state.claude_manager
            .create_session(
                "legacy-temp".to_string(),
                working_directory.clone(),
                model.clone()
            )
            .await?;

        // Send the message
        let response = state.claude_manager
            .send_message(&session_id, prompt)
            .await?;

        // Clean up the session
        let _ = state.claude_manager.close_session(&session_id).await;

        Ok(response)
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
        let plugin_manager = Arc::new(AsyncMutex::new(PluginManager::new()));
        let claude_manager = Arc::new(ClaudeProcessManager::new());
        let slack_service = Arc::new(SlackService::new(3456));
        let claude_agent_service = Arc::new(ClaudeAgentService::new(3457));

        // Initialize plugins will be done after app setup when we have an async runtime

        let app_state = AppState {
            opencode_service,
            wezterm_controller,
            wezterm_mirror_manager: mirror_manager.clone(),
            tmux_manager: tmux_manager.clone(),
            session_manager,
            claude_manager,
            pty_manager: pty_manager.clone(),
            queue_client,
            worker_service,
            local_test_mode: Arc::new(AsyncMutex::new(None)),
            plugin_manager,
            slack_service,
            claude_agent_service,
        };

        tauri::Builder::default()
            .plugin(tauri_plugin_opener::init())
            .plugin(tauri_plugin_dialog::init())
            .plugin(tauri_plugin_notification::init())
            .plugin(tauri_plugin_fs::init())
            .invoke_handler(tauri::generate_handler![
                spawn_opencode_server,
                spawn_opencode_sdk_server,
                spawn_opencode_tui_server,
                list_opencode_servers,
                stop_opencode_server,
                kill_all_servers,
                get_ninja_squad_processes,
                kill_ninja_squad_processes_only,
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
                get_git_diff,
                get_git_changed_files,
                open_browser,
                launch_playwright_browser,
                spawn_dev_server,
                spawn_external_terminal,
                start_slack_service,
                stop_slack_service,
                initialize_slack,
                send_slack_approval,
                send_slack_message,
                shutdown_slack,
                get_slack_status,
                get_slack_approvals,
                initialize_claude_agent,
                get_claude_agent_health,
                initialize_plugins,
                list_plugins,
                get_active_plugin,
                set_active_plugin,
                check_claude_code_available,
                execute_claude_code,
                claude_create_session,
                claude_send_message,
                claude_close_session,
                claude_list_sessions,
                claude_get_session,
                claude_update_session_model,
                test_claude_ping,
                start_claude_agent_service,
                stop_claude_agent_service,
                initialize_claude_agent,
                get_claude_agent_health,
                shutdown_claude_agent,
                update_linear_config,
                assign_issue_to_agent,
                execute_agent_task,
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

                // Start infrastructure services
                {
                    let handle = app.handle().clone();
                    let state: State<AppState> = handle.state();

                    // Start Slack service
                    let slack_service = state.slack_service.clone();
                    let handle_slack = handle.clone();
                    tauri::async_runtime::spawn(async move {
                        if let Err(e) = slack_service.start(&handle_slack).await {
                            eprintln!("Failed to start Slack service: {}", e);
                        }
                    });

                    // Start Claude Agent service
                    let claude_agent_service = state.claude_agent_service.clone();
                    let handle_claude = handle.clone();
                    tauri::async_runtime::spawn(async move {
                        if let Err(e) = claude_agent_service.start(&handle_claude).await {
                            eprintln!("Failed to start Claude Agent service: {}", e);
                        }
                    });
                }

                if let Some(window) = app.get_webview_window("main") {
                    // Maximize the window on launch
                    let _ = window.maximize();

                    // Set up cleanup on window close
                    let handle = app.handle().clone();
                    window.on_window_event(move |event| {
                        if let tauri::WindowEvent::CloseRequested { .. } = event {
                            println!("Application closing, cleaning up services...");
                            let state: State<AppState> = handle.state();

                            // Stop Slack service
                            let slack_service = state.slack_service.clone();
                            tauri::async_runtime::block_on(async move {
                                if let Err(e) = slack_service.shutdown().await {
                                    eprintln!("Failed to shutdown Slack service: {}", e);
                                } else {
                                    println!("Slack service stopped successfully");
                                }
                            });

                            // Stop Claude Agent service
                            let claude_agent_service = state.claude_agent_service.clone();
                            tauri::async_runtime::block_on(async move {
                                if let Err(e) = claude_agent_service.shutdown().await {
                                    eprintln!("Failed to shutdown Claude Agent service: {}", e);
                                } else {
                                    println!("Claude Agent service stopped successfully");
                                }
                            });

                            println!("Services cleanup completed");
                        }
                    });
                }

                Ok(())
            })
            .run(tauri::generate_context!())
            .expect("error while running tauri application");
    }
}

#[cfg(feature = "tauri-app")]
pub use tauri_app::run;
