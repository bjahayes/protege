import Database from "better-sqlite3";
import fs from "fs";
import { DATA_DIR, DB_PATH, OLD_DB_PATH } from "./config";

// Reuse across HMR reloads in dev.
const g = globalThis as unknown as { __bwDb?: Database.Database };

export function getDb(): Database.Database {
  if (g.__bwDb) return g.__bwDb;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  // Keep the history of an install from before the rename.
  if (!fs.existsSync(DB_PATH) && fs.existsSync(OLD_DB_PATH)) {
    for (const ext of ["", "-wal", "-shm"]) if (fs.existsSync(OLD_DB_PATH + ext)) fs.renameSync(OLD_DB_PATH + ext, DB_PATH + ext);
  }
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      path TEXT PRIMARY KEY,
      name TEXT,
      source TEXT,
      tags TEXT,
      created_at INTEGER,
      last_seen INTEGER
    );
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      project_path TEXT,
      project_name TEXT,
      prompt TEXT,
      status TEXT,
      kind TEXT DEFAULT 'run',
      session_id TEXT,
      model TEXT,
      started_at INTEGER,
      ended_at INTEGER,
      input_tokens INTEGER,
      output_tokens INTEGER,
      cost_usd REAL,
      num_turns INTEGER,
      error TEXT,
      cwd TEXT,
      worktree_state TEXT DEFAULT 'none',
      worktree_path TEXT,
      branch TEXT,
      base_ref TEXT
    );
    CREATE TABLE IF NOT EXISTS job_events (
      job_id TEXT,
      seq INTEGER,
      ts INTEGER,
      type TEXT,
      payload TEXT,
      PRIMARY KEY (job_id, seq)
    );
    CREATE INDEX IF NOT EXISTS idx_jobs_project ON jobs(project_path);
    CREATE INDEX IF NOT EXISTS idx_jobs_started ON jobs(started_at);
  `);
  // Migrate older DBs that predate the newer columns.
  const cols = new Set((db.prepare(`PRAGMA table_info(jobs)`).all() as any[]).map((c) => c.name));
  const addCol = (name: string, def: string) => {
    if (!cols.has(name)) db.exec(`ALTER TABLE jobs ADD COLUMN ${name} ${def}`);
  };
  addCol("kind", "TEXT DEFAULT 'run'");
  addCol("cwd", "TEXT");
  addCol("worktree_state", "TEXT DEFAULT 'none'");
  addCol("worktree_path", "TEXT");
  addCol("branch", "TEXT");
  addCol("base_ref", "TEXT");
  addCol("parent_job_id", "TEXT");
  addCol("auto_resume_count", "INTEGER");
  addCol("eval_score", "INTEGER");
  addCol("eval_verdict", "TEXT");
  addCol("eval_reason", "TEXT");
  addCol("checks_passed", "INTEGER");
  addCol("checks_command", "TEXT");
  g.__bwDb = db;
  return db;
}

export function registerProject(p: string, name: string) {
  const db = getDb();
  const now = Date.now();
  db.prepare(
    `INSERT INTO projects (path, name, source, tags, created_at, last_seen)
     VALUES (?, ?, 'registered', '[]', ?, ?)
     ON CONFLICT(path) DO UPDATE SET name = excluded.name, last_seen = excluded.last_seen`
  ).run(p, name, now, now);
}

export function unregisterProject(p: string) {
  getDb().prepare(`DELETE FROM projects WHERE path = ?`).run(p);
}
