// Client-safe (no Node imports). Turns Claude Code messages into chat items for the Chat page.
// The same function reads a saved session transcript and the live messages of a running chat,
// so a conversation looks the same whether it was opened from history or watched live.

/** `ts`: when it happened (from the saved transcript, or when a live item arrived), for the replay strip. */
export type ChatItem = (
  | { id: string; kind: "user"; text: string; images?: string[]; files?: string[]; midTurn?: boolean }
  | { id: string; kind: "text"; text: string }
  | { id: string; kind: "thinking"; text: string }
  | { id: string; kind: "tool"; toolUseId: string; name: string; input: any }
  | { id: string; kind: "tool_result"; toolUseId: string; text: string; isError?: boolean; images?: string[] }
  | { id: string; kind: "command"; text: string } // a slash command the person typed in Claude Code
  | {
      id: string;
      kind: "result";
      isError: boolean;
      /** The person stopped this turn. */
      stopped?: boolean;
      text?: string;
      subtype?: string;
      costUsd?: number;
      durationMs?: number;
      turns?: number;
    }
  | {
      id: string;
      kind: "permission";
      requestId: string;
      toolName: string;
      input: any;
      title?: string;
      description?: string;
      decisionReason?: string;
      canAlways?: boolean;
    }
  | { id: string; kind: "permission_done"; requestId: string; decision: "allow" | "always" | "deny" }
  | { id: string; kind: "error"; text: string }
) & { ts?: number };

const TEXT_CAP = 20_000;

/** How a saved attachment is named in a message (see chat-attach.ts); shown as a file chip. */
export const ATTACHED_PREFIX = "Attached file: ";

function splitAttached(text: string): { text: string; files: string[] } {
  const files: string[] = [];
  const kept = text.split("\n").filter((l) => {
    if (l.startsWith(ATTACHED_PREFIX)) {
      files.push(l.slice(ATTACHED_PREFIX.length).trim());
      return false;
    }
    return true;
  });
  return { text: kept.join("\n").trim(), files };
}
const INPUT_CAP = 12_000;

function cap(s: string, n = TEXT_CAP): string {
  const str = String(s ?? "");
  return str.length > n ? str.slice(0, n) + `\n… (${str.length - n} more characters)` : str;
}

/** Keep tool inputs small enough to send to the browser, but keep their shape. */
export function capInput(input: any): any {
  if (input == null || typeof input !== "object") return input;
  const out: any = Array.isArray(input) ? [] : {};
  for (const [k, v] of Object.entries(input)) {
    out[k] = typeof v === "string" ? cap(v, INPUT_CAP) : v;
  }
  return out;
}

function imageSrc(part: any): string | null {
  const src = part?.source;
  if (!src) return null;
  if (src.type === "base64" && src.data) return `data:${src.media_type || "image/png"};base64,${src.data}`;
  if (src.type === "url" && src.url) return src.url;
  return null;
}

function resultContent(content: any): { text: string; images: string[] } {
  if (typeof content === "string") return { text: content, images: [] };
  const texts: string[] = [];
  const images: string[] = [];
  if (Array.isArray(content)) {
    for (const p of content) {
      if (typeof p === "string") texts.push(p);
      else if (p?.type === "text") texts.push(p.text || "");
      else if (p?.type === "image") {
        const s = imageSrc(p);
        if (s) images.push(s);
      }
    }
  } else if (content != null) texts.push(JSON.stringify(content, null, 2));
  return { text: texts.join("\n"), images };
}

/** Claude Code wraps some user turns in tags (slash commands, reminders). Show what the person typed. */
function cleanUserText(raw: string): { kind: "user" | "command" | "skip" | "stopped"; text: string } {
  let s = raw;
  if (/^\s*\[Request interrupted by user[^\]]*\]\s*$/.test(s)) return { kind: "stopped", text: "" };
  const cmd = s.match(/<command-name>([\s\S]*?)<\/command-name>/);
  if (cmd) {
    const args = s.match(/<command-args>([\s\S]*?)<\/command-args>/)?.[1]?.trim();
    return { kind: "command", text: `${cmd[1].trim()}${args ? " " + args : ""}` };
  }
  // Claude Code's own notices (a command's output, a background task finishing) aren't the person's words.
  if (/^\s*<(local-command-stdout|local-command-caveat|bash-stdout|bash-stderr|task-notification)>/.test(s)) return { kind: "skip", text: "" };
  s = s.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "").trim();
  if (!s) return { kind: "skip", text: "" };
  return { kind: "user", text: s };
}

