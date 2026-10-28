// Server-only. The agents people make on the Agents page, alongside the built-in ones (agents.ts).
// Saved in Protégé's database. Every save is a new version, and each version is kept, so a run can
// always say exactly which instructions it was given.

import { randomUUID } from "crypto";
import { getDb } from "./store";
import { BUILT_IN_AGENTS, type AgentDef, type AgentKind } from "./agents";

let ready = false;
function db() {
  const d = getDb();
  if (!ready) {
    d.exec(`
      CREATE TABLE IF NOT EXISTS agent_versions (
        agent_id TEXT,
        version INTEGER,
        def TEXT,
        saved_at INTEGER,
        deleted INTEGER DEFAULT 0,
        PRIMARY KEY (agent_id, version)
      );
    `);
    ready = true;
  }
  return d;
}

const KINDS: AgentKind[] = ["document", "report", "plan", "change"];

/** The latest version of every agent people have made (not deleted). */
function customAgents(): AgentDef[] {
  const rows = db()
    .prepare(
      `SELECT v.* FROM agent_versions v
       JOIN (SELECT agent_id, MAX(version) AS version FROM agent_versions GROUP BY agent_id) m
         ON m.agent_id = v.agent_id AND m.version = v.version
       WHERE v.deleted = 0 ORDER BY v.saved_at DESC`
    )
    .all() as any[];
  return rows.map((r) => ({ ...JSON.parse(r.def), version: r.version, updatedAt: r.saved_at, builtIn: false }));
}

export function listAgents(): AgentDef[] {
  return [...BUILT_IN_AGENTS, ...customAgents()];
}

export function getAgent(id: string): AgentDef | null {
  return listAgents().find((a) => a.id === id) || null;
}

/** Every saved version of an agent someone made, newest first. */
export function agentHistory(id: string): { version: number; savedAt: number; def: AgentDef }[] {
  return (db().prepare(`SELECT * FROM agent_versions WHERE agent_id = ? ORDER BY version DESC`).all(id) as any[]).map((r) => ({
    version: r.version,
    savedAt: r.saved_at,
    def: { ...JSON.parse(r.def), version: r.version, builtIn: false },
  }));
}

export interface AgentInput {
  id?: string;
  name: string;
  emoji?: string;
  summary?: string;
  description?: string;
  kind: AgentKind;
  document?: string;
  instructions: string;
  inputLabel?: string;
}

/** Save an agent someone made: a new agent, or a new version of one. */
export function saveAgent(a: AgentInput): AgentDef {
  const name = String(a.name || "").trim();
  const instructions = String(a.instructions || "").trim();
  if (!name) throw new Error("Give the agent a name.");
  if (!instructions) throw new Error("Say what the agent should do.");
  if (!KINDS.includes(a.kind)) throw new Error("Choose what the agent may change.");
  if (a.id && BUILT_IN_AGENTS.some((b) => b.id === a.id)) throw new Error("Built-in agents can't be changed; make a copy instead.");
  let document = String(a.document || "").trim().replace(/\\/g, "/").replace(/^\.?\//, "");
  if (a.kind === "document" && !document) throw new Error("Say which document the agent keeps.");
  if (document && (document.includes("..") || /^[A-Za-z]:|^\//.test(document))) throw new Error("The document must be a file inside the project.");
  const id = a.id || `my-${randomUUID().slice(0, 8)}`;
  if (a.kind === "report") document = `.protege/reports/${id}.md`;
  const label = String(a.inputLabel || "").trim();
  const def: Omit<AgentDef, "version" | "builtIn"> = {
    id,
    name,
    emoji: String(a.emoji || "").trim() || "🤖",
    group: "mine",
    summary: String(a.summary || "").trim() || instructions.split(/(?<=[.!?])\s/)[0].slice(0, 140),
    description: String(a.description || "").trim(),
    kind: a.kind,
    document: a.kind === "document" || a.kind === "report" ? document : undefined,
    input: label ? { label, placeholder: "", required: false } : undefined,
    instructions,
  };
  const last = (db().prepare(`SELECT MAX(version) AS v FROM agent_versions WHERE agent_id = ?`).get(id) as any)?.v || 0;
  const now = Date.now();
  db().prepare(`INSERT INTO agent_versions (agent_id, version, def, saved_at) VALUES (?,?,?,?)`).run(id, last + 1, JSON.stringify(def), now);
  return { ...def, version: last + 1, updatedAt: now, builtIn: false };
}

/** Delete an agent someone made. Its versions stay, so past runs can still show what they were asked. */
export function deleteAgent(id: string) {
  const last = (db().prepare(`SELECT MAX(version) AS v FROM agent_versions WHERE agent_id = ?`).get(id) as any)?.v;
  if (last) db().prepare(`UPDATE agent_versions SET deleted = 1 WHERE agent_id = ? AND version = ?`).run(id, last);
}
