use rusqlite::{Connection, Result};

pub fn initialize(conn: &Connection) -> Result<()> {
    // Create projects table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            path TEXT NOT NULL UNIQUE,
            description TEXT,
            color TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_accessed DATETIME,
            is_favorite BOOLEAN DEFAULT 0,
            settings TEXT
        )",
        [],
    )?;

    // Create servers table with project association
    conn.execute(
        "CREATE TABLE IF NOT EXISTS servers (
            id TEXT PRIMARY KEY,
            project_id TEXT,
            host TEXT NOT NULL,
            port INTEGER NOT NULL,
            status TEXT,
            process_id INTEGER,
            working_dir TEXT,
            started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            stopped_at DATETIME,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
        )",
        [],
    )?;

    // Create sessions table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            server_id TEXT,
            project_id TEXT,
            title TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_active DATETIME,
            FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
        )",
        [],
    )?;

    // Create app settings table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    // Create indexes for better performance
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_servers_project ON servers(project_id)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_projects_last_accessed ON projects(last_accessed)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_projects_favorite ON projects(is_favorite)",
        [],
    )?;

    Ok(())
}