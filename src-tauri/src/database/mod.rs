use rusqlite::{Connection, Result};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager};

pub mod schema;
pub mod conversation;

pub struct DatabaseManager {
    conn: Arc<Mutex<Connection>>,
}

impl DatabaseManager {
    pub fn new(app_handle: &AppHandle) -> Result<Self> {
        // Get the app data directory
        let app_dir = app_handle
            .path()
            .app_data_dir()
            .expect("Failed to get app data directory");

        // Ensure the directory exists
        std::fs::create_dir_all(&app_dir).expect("Failed to create app data directory");

        // Create database path
        let db_path = app_dir.join("ninjasquad.db");

        // Open connection
        let conn = Connection::open(db_path)?;

        // Enable foreign keys
        conn.execute("PRAGMA foreign_keys = ON", [])?;

        // Initialize schema
        schema::initialize(&conn)?;

        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    pub fn connection(&self) -> Arc<Mutex<Connection>> {
        Arc::clone(&self.conn)
    }

    pub fn migrate(&self) -> Result<()> {
        // Run any migrations here in the future
        Ok(())
    }

    pub fn with_connection<F, R>(&self, f: F) -> Result<R>
    where
        F: FnOnce(&Connection) -> Result<R>,
    {
        let conn = self.conn.lock().unwrap();
        f(&*conn)
    }
}