/**
 * One Claude Code message (from a saved transcript or a live run) → chat items.
 * Messages from inside a helper agent (parent_tool_use_id set) are left out; the helper's
 * own tool call and its final report already show in the main conversation.
 */
export function itemsFromMessage(m: any): ChatItem[] {
  const out = itemsOf(m);
  const ts = m?.timestamp ? Date.parse(m.timestamp) : NaN;
  return Number.isFinite(ts) ? out.map((i) => ({ ...i, ts })) : out;
}

function itemsOf(m: any): ChatItem[] {
  if (!m || m.parent_tool_use_id) return [];
  if (m.isMeta || m.isSynthetic) return [];
  const uuid: string = m.uuid || "";
  const content = m.message?.content ?? m.content;
  const out: ChatItem[] = [];

  if (m.type === "user") {
    if (typeof content === "string") {
      const c = cleanUserText(content);
      if (c.kind === "user") {
        const a = splitAttached(c.text);
        out.push({ id: `${uuid}:0`, kind: "user", text: cap(a.text), files: a.files.length ? a.files : undefined });
      } else if (c.kind === "stopped") out.push({ id: `${uuid}:0`, kind: "result", isError: false, stopped: true });
      else if (c.kind === "command") out.push({ id: `${uuid}:0`, kind: "command", text: c.text });
      return out;
    }
    if (!Array.isArray(content)) return out;
    const texts: string[] = [];
    const images: string[] = [];
    const docs: string[] = [];
    content.forEach((b: any, i: number) => {
      if (b?.type === "tool_result") {
        const r = resultContent(b.content);
        out.push({
          id: `${uuid}:${i}`,
          kind: "tool_result",
          toolUseId: b.tool_use_id,
          text: cap(r.text),
          isError: !!b.is_error,
          images: r.images.length ? r.images : undefined,
        });
      } else if (b?.type === "text") texts.push(b.text || "");
      else if (b?.type === "document") docs.push(b.title || "Document");
      else if (b?.type === "image") {
        const s = imageSrc(b);
        if (s) images.push(s);
      }
    });
    if (texts.length || images.length || docs.length) {
      const c = cleanUserText(texts.join("\n"));
      if (c.kind === "command") out.unshift({ id: `${uuid}:u`, kind: "command", text: c.text });
      else if (c.kind === "stopped") out.unshift({ id: `${uuid}:u`, kind: "result", isError: false, stopped: true });
      else if (c.kind === "user" || images.length || docs.length) {
        const a = splitAttached(c.kind === "user" ? c.text : "");
        const files = [...docs, ...a.files];
        out.unshift({
          id: `${uuid}:u`,
          kind: "user",
          text: cap(a.text),
          images: images.length ? images : undefined,
          files: files.length ? files : undefined,
        });
      }
    }
    return out;
  }

  if (m.type === "assistant") {
    if (!Array.isArray(content)) return out;
    // Claude Code reports API failures (sign-in, rate limits) as a stand-in assistant message.
    if (m.error || m.isApiErrorMessage || m.message?.model === "<synthetic>") {
      const t = content.map((b: any) => (b?.type === "text" ? b.text : "")).join("\n").trim();
      out.push({ id: `${uuid}:e`, kind: "error", text: cap(t || String(m.error), 2000) });
      return out;
    }
    content.forEach((b: any, i: number) => {
      const id = `${uuid}:${i}`;
      if (b?.type === "text" && b.text?.trim()) out.push({ id, kind: "text", text: cap(b.text) });
      else if (b?.type === "thinking" && b.thinking?.trim()) out.push({ id, kind: "thinking", text: cap(b.thinking, 6000) });
      else if (b?.type === "tool_use") out.push({ id, kind: "tool", toolUseId: b.id, name: b.name, input: capInput(b.input) });
    });
    return out;
  }

  if (m.type === "result") {
    out.push({
      id: `${uuid || "result"}:r`,
      kind: "result",
      isError: m.subtype !== "success" || m.is_error === true,
      text: m.is_error ? cap(String(m.result || ""), 2000) : undefined,
      subtype: m.subtype,
      costUsd: m.total_cost_usd,
      durationMs: m.duration_ms,
      turns: m.num_turns,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Plain labels for tool calls, the way Claude desktop shows them.
// ---------------------------------------------------------------------------

export function shortPath(p: string, root?: string): string {
  if (!p) return "";
  let s = String(p).replace(/\\/g, "/");
  const r = root ? root.replace(/\\/g, "/").replace(/\/$/, "") + "/" : "";
  if (r && s.toLowerCase().startsWith(r.toLowerCase())) s = s.slice(r.length);
  return s;
}

function lines(s: any): number {
  return typeof s === "string" && s ? s.split("\n").length : 0;
}

export function toolSummary(name: string, input: any, root?: string): { verb: string; target?: string; stat?: string } {
  const i = input || {};
  const file = shortPath(i.file_path || i.notebook_path || i.path || "", root);
  switch (name) {
    case "Read":
      return { verb: "Read", target: file };
    case "Write":
      return { verb: "Wrote", target: file, stat: `${lines(i.content)} line${lines(i.content) === 1 ? "" : "s"}` };
    case "Edit": {
      const a = lines(i.new_string);
      const r = lines(i.old_string);
      return { verb: "Edited", target: file, stat: `+${a} −${r}` };
    }
    case "MultiEdit":
      return { verb: "Edited", target: file, stat: `${(i.edits || []).length} changes` };
    case "NotebookEdit":
      return { verb: "Edited notebook", target: file };
    case "Bash":
    case "PowerShell":
      return { verb: i.description ? String(i.description) : "Ran", target: i.description ? undefined : String(i.command || "") };
    case "Grep":
      return { verb: "Searched for", target: String(i.pattern || ""), stat: i.path ? `in ${shortPath(i.path, root)}` : undefined };
    case "Glob":
      return { verb: "Found files", target: String(i.pattern || "") };
    case "WebFetch":
      return { verb: "Fetched", target: String(i.url || "") };
    case "WebSearch":
      return { verb: "Searched the web for", target: String(i.query || "") };
    case "Task":
    case "Agent":
      return { verb: "Asked a helper agent", target: String(i.description || i.subagent_type || "") };
    case "TodoWrite":
      return { verb: "Updated the to-do list" };
    case "ExitPlanMode":
      return { verb: "Proposed a plan" };
    case "AskUserQuestion":
      return { verb: "Asked you a question" };
    case "Skill":
      return { verb: "Used skill", target: String(i.skill || i.command || "") };
    default: {
      const mcp = name.match(/^mcp__(.+?)__(.+)$/);
      // Add-on (MCP) tools: "Claude Browser: navigate".
      if (mcp) return { verb: `${mcp[1].replace(/^plugin_/, "").replace(/_/g, " ")}:`, target: mcp[2].replace(/_/g, " ") };
      return { verb: name };
    }
  }
}

/** The sentence shown on a permission request ("Claude wants to …"). */
export function permissionSentence(toolName: string, input: any, root?: string): string {
  const i = input || {};
  const file = shortPath(i.file_path || i.notebook_path || i.path || "", root);
  switch (toolName) {
    case "Bash":
    case "PowerShell":
      return "Claude wants to run a command";
    case "Write":
      return `Claude wants to create ${file || "a file"}`;
    case "Edit":
    case "MultiEdit":
    case "NotebookEdit":
      return `Claude wants to edit ${file || "a file"}`;
    case "Read":
      return `Claude wants to read ${file || "a file"}`;
    case "WebFetch":
      return `Claude wants to fetch ${i.url || "a web page"}`;
    case "WebSearch":
      return "Claude wants to search the web";
    default: {
      const s = toolSummary(toolName, input, root);
      return `Claude wants to use ${s.verb}${s.target ? ` (${s.target})` : ""}`;
    }
  }
}
