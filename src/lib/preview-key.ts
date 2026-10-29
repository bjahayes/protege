// Server-only. The key in a preview's address. Each project's (or safe copy's) previews live under a
// path only Protégé can make: /<key>/<project id>/… or /_job/<key>/<job id>/…, where the key is a
// keyed hash of that one id. A page being previewed can read its own files, but it can't build the
// address of another project's files, so it can't read them.
import { createHmac, randomBytes, timingSafeEqual } from "crypto";

// Started without the npm scripts there is no install key: use one made for this run, never a fixed one.
const g = globalThis as unknown as { __protegePreviewSecret?: string };
const secret = () => process.env.PROTEGE_INSTALL_TOKEN || (g.__protegePreviewSecret ||= randomBytes(32).toString("hex"));

export function previewKey(kind: "project" | "job", id: string): string {
  return createHmac("sha256", secret()).update(`${kind}:${id}`).digest("hex").slice(0, 32);
}

export function previewKeyOk(kind: "project" | "job", id: string, key: string): boolean {
  const want = Buffer.from(previewKey(kind, id));
  const got = Buffer.from(String(key || ""));
  return got.length === want.length && timingSafeEqual(got, want);
}

/** The address a project's (or a waiting safe copy's) preview is served from, after the origin. */
export function previewPath(kind: "project" | "job", id: string): string {
  const e = encodeURIComponent(id);
  return kind === "job" ? `/_job/${previewKey("job", id)}/${e}/` : `/${previewKey("project", id)}/${e}/`;
}
