use crate::database::DatabaseManager;
use crate::projects::types::{CreateProjectRequest, Project, ProjectSettings, UpdateProjectRequest};
use chrono::Utc;
use rusqlite::{params, OptionalExtension, Result, Row};
use uuid::Uuid;

pub struct ProjectsManager<'a> {
    db: &'a DatabaseManager,
}

impl<'a> ProjectsManager<'a> {
    pub fn new(db: &'a DatabaseManager) -> Self {
        Self { db }
    }

    pub fn create(&self, request: CreateProjectRequest) -> Result<Project> {
        let id = Uuid::new_v4().to_string();
        let created_at = Utc::now().to_rfc3339();

        let conn = self.db.connection();
        let conn = conn.lock().unwrap();
        conn.execute(
            "INSERT INTO projects (id, name, path, description, color, created_at, is_favorite, settings)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                &id,
                &request.name,
                &request.path,
                &request.description,
                &request.color,
                &created_at,
                false,
                serde_json::to_string(&ProjectSettings::default()).ok()
            ],
        )?;

        self.get(&id)?.ok_or_else(|| {
            rusqlite::Error::QueryReturnedNoRows
        })
    }

    pub fn get(&self, id: &str) -> Result<Option<Project>> {
        let conn = self.db.connection();
        let conn = conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, path, description, color, created_at, last_accessed, is_favorite, settings
             FROM projects WHERE id = ?1"
        )?;

        let project = stmt.query_row([id], |row| {
            self.row_to_project(row)
        }).optional()?;

        Ok(project)
    }

    pub fn get_by_path(&self, path: &str) -> Result<Option<Project>> {
        let conn = self.db.connection();
        let conn = conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, path, description, color, created_at, last_accessed, is_favorite, settings
             FROM projects WHERE path = ?1"
        )?;

        let project = stmt.query_row([path], |row| {
            self.row_to_project(row)
        }).optional()?;

        Ok(project)
    }

    pub fn list(&self) -> Result<Vec<Project>> {
        let conn = self.db.connection();
        let conn = conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, path, description, color, created_at, last_accessed, is_favorite, settings
             FROM projects
             ORDER BY is_favorite DESC, last_accessed DESC NULLS LAST, created_at DESC"
        )?;

        let projects = stmt.query_map([], |row| {
            self.row_to_project(row)
        })?
        .collect::<Result<Vec<_>>>()?;

        Ok(projects)
    }

    pub fn list_favorites(&self) -> Result<Vec<Project>> {
        let conn = self.db.connection();
        let conn = conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, path, description, color, created_at, last_accessed, is_favorite, settings
             FROM projects
             WHERE is_favorite = 1
             ORDER BY last_accessed DESC NULLS LAST, created_at DESC"
        )?;

        let projects = stmt.query_map([], |row| {
            self.row_to_project(row)
        })?
        .collect::<Result<Vec<_>>>()?;

        Ok(projects)
    }

    pub fn list_recent(&self, limit: usize) -> Result<Vec<Project>> {
        let conn = self.db.connection();
        let conn = conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, path, description, color, created_at, last_accessed, is_favorite, settings
             FROM projects
             WHERE last_accessed IS NOT NULL
             ORDER BY last_accessed DESC
             LIMIT ?1"
        )?;

        let projects = stmt.query_map([limit], |row| {
            self.row_to_project(row)
        })?
        .collect::<Result<Vec<_>>>()?;

        Ok(projects)
    }

    pub fn update(&self, id: &str, request: UpdateProjectRequest) -> Result<Option<Project>> {
        let conn = self.db.connection();
        let conn = conn.lock().unwrap();

        // Build dynamic update query based on provided fields
        let mut updates = Vec::new();
        let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        if let Some(ref name) = request.name {
            updates.push("name = ?");
            params.push(Box::new(name.clone()));
        }

        if let Some(ref description) = request.description {
            updates.push("description = ?");
            params.push(Box::new(description.clone()));
        }

        if let Some(ref color) = request.color {
            updates.push("color = ?");
            params.push(Box::new(color.clone()));
        }

        if let Some(is_favorite) = request.is_favorite {
            updates.push("is_favorite = ?");
            params.push(Box::new(is_favorite));
        }

        if let Some(ref settings) = request.settings {
            updates.push("settings = ?");
            params.push(Box::new(serde_json::to_string(settings).ok()));
        }

        if updates.is_empty() {
            return self.get(id);
        }

        // Add id as the last parameter
        params.push(Box::new(id.to_string()));

        let query = format!(
            "UPDATE projects SET {} WHERE id = ?",
            updates.join(", ")
        );

        let params_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();
        let rows_affected = conn.execute(&query, &params_refs[..])?;

        if rows_affected > 0 {
            self.get(id)
        } else {
            Ok(None)
        }
    }

    pub fn update_last_accessed(&self, id: &str) -> Result<()> {
        let conn = self.db.connection();
        let conn = conn.lock().unwrap();
        let now = Utc::now().to_rfc3339();

        conn.execute(
            "UPDATE projects SET last_accessed = ?1 WHERE id = ?2",
            params![&now, id],
        )?;

        Ok(())
    }

    pub fn delete(&self, id: &str) -> Result<bool> {
        let conn = self.db.connection();
        let conn = conn.lock().unwrap();
        let rows_affected = conn.execute(
            "DELETE FROM projects WHERE id = ?1",
            params![id],
        )?;

        Ok(rows_affected > 0)
    }

    pub fn exists(&self, path: &str) -> Result<bool> {
        let conn = self.db.connection();
        let conn = conn.lock().unwrap();
        let count: i32 = conn.query_row(
            "SELECT COUNT(*) FROM projects WHERE path = ?1",
            params![path],
            |row| row.get(0),
        )?;

        Ok(count > 0)
    }

    fn row_to_project(&self, row: &Row) -> Result<Project> {
        let settings_json: Option<String> = row.get(8)?;
        let settings = settings_json
            .and_then(|json| serde_json::from_str(&json).ok());

        Ok(Project {
            id: row.get(0)?,
            name: row.get(1)?,
            path: row.get(2)?,
            description: row.get(3)?,
            color: row.get(4)?,
            created_at: row.get(5)?,
            last_accessed: row.get(6)?,
            is_favorite: row.get(7)?,
            settings,
        })
    }
}