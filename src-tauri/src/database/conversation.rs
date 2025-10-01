use rusqlite::{Connection, Result, params};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct ConversationMessage {
    pub id: String,
    pub session_id: String,
    pub role: String,
    pub content: String,
    pub timestamp: String,
}

/// Add a message to the conversation history
pub fn add_message(
    conn: &Connection,
    id: &str,
    session_id: &str,
    role: &str,
    content: &str,
    timestamp: &str,
) -> Result<()> {
    conn.execute(
        "INSERT INTO conversation_messages (id, session_id, role, content, timestamp)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, session_id, role, content, timestamp],
    )?;
    Ok(())
}

/// Get all messages for a session, ordered by timestamp
pub fn get_session_messages(
    conn: &Connection,
    session_id: &str,
) -> Result<Vec<ConversationMessage>> {
    let mut stmt = conn.prepare(
        "SELECT id, session_id, role, content, timestamp
         FROM conversation_messages
         WHERE session_id = ?1
         ORDER BY timestamp ASC",
    )?;

    let messages = stmt
        .query_map([session_id], |row| {
            Ok(ConversationMessage {
                id: row.get(0)?,
                session_id: row.get(1)?,
                role: row.get(2)?,
                content: row.get(3)?,
                timestamp: row.get(4)?,
            })
        })?
        .collect::<Result<Vec<_>>>()?;

    Ok(messages)
}

/// Get recent messages for a session (with limit)
pub fn get_recent_messages(
    conn: &Connection,
    session_id: &str,
    limit: usize,
) -> Result<Vec<ConversationMessage>> {
    let mut stmt = conn.prepare(
        "SELECT id, session_id, role, content, timestamp
         FROM conversation_messages
         WHERE session_id = ?1
         ORDER BY timestamp DESC
         LIMIT ?2",
    )?;

    let mut messages = stmt
        .query_map(params![session_id, limit], |row| {
            Ok(ConversationMessage {
                id: row.get(0)?,
                session_id: row.get(1)?,
                role: row.get(2)?,
                content: row.get(3)?,
                timestamp: row.get(4)?,
            })
        })?
        .collect::<Result<Vec<_>>>()?;

    // Reverse to get chronological order
    messages.reverse();
    Ok(messages)
}

/// Count messages in a session
pub fn count_messages(conn: &Connection, session_id: &str) -> Result<usize> {
    let count: usize = conn.query_row(
        "SELECT COUNT(*) FROM conversation_messages WHERE session_id = ?1",
        [session_id],
        |row| row.get(0),
    )?;
    Ok(count)
}

/// Delete all messages for a session
pub fn delete_session_messages(conn: &Connection, session_id: &str) -> Result<()> {
    conn.execute(
        "DELETE FROM conversation_messages WHERE session_id = ?1",
        [session_id],
    )?;
    Ok(())
}

/// Delete old messages (keep only most recent N)
pub fn trim_session_messages(
    conn: &Connection,
    session_id: &str,
    keep_count: usize,
) -> Result<()> {
    conn.execute(
        "DELETE FROM conversation_messages
         WHERE session_id = ?1
         AND id NOT IN (
             SELECT id FROM conversation_messages
             WHERE session_id = ?1
             ORDER BY timestamp DESC
             LIMIT ?2
         )",
        params![session_id, keep_count],
    )?;
    Ok(())
}
