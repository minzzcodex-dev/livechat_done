import Database from 'better-sqlite3';
import { nanoid } from 'nanoid';
const db = new Database('data/livechat.sqlite');
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  visitor_name TEXT,
  visitor_email TEXT,
  user_agent TEXT,
  ip TEXT,
  closed INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);
`);
export const createSession = (payload) => {
    const id = payload.id ?? nanoid(10);
    const now = new Date().toISOString();
    const s = {
        id,
        created_at: now,
        last_seen_at: now,
        visitor_name: payload.visitor_name,
        visitor_email: payload.visitor_email,
        user_agent: payload.user_agent,
        ip: payload.ip,
        closed: 0,
    };
    db.prepare(`INSERT INTO sessions (id, created_at, last_seen_at, visitor_name, visitor_email, user_agent, ip, closed)
     VALUES (@id, @created_at, @last_seen_at, @visitor_name, @visitor_email, @user_agent, @ip, @closed)`).run(s);
    return s;
};
export const touchSession = (id) => {
    db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').run(new Date().toISOString(), id);
};
export const getSession = (id) => db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
export const listOpenSessions = (limit = 20) => db
    .prepare('SELECT * FROM sessions WHERE closed = 0 ORDER BY last_seen_at DESC LIMIT ?')
    .all(limit);
export const addMessage = (session_id, role, text) => {
    const msg = { id: nanoid(12), session_id, role, text, created_at: new Date().toISOString() };
    db.prepare('INSERT INTO messages (id, session_id, role, text, created_at) VALUES (@id, @session_id, @role, @text, @created_at)').run(msg);
    touchSession(session_id);
    return msg;
};
export const getMessages = (session_id, limit = 100) => db
    .prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC LIMIT ?')
    .all(session_id, limit);
export const closeSession = (session_id) => db.prepare('UPDATE sessions SET closed = 1 WHERE id = ?').run(session_id);
