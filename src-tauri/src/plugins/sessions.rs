use crate::database::DatabaseManager;
use chrono::Utc;
use rusqlite::{params, OptionalExtension, Result, Row};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginSession {
    pub id: String,
    pub project_id: String,
    pub plugin_id: String,
    pub title: String,
    pub working_directory: String,
    pub model: String,
    pub permission_mode: String,
    pub created_at: String,
    pub last_active: Option<String>,
    pub status: String,
    pub config: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateSessionRequest {
    pub project_id: String,
    pub plugin_id: String,
    pub title: String,
    pub working_directory: String,
    pub model: String,
    pub permission_mode: Option<String>,
    pub config: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateSessionRequest {
    pub title: Option<String>,
    pub last_active: Option<String>,
    pub status: Option<String>,
    pub config: Option<String>,
}

pub struct PluginSessionManager<'a> {
    db: &'a DatabaseManager,
}

impl<'a> PluginSessionManager<'a> {
    pub fn new(db: &'a DatabaseManager) -> Self {
        Self { db }
    }

    pub fn create(&self, session_id: String, request: CreateSessionRequest) -> Result<PluginSession> {
        let created_at = Utc::now().to_rfc3339();
        let permission_mode = request.permission_mode.unwrap_or_else(|| "default".to_string());

        let conn = self.db.connection();
        let conn = conn.lock().unwrap();
        conn.execute(
            "INSERT INTO plugin_sessions (
                id, project_id, plugin_id, title, working_directory,
                model, permission_mode, created_at, last_active, status, config
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                &session_id,
                &request.project_id,
                &request.plugin_id,
                &request.title,
                &request.working_directory,
                &request.model,
                &permission_mode,
                &created_at,
                &created_at,
                "active",
                &request.config
            ],
        )?;

        self.get(&session_id)?.ok_or_else(|| {
            rusqlite::Error::QueryReturnedNoRows
        })
    }

    pub fn get(&self, session_id: &str) -> Result<Option<PluginSession>> {
        let conn = self.db.connection();
        let conn = conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, project_id, plugin_id, title, working_directory,
                    model, permission_mode, created_at, last_active, status, config
             FROM plugin_sessions WHERE id = ?1"
        )?;

        let session = stmt.query_row([session_id], |row| {
            self.row_to_session(row)
        }).optional()?;

        Ok(session)
    }

    pub fn list_by_project(&self, project_id: &str, status_filter: Option<&str>) -> Result<Vec<PluginSession>> {
        let conn = self.db.connection();
        let conn = conn.lock().unwrap();

        let (query, params): (String, Vec<&str>) = if let Some(status) = status_filter {
            (
                "SELECT id, project_id, plugin_id, title, working_directory,
                        model, permission_mode, created_at, last_active, status, config
                 FROM plugin_sessions
                 WHERE project_id = ?1 AND status = ?2
                 ORDER BY last_active DESC NULLS LAST, created_at DESC".to_string(),
                vec![project_id, status]
            )
        } else {
            (
                "SELECT id, project_id, plugin_id, title, working_directory,
                        model, permission_mode, created_at, last_active, status, config
                 FROM plugin_sessions
                 WHERE project_id = ?1
                 ORDER BY last_active DESC NULLS LAST, created_at DESC".to_string(),
                vec![project_id]
            )
        };

        let mut stmt = conn.prepare(&query)?;
        let sessions = stmt.query_map(rusqlite::params_from_iter(params), |row| {
            self.row_to_session(row)
        })?
        .collect::<Result<Vec<_>>>()?;

        Ok(sessions)
    }

    pub fn update(&self, session_id: &str, request: UpdateSessionRequest) -> Result<Option<PluginSession>> {
        let conn = self.db.connection();
        let conn = conn.lock().unwrap();

        let mut updates = Vec::new();
        let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        if let Some(ref title) = request.title {
            updates.push("title = ?");
            params.push(Box::new(title.clone()));
        }

        if let Some(ref last_active) = request.last_active {
            updates.push("last_active = ?");
            params.push(Box::new(last_active.clone()));
        }

        if let Some(ref status) = request.status {
            updates.push("status = ?");
            params.push(Box::new(status.clone()));
        }

        if let Some(ref config) = request.config {
            updates.push("config = ?");
            params.push(Box::new(config.clone()));
        }

        if updates.is_empty() {
            return self.get(session_id);
        }

        params.push(Box::new(session_id.to_string()));

        let query = format!(
            "UPDATE plugin_sessions SET {} WHERE id = ?",
            updates.join(", ")
        );

        let params_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();
        let rows_affected = conn.execute(&query, &params_refs[..])?;

        if rows_affected > 0 {
            self.get(session_id)
        } else {
            Ok(None)
        }
    }

    pub fn update_last_active(&self, session_id: &str) -> Result<()> {
        let conn = self.db.connection();
        let conn = conn.lock().unwrap();
        let now = Utc::now().to_rfc3339();

        conn.execute(
            "UPDATE plugin_sessions SET last_active = ?1 WHERE id = ?2",
            params![&now, session_id],
        )?;

        Ok(())
    }

    pub fn archive(&self, session_id: &str) -> Result<bool> {
        let conn = self.db.connection();
        let conn = conn.lock().unwrap();

        let rows_affected = conn.execute(
            "UPDATE plugin_sessions SET status = 'archived' WHERE id = ?1",
            params![session_id],
        )?;

        Ok(rows_affected > 0)
    }

    pub fn delete(&self, session_id: &str) -> Result<bool> {
        let conn = self.db.connection();
        let conn = conn.lock().unwrap();

        let rows_affected = conn.execute(
            "DELETE FROM plugin_sessions WHERE id = ?1",
            params![session_id],
        )?;

        Ok(rows_affected > 0)
    }

    pub fn delete_old_archived(&self, days: i64) -> Result<usize> {
        let conn = self.db.connection();
        let conn = conn.lock().unwrap();

        let cutoff_date = Utc::now() - chrono::Duration::days(days);
        let cutoff_str = cutoff_date.to_rfc3339();

        let rows_affected = conn.execute(
            "DELETE FROM plugin_sessions
             WHERE status = 'archived' AND last_active < ?1",
            params![&cutoff_str],
        )?;

        Ok(rows_affected)
    }

    fn row_to_session(&self, row: &Row) -> Result<PluginSession> {
        Ok(PluginSession {
            id: row.get(0)?,
            project_id: row.get(1)?,
            plugin_id: row.get(2)?,
            title: row.get(3)?,
            working_directory: row.get(4)?,
            model: row.get(5)?,
            permission_mode: row.get(6)?,
            created_at: row.get(7)?,
            last_active: row.get(8)?,
            status: row.get(9)?,
            config: row.get(10)?,
        })
    }
}
