use super::{CodingAgentPlugin, types::*};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

/// Manages all registered coding agent plugins
pub struct PluginManager {
    plugins: Arc<RwLock<HashMap<String, Box<dyn CodingAgentPlugin>>>>,
    active_plugin: Arc<RwLock<Option<String>>>,
    servers: Arc<RwLock<HashMap<String, AgentServer>>>,
    sessions: Arc<RwLock<HashMap<String, AgentSession>>>,
}

impl PluginManager {
    pub fn new() -> Self {
        Self {
            plugins: Arc::new(RwLock::new(HashMap::new())),
            active_plugin: Arc::new(RwLock::new(None)),
            servers: Arc::new(RwLock::new(HashMap::new())),
            sessions: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Register a new plugin
    pub async fn register_plugin(&self, plugin: Box<dyn CodingAgentPlugin>) -> Result<(), String> {
        let plugin_id = plugin.get_id().to_string();
        let mut plugins = self.plugins.write().await;

        if plugins.contains_key(&plugin_id) {
            return Err(format!("Plugin '{}' is already registered", plugin_id));
        }

        println!("Registering plugin: {}", plugin_id);
        plugins.insert(plugin_id.clone(), plugin);

        // If no active plugin, set this as active
        let mut active = self.active_plugin.write().await;
        if active.is_none() {
            *active = Some(plugin_id);
        }

        Ok(())
    }

    /// Get a plugin by ID (returns None if plugin doesn't exist)
    pub async fn has_plugin(&self, plugin_id: &str) -> bool {
        let plugins = self.plugins.read().await;
        plugins.contains_key(plugin_id)
    }

    /// Get the currently active plugin
    pub async fn get_active_plugin(&self) -> Result<String, String> {
        let active = self.active_plugin.read().await;
        active.clone().ok_or_else(|| "No active plugin set".to_string())
    }

    /// Set the active plugin
    pub async fn set_active_plugin(&self, plugin_id: &str) -> Result<(), String> {
        let plugins = self.plugins.read().await;
        if !plugins.contains_key(plugin_id) {
            return Err(format!("Plugin '{}' not found", plugin_id));
        }

        let mut active = self.active_plugin.write().await;
        *active = Some(plugin_id.to_string());
        println!("Active plugin set to: {}", plugin_id);

        Ok(())
    }

    /// List all registered plugins
    pub async fn list_plugins(&self) -> Vec<PluginConfig> {
        let plugins = self.plugins.read().await;
        plugins.values().map(|p| p.get_config().clone()).collect()
    }

    /// Spawn a server using the active plugin
    pub async fn spawn_server(
        &self,
        port: u16,
        model: Option<String>,
        working_dir: Option<String>,
    ) -> Result<AgentServer, String> {
        let plugin_id = self.get_active_plugin().await?;
        self.spawn_server_with_plugin(&plugin_id, port, model, working_dir).await
    }

    /// Spawn a server using a specific plugin
    pub async fn spawn_server_with_plugin(
        &self,
        plugin_id: &str,
        port: u16,
        model: Option<String>,
        working_dir: Option<String>,
    ) -> Result<AgentServer, String> {
        let plugins = self.plugins.read().await;
        let plugin = plugins.get(plugin_id)
            .ok_or_else(|| format!("Plugin '{}' not found", plugin_id))?;

        let server = plugin.spawn_server(port, model, working_dir).await?;

        // Store server info
        let mut servers = self.servers.write().await;
        servers.insert(server.id.clone(), server.clone());

        Ok(server)
    }

    /// Stop a server
    pub async fn stop_server(&self, server_id: &str) -> Result<(), String> {
        let servers = self.servers.read().await;
        let server = servers.get(server_id)
            .ok_or_else(|| format!("Server '{}' not found", server_id))?;

        let plugin_id = &server.plugin_id;
        let plugins = self.plugins.read().await;
        let plugin = plugins.get(plugin_id)
            .ok_or_else(|| format!("Plugin '{}' not found", plugin_id))?;

        plugin.stop_server(server_id).await?;

        // Remove from our records
        drop(servers);
        let mut servers = self.servers.write().await;
        servers.remove(server_id);

        Ok(())
    }

    /// Create a session
    pub async fn create_session(
        &self,
        server_id: &str,
        session_config: HashMap<String, serde_json::Value>,
    ) -> Result<AgentSession, String> {
        let servers = self.servers.read().await;
        let server = servers.get(server_id)
            .ok_or_else(|| format!("Server '{}' not found", server_id))?;

        let plugin_id = &server.plugin_id;
        let plugins = self.plugins.read().await;
        let plugin = plugins.get(plugin_id)
            .ok_or_else(|| format!("Plugin '{}' not found", plugin_id))?;

        let session = plugin.create_session(server_id, session_config).await?;

        // Store session info
        let mut sessions = self.sessions.write().await;
        sessions.insert(session.id.clone(), session.clone());

        Ok(session)
    }

    /// Send a command to a session
    pub async fn send_command(
        &self,
        session_id: &str,
        command: &str,
        context: Option<HashMap<String, String>>,
    ) -> Result<AgentResponse, String> {
        let sessions = self.sessions.read().await;
        let session = sessions.get(session_id)
            .ok_or_else(|| format!("Session '{}' not found", session_id))?;

        let plugin_id = &session.plugin_id;
        let plugins = self.plugins.read().await;
        let plugin = plugins.get(plugin_id)
            .ok_or_else(|| format!("Plugin '{}' not found", plugin_id))?;

        plugin.send_command(session_id, command, context).await
    }

    /// List all servers
    pub async fn list_servers(&self) -> Vec<AgentServer> {
        let servers = self.servers.read().await;
        servers.values().cloned().collect()
    }

    /// List all sessions
    pub async fn list_sessions(&self) -> Vec<AgentSession> {
        let sessions = self.sessions.read().await;
        sessions.values().cloned().collect()
    }

    /// Get a server by ID
    pub async fn get_server(&self, server_id: &str) -> Option<AgentServer> {
        let servers = self.servers.read().await;
        servers.get(server_id).cloned()
    }

    /// Health check for a server
    pub async fn health_check(&self, server_id: &str) -> Result<bool, String> {
        let servers = self.servers.read().await;
        let server = servers.get(server_id)
            .ok_or_else(|| format!("Server '{}' not found", server_id))?;

        let plugin_id = &server.plugin_id;
        let plugins = self.plugins.read().await;
        let plugin = plugins.get(plugin_id)
            .ok_or_else(|| format!("Plugin '{}' not found", plugin_id))?;

        plugin.health_check(server_id).await
    }

    /// Handle tool approval for Sensei integration
    pub async fn handle_tool_approval(
        &self,
        session_id: &str,
        tool_use: &ToolUse,
        approved: bool,
    ) -> Result<(), String> {
        let sessions = self.sessions.read().await;
        let session = sessions.get(session_id)
            .ok_or_else(|| format!("Session '{}' not found", session_id))?;

        let plugin_id = &session.plugin_id;
        let plugins = self.plugins.read().await;
        let plugin = plugins.get(plugin_id)
            .ok_or_else(|| format!("Plugin '{}' not found", plugin_id))?;

        plugin.handle_tool_approval(session_id, tool_use, approved).await
    }
}