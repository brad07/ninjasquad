pub mod opencode;
pub mod session;
pub mod wezterm;

#[cfg(feature = "tauri-app")]
mod tauri_app {
    use crate::opencode::{OpenCodeServer, OpenCodeService};
    use crate::session::SessionManager;
    use crate::wezterm::WezTermController;
    use std::sync::Arc;
    use tauri::State;

    struct AppState {
        opencode_service: Arc<OpenCodeService>,
        wezterm_controller: Arc<WezTermController>,
        session_manager: Arc<SessionManager>,
    }

    #[tauri::command]
    async fn spawn_opencode_server(port: u16, state: State<'_, AppState>) -> Result<OpenCodeServer, String> {
        state.opencode_service.spawn_server(port).await
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
    async fn distribute_task(prompt: String, state: State<'_, AppState>) -> Result<String, String> {
        state.session_manager.distribute_task(prompt).await
    }

    #[cfg_attr(mobile, tauri::mobile_entry_point)]
    pub fn run() {
        let opencode_service = Arc::new(OpenCodeService::new());
        let wezterm_controller = Arc::new(WezTermController::new());
        let session_manager = Arc::new(SessionManager::new(
            opencode_service.clone(),
            wezterm_controller.clone(),
        ));

        let app_state = AppState {
            opencode_service,
            wezterm_controller,
            session_manager,
        };

        tauri::Builder::default()
            .manage(app_state)
            .plugin(tauri_plugin_opener::init())
            .invoke_handler(tauri::generate_handler![
                spawn_opencode_server,
                list_opencode_servers,
                stop_opencode_server,
                health_check_server,
                create_wezterm_domain,
                distribute_task,
            ])
            .run(tauri::generate_context!())
            .expect("error while running tauri application");
    }
}

#[cfg(feature = "tauri-app")]
pub use tauri_app::run;
