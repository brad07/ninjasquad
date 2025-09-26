use super::types::*;
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use uuid::Uuid;
use std::io::{Read, Write};
use tauri::{AppHandle, Emitter};

pub struct PtySession {
    pub id: String,
    pub reader_thread: Option<std::thread::JoinHandle<()>>,
}

pub struct PtyManager {
    sessions: Arc<Mutex<HashMap<String, PtySession>>>,
    writers: Arc<Mutex<HashMap<String, Box<dyn Write + Send>>>>,
    app_handle: Option<AppHandle>,
}

impl PtyManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
            writers: Arc::new(Mutex::new(HashMap::new())),
            app_handle: None,
        }
    }

    pub fn set_app_handle(&mut self, handle: AppHandle) {
        self.app_handle = Some(handle);
    }

    pub fn create_terminal_sync(
        &self,
        rows: u16,
        cols: u16,
        _server_id: Option<String>,
        _session_id: Option<String>,
    ) -> Result<TerminalSession, String> {
        let pty_system = native_pty_system();

        let pty_size = PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        };

        let pair = pty_system
            .openpty(pty_size)
            .map_err(|e| format!("Failed to open PTY: {}", e))?;

        let mut cmd = CommandBuilder::new(std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string()));

        // Set up environment
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");

        // Unset npm_config_prefix to avoid nvm/volta conflicts
        cmd.env_remove("npm_config_prefix");

        let _child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("Failed to spawn shell: {}", e))?;

        let terminal_id = Uuid::new_v4().to_string();
        let terminal_session = TerminalSession {
            id: terminal_id.clone(),
            rows,
            cols,
        };

        // Set up reader thread
        let mut reader = pair.master.try_clone_reader()
            .map_err(|e| format!("Failed to clone reader: {}", e))?;

        let app_handle_clone = self.app_handle.clone();
        let terminal_id_clone = terminal_id.clone();

        let reader_thread = std::thread::spawn(move || {
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break, // EOF
                    Ok(n) => {
                        let data = String::from_utf8_lossy(&buf[..n]).to_string();

                        // Emit terminal output event
                        if let Some(handle) = &app_handle_clone {
                            let _ = handle.emit(&format!("terminal-output-{}", terminal_id_clone), data);
                        }
                    }
                    Err(e) => {
                        eprintln!("Error reading from PTY: {}", e);
                        break;
                    }
                }
            }
        });

        // Create a writer for the terminal
        let writer = pair.master.take_writer()
            .map_err(|e| format!("Failed to get writer: {}", e))?;

        // Store writer
        self.writers.lock().unwrap().insert(terminal_id.clone(), Box::new(writer));

        let pty_session = PtySession {
            id: terminal_id.clone(),
            reader_thread: Some(reader_thread),
        };

        self.sessions.lock().unwrap().insert(terminal_id.clone(), pty_session);

        Ok(terminal_session)
    }

    pub fn write_to_terminal_sync(&self, terminal_id: &str, data: &str) -> Result<(), String> {
        // Check if session exists
        if !self.sessions.lock().unwrap().contains_key(terminal_id) {
            return Err(format!("Terminal session {} not found", terminal_id));
        }

        // Get the writer and write to it
        let mut writers = self.writers.lock().unwrap();
        if let Some(writer) = writers.get_mut(terminal_id) {
            writer.write_all(data.as_bytes())
                .map_err(|e| format!("Failed to write to terminal: {}", e))?;
            Ok(())
        } else {
            Err(format!("Writer for terminal {} not found", terminal_id))
        }
    }

    pub fn resize_terminal_sync(&self, terminal_id: &str, _cols: u16, _rows: u16) -> Result<(), String> {
        // For now, we'll skip resize functionality as it requires keeping the master PTY
        // This is a limitation of the current implementation
        if self.sessions.lock().unwrap().contains_key(terminal_id) {
            // TODO: Implement resize when we have a better PTY management strategy
            Ok(())
        } else {
            Err(format!("Terminal session {} not found", terminal_id))
        }
    }

    pub fn kill_terminal_sync(&self, terminal_id: &str) -> Result<(), String> {
        let mut session = self.sessions.lock().unwrap().remove(terminal_id)
            .ok_or_else(|| format!("Terminal session {} not found", terminal_id))?;

        // The reader thread will exit on its own when the PTY is closed
        if let Some(thread) = session.reader_thread.take() {
            // We can't really wait for the thread in this context
            // but it will clean up on its own
            drop(thread);
        }

        // Remove the writer
        self.writers.lock().unwrap().remove(terminal_id);

        Ok(())
    }

    pub async fn get_server_details(&self, _server_id: &str) -> Result<(String, u16), String> {
        // This would typically query the OpenCode service for server details
        // For now, returning placeholder values
        // You'll need to integrate this with your OpenCodeService
        Ok(("localhost".to_string(), 4096))
    }
}