// Server-only. Previews of a project's web page are served from their own origin: a small
// server on the port after Protégé's (4318 when Protégé is on 4317), bound to 127.0.0.1. It
// only serves files from known projects and has no API at all, so a project's page, even
// opened in its own tab, can't act on Protégé: Protégé's API is on another origin and refuses
// requests that come from anywhere but Protégé's own pages.

import http from "http";
import fs from "fs";
import { contentTypeFor, injectBase, isHtml, resolvePreviewFile } from "./preview";
import { projectDir } from "./project-guard";

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
      const [id, ...parts] = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
      const dir = await projectDir(id);
      if (!dir || !fs.existsSync(dir)) return send(404, "Unknown project.");
      const file = resolvePreviewFile(dir, parts);
      if (!file) return send(404, "Nothing to preview here yet.");
      if (isHtml(file)) return send(200, injectBase(fs.readFileSync(file, "utf8"), `/${encodeURIComponent(id)}/`), contentTypeFor(file));
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
