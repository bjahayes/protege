"use client";

import { apiFetch } from "@/lib/api-client";
import { useState } from "react";
import type { Task } from "@/lib/types";

interface Props {
  projectId: string;
  initial: Task[];
}

const COLUMNS: { key: Task["status"]; label: string; color: string }[] = [
  { key: "todo", label: "To do", color: "text-muted" },
  { key: "doing", label: "In progress", color: "text-running" },
  { key: "done", label: "Done", color: "text-good" },
];

export default function TaskBoard({ projectId, initial }: Props) {
  const [tasks, setTasks] = useState<Task[]>(initial);
  const [newTitle, setNewTitle] = useState("");

  const mutate = async (body: any) => {
    const r = await apiFetch(`/api/projects/${projectId}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    if (j.tasks) setTasks(j.tasks);
  };

  const add = async () => {
    if (!newTitle.trim()) return;
    await mutate({ op: "add", title: newTitle.trim() });
    setNewTitle("");
  };

  const move = (t: Task, dir: 1 | -1) => {
    const order: Task["status"][] = ["todo", "doing", "done"];
    const idx = order.indexOf(t.status);
    const next = order[Math.max(0, Math.min(2, idx + dir))];
    if (next !== t.status) mutate({ op: "update", id: t.id, status: next });
  };

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Add a task…"
          className="flex-1 px-3 py-2 rounded-lg bg-bg border border-border text-sm focus:outline-none focus:border-accent/60"
        />
        <button
          onClick={add}
          className="px-3.5 py-2 rounded-lg bg-panel-2 border border-border text-sm hover:border-accent/50"
        >
          Add
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {COLUMNS.map((col) => {
          const items = tasks.filter((t) => t.status === col.key);
          return (
            <div key={col.key} className="rounded-xl border border-border bg-panel/50 p-3 min-h-[120px]">
              <div className={`text-xs font-semibold mb-2.5 flex items-center justify-between ${col.color}`}>
                <span>{col.label}</span>
                <span className="opacity-60">{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.map((t) => (
                  <div key={t.id} className="rounded-lg border border-border bg-panel p-2.5 group">
                    <div className="text-sm">{t.title}</div>
                    {t.notes && <div className="text-[11px] text-muted mt-1">{t.notes}</div>}
                    <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      {col.key !== "todo" && (
                        <button onClick={() => move(t, -1)} className="text-[11px] text-muted hover:text-text px-1">
                          ← back
                        </button>
                      )}
                      {col.key !== "done" && (
                        <button onClick={() => move(t, 1)} className="text-[11px] text-accent hover:text-text px-1">
                          forward →
                        </button>
                      )}
                      <button
                        onClick={() => mutate({ op: "delete", id: t.id })}
                        className="text-[11px] text-muted hover:text-bad px-1 ml-auto"
                      >
                        delete
                      </button>
                    </div>
                  </div>
                ))}
                {items.length === 0 && <div className="text-[11px] text-muted/50 py-2">—</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
