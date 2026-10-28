import fs from "fs";
import path from "path";
import type { PermissionMode } from "@anthropic-ai/claude-agent-sdk";
import { getJobManager } from "./job-manager";
import { readTasks, writeTasks } from "./docs";
import type { Job } from "./types";
import { metaPath } from "./meta";

export interface MissionTask {
  taskId: string;
  title: string;
  notes?: string;
  state: "pending" | "running" | "done" | "failed";
  jobId?: string;
}

export interface Mission {
  projectPath: string;
  projectName: string;
  status: "running" | "done" | "stopped";
  tasks: MissionTask[];
  currentIndex: number;
  startedAt: number;
  endedAt?: number;
  opts: {
    model?: string;
    permissionMode?: PermissionMode;
    isolate?: boolean;
    autoResume?: boolean;
  };
}

export interface MissionOpts {
  model?: string;
  permissionMode?: PermissionMode;
  isolate?: boolean;
  autoResume?: boolean;
}

class MissionManager {
  private missions = new Map<string, Mission>();

  get(projectPath: string): Mission | null {
    return this.missions.get(projectPath) || null;
  }

  start(projectPath: string, projectName: string, opts: MissionOpts): Mission {
    const existing = this.missions.get(projectPath);
    if (existing && existing.status === "running") return existing;

    const todo = readTasks(projectPath).filter((t) => t.status === "todo");
    const mission: Mission = {
      projectPath,
      projectName,
      status: "running",
      tasks: todo.map((t) => ({ taskId: t.id, title: t.title, notes: t.notes, state: "pending" })),
      currentIndex: 0,
      startedAt: Date.now(),
      opts,
    };
    this.missions.set(projectPath, mission);

    if (mission.tasks.length === 0) {
      mission.status = "done";
      mission.endedAt = Date.now();
    }
    this.persist(mission);
    if (mission.status === "running") this.runNext(mission);
    return mission;
  }

  stop(projectPath: string): boolean {
    const mission = this.missions.get(projectPath);
    if (!mission) return false;
    const mt = mission.tasks[mission.currentIndex];
    if (mt?.jobId) getJobManager().stop(mt.jobId);
    mission.status = "stopped";
    mission.endedAt = Date.now();
    this.persist(mission);
    return true;
  }

  private runNext(mission: Mission) {
    if (mission.status !== "running") return;
    if (mission.currentIndex >= mission.tasks.length) {
      mission.status = "done";
      mission.endedAt = Date.now();
      this.persist(mission);
      return;
    }
    const mt = mission.tasks[mission.currentIndex];
    mt.state = "running";
    this.setTaskStatus(mission.projectPath, mt.taskId, "doing");
    this.persist(mission);

    const prompt =
      `You are completing ONE task from this project's plan, as part of an automated mission. ` +
      `Implement it end-to-end, keep the change scoped and consistent with the existing code and CLAUDE.md, ` +
      `run any relevant tests, and briefly report what you changed. When done, stop.\n\n` +
      `Task: ${mt.title}` +
      (mt.notes ? `\nNotes: ${mt.notes}` : "");

    const job = getJobManager().launch({
      projectPath: mission.projectPath,
      projectName: mission.projectName,
      prompt,
      kind: "run",
      model: mission.opts.model,
      permissionMode: mission.opts.permissionMode || "acceptEdits",
      isolate: mission.opts.isolate,
      autoResume: mission.opts.autoResume,
      primeContext: true,
      maxTurns: 30,
      onDone: (j) => this.onTaskDone(mission.projectPath, j),
    });
    mt.jobId = job.id;
    this.persist(mission);
  }

  private onTaskDone(projectPath: string, job: Job) {
    const mission = this.missions.get(projectPath);
    if (!mission || mission.status !== "running") return;
    const mt = mission.tasks[mission.currentIndex];
    if (!mt || mt.jobId !== job.id) return; // stale callback

    if (job.status === "done") {
      mt.state = "done";
      this.setTaskStatus(projectPath, mt.taskId, "done");
    } else {
      mt.state = "failed"; // leave the task as in-progress in tasks.json
    }
    mission.currentIndex++;
    this.persist(mission);
    this.runNext(mission);
  }

  private setTaskStatus(projectPath: string, taskId: string, status: "todo" | "doing" | "done") {
    try {
      const tasks = readTasks(projectPath);
      const t = tasks.find((x) => x.id === taskId);
      if (t) {
        t.status = status;
        t.updatedAt = Date.now();
        writeTasks(projectPath, tasks);
      }
    } catch {
      /* ignore */
    }
  }

  private persist(mission: Mission) {
    try {
      const file = metaPath(mission.projectPath, "mission.json");
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(mission, null, 2), "utf8");
    } catch {
      /* ignore */
    }
  }
}

const g = globalThis as unknown as { __bwMissionManager?: MissionManager };
export function getMissionManager(): MissionManager {
  if (!g.__bwMissionManager) g.__bwMissionManager = new MissionManager();
  return g.__bwMissionManager;
}
