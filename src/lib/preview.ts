import fs from "fs";
import path from "path";

// Places a static site's entry point commonly lives.
const ENTRY_CANDIDATES = [
  "index.html",
  "public/index.html",
  "site/index.html",
  "dist/index.html",
  "build/index.html",
];

/** Return the relative path of a static entry file we can preview, or null. */
export function findPreviewEntry(projectPath: string): string | null {
  for (const rel of ENTRY_CANDIDATES) {
    try {
      if (fs.existsSync(path.join(projectPath, rel))) return rel;
    } catch {
      /* ignore */
    }
  }
  return null;
}

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

export function contentTypeFor(filePath: string): string {
  return CONTENT_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

export function isHtml(filePath: string): boolean {
  const e = path.extname(filePath).toLowerCase();
  return e === ".html" || e === ".htm";
}

/**
 * Inject a <base> so a served page's relative URLs (style.css, script.js, links)
 * resolve against the preview root regardless of trailing-slash redirects.
 */
export function injectBase(html: string, baseHref: string): string {
  const tag = `<base href="${baseHref}">`;
  if (/<base\b/i.test(html)) return html; // page already sets its own base
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => `${m}${tag}`);
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (m) => `${m}${tag}`);
  return tag + html;
}

/**
 * Safely resolve a requested sub-path to a file inside the project.
 * Returns null if it would escape the project dir or touch a sensitive folder.
 */
export function resolvePreviewFile(projectPath: string, relParts: string[]): string | null {
  const rel = relParts.join("/");
  // Never serve version-control or dependency internals.
  if (/(^|\/)\.git(\/|$)/.test(rel) || /(^|\/)node_modules(\/|$)/.test(rel)) return null;

  const target = relParts.length ? path.resolve(projectPath, ...relParts) : null;
  if (!target) {
    // Empty path → the detected entry file.
    const entry = findPreviewEntry(projectPath);
    return entry ? path.join(projectPath, entry) : null;
  }
  const within = path.relative(projectPath, target);
  if (within.startsWith("..") || path.isAbsolute(within)) return null; // traversal guard
  try {
    const st = fs.statSync(target);
    if (st.isDirectory()) {
      const idx = path.join(target, "index.html");
      return fs.existsSync(idx) ? idx : null;
    }
    return target;
  } catch {
    return null;
  }
}
