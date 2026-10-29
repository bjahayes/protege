// Server-only. Previews of a project's web page are served from their own origin: a small
// server on the port after Protégé's (4318 when Protégé is on 4317), bound to 127.0.0.1. It
// only serves files from known projects and has no API at all, so a project's page, even
// opened in its own tab, can't act on Protégé: Protégé's API is on another origin and refuses
// requests that come from anywhere but Protégé's own pages.

import http from "http";
import fs from "fs";
import { contentTypeFor, injectBase, isHtml, resolvePreviewFile, tooBroad } from "./preview";
import { projectDir } from "./project-guard";
import { previewKeyOk, previewPath } from "./preview-key";

export function appPort(): number {
  return Number(process.env.PROTEGE_PORT || process.env.PORT || 4317);
}
export function previewPort(): number {
  return Number(process.env.PROTEGE_PREVIEW_PORT || appPort() + 1);
}

const g = globalThis as unknown as { __protegePreviewServer?: http.Server };

export function startPreviewServer(): void {
  if (g.__protegePreviewServer) return;
  const port = previewPort();
  const app = appPort();
  const frameAncestors = `http://127.0.0.1:${app} http://localhost:${app}`;

  const server = http.createServer(async (req, res) => {
    const send = (status: number, body: string | Buffer, type = "text/plain; charset=utf-8") => {
      res.writeHead(status, {
        "Content-Type": type,
        "Cache-Control": "no-store, must-revalidate",
        "X-Content-Type-Options": "nosniff",
        // Only Protégé's own pages may show a preview in a frame.
        "Content-Security-Policy": `frame-ancestors ${frameAncestors}`,
      });
      res.end(req.method === "HEAD" ? undefined : body);
    };
    try {
      const host = (req.headers.host || "").replace(/:\d+$/, "");
      if (host !== "127.0.0.1" && host !== "localhost") return send(403, "Previews only open on this computer.");
      if (req.method !== "GET" && req.method !== "HEAD") return send(405, "Previews are read-only.");
      const url = new URL(req.url || "/", "http://127.0.0.1");
      const segs = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
      // Every address carries a key made for that one project or safe copy (lib/preview-key.ts), so a
      // page being previewed can't reach another project's files.
      //   /<key>/<project id>/…          a project
      //   /_job/<key>/<job id>/…         a task's safe copy, while it waits for Keep or Throw away
      let dir: string | null;
      let base: string;
      let parts: string[];
      if (segs[0] === "_job") {
        if (!previewKeyOk("job", segs[2] || "", segs[1] || "")) return send(404, "Unknown preview.");
        const { getJobManager } = await import("./job-manager");
        const job = getJobManager().get(segs[2] || "");
        dir = job?.worktreeState === "active" && job.worktreePath ? job.worktreePath : null;
        base = previewPath("job", segs[2] || "");
        parts = segs.slice(3);
        if (!dir || !fs.existsSync(dir)) return send(404, "This change has been kept or thrown away, so its copy is gone.");
      } else {
        if (!previewKeyOk("project", segs[1] || "", segs[0] || "")) return send(404, "Unknown preview.");
        dir = await projectDir(segs[1]);
        base = previewPath("project", segs[1] || "");
        parts = segs.slice(2);
        if (!dir || !fs.existsSync(dir)) return send(404, "Unknown project.");
      }
      // A folder that holds far more than one project (your home folder, a drive) is never served.
      if (tooBroad(dir)) return send(403, "This folder is too broad to preview.");
      const file = resolvePreviewFile(dir, parts);
      if (!file) return send(404, "Nothing to preview here yet.");
      if (isHtml(file)) return send(200, injectBase(fs.readFileSync(file, "utf8"), base), contentTypeFor(file));
      return send(200, fs.readFileSync(file), contentTypeFor(file));
    } catch {
      return send(500, "Couldn't read that file.");
    }
  });
  server.on("error", (e: any) => {
    console.error(`[protege] preview server couldn't start on port ${port}: ${e?.code || e}`);
    g.__protegePreviewServer = undefined;
  });
  server.listen(port, "127.0.0.1");
  g.__protegePreviewServer = server;
}
