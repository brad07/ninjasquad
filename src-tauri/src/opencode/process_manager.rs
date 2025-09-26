use async_trait::async_trait;

#[async_trait]
pub trait ProcessManager: Send + Sync {
    async fn spawn_opencode_server(&self, port: u16) -> Result<u32, String>;
    async fn kill_process(&self, pid: u32) -> Result<(), String>;
    async fn check_process_health(&self, pid: u32) -> Result<bool, String>;
}

pub struct SystemProcessManager;

#[async_trait]
impl ProcessManager for SystemProcessManager {
    async fn spawn_opencode_server(&self, port: u16) -> Result<u32, String> {
        use tokio::process::Command;

        let child = Command::new("opencode")
            .arg("serve")
            .arg("-p")
            .arg(port.to_string())
            .arg("-h")
            .arg("127.0.0.1")
            .spawn()
            .map_err(|e| format!("Failed to spawn server: {}", e))?;

        Ok(child.id().unwrap_or(0))
    }

    async fn kill_process(&self, pid: u32) -> Result<(), String> {
        use tokio::process::Command;

        Command::new("kill")
            .arg(pid.to_string())
            .output()
            .await
            .map_err(|e| format!("Failed to kill process: {}", e))?;
        Ok(())
    }

    async fn check_process_health(&self, pid: u32) -> Result<bool, String> {
        use tokio::process::Command;

        let output = Command::new("kill")
            .arg("-0")
            .arg(pid.to_string())
            .output()
            .await
            .map_err(|e| format!("Failed to check process: {}", e))?;

        Ok(output.status.success())
    }
}

#[cfg(test)]
pub struct MockProcessManager {
    pub should_succeed: bool,
    pub spawned_ports: std::sync::Arc<std::sync::Mutex<Vec<u16>>>,
}

#[cfg(test)]
impl MockProcessManager {
    pub fn new(should_succeed: bool) -> Self {
        Self {
            should_succeed,
            spawned_ports: std::sync::Arc::new(std::sync::Mutex::new(Vec::new())),
        }
    }
}

#[cfg(test)]
#[async_trait]
impl ProcessManager for MockProcessManager {
    async fn spawn_opencode_server(&self, port: u16) -> Result<u32, String> {
        self.spawned_ports.lock().unwrap().push(port);
        if self.should_succeed {
            Ok(12345 + port as u32)
        } else {
            Err("Mock: Failed to spawn".to_string())
        }
    }

    async fn kill_process(&self, _pid: u32) -> Result<(), String> {
        if self.should_succeed {
            Ok(())
        } else {
            Err("Mock: Failed to kill".to_string())
        }
    }

    async fn check_process_health(&self, _pid: u32) -> Result<bool, String> {
        Ok(self.should_succeed)
    }
}