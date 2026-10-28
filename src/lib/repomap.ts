import fs from "fs";
import path from "path";

export interface RepoSymbol {
  name: string;
  kind: string;
  line: number;
}
export interface RepoFile {
  path: string; // relative, forward-slash
  language: string;
  rank: number;
  importedBy: number;
  imports: number;
  loc: number;
  symbols: RepoSymbol[];
}
export interface RepoMap {
  root: string;
  scanned: number;
  truncated: boolean;
  languages: { language: string; files: number }[];
  files: RepoFile[];
}

const IGNORE_DIRS = new Set([
  "node_modules", ".git", ".next", "dist", "build", "out", "coverage", "vendor",
  "__pycache__", ".venv", "venv", ".protege", ".turbo", "target", "bin", "obj", ".cache",
]);
const EXT_LANG: Record<string, string> = {
  ".ts": "ts", ".tsx": "ts", ".mts": "ts", ".cts": "ts",
  ".js": "js", ".jsx": "js", ".mjs": "js", ".cjs": "js",
  ".py": "py", ".go": "go", ".rs": "rust", ".java": "java",
  ".rb": "ruby", ".php": "php", ".cs": "csharp", ".c": "c", ".h": "c",
  ".cpp": "cpp", ".hpp": "cpp", ".cc": "cpp", ".swift": "swift", ".kt": "kotlin",
};

const MAX_FILES = 800;
const MAX_BYTES = 250_000;

function walk(root: string): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length && out.length < MAX_FILES * 3) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.name.startsWith(".") && e.name !== ".") {
        // allow dotfiles but skip common noisy dot-dirs
        if (e.isDirectory() && IGNORE_DIRS.has(e.name)) continue;
      }
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (IGNORE_DIRS.has(e.name)) continue;
        stack.push(full);
      } else if (EXT_LANG[path.extname(e.name).toLowerCase()]) {
        out.push(full);
      }
    }
  }
  return out;
}

function extractSymbols(lang: string, text: string): RepoSymbol[] {
  const syms: RepoSymbol[] = [];
  const lines = text.split("\n");
  const push = (name: string, kind: string, i: number) => {
    if (name && !syms.some((s) => s.name === name && s.kind === kind)) syms.push({ name, kind, line: i + 1 });
  };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (lang === "ts" || lang === "js") {
      let m;
      if ((m = /^\s*export\s+(?:default\s+)?(?:async\s+)?function\s+(\w+)/.exec(l))) push(m[1], "function", i);
      else if ((m = /^\s*(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/.exec(l))) push(m[1], "class", i);
      else if ((m = /^\s*export\s+(?:interface|type|enum)\s+(\w+)/.exec(l))) push(m[1], "type", i);
      else if ((m = /^\s*export\s+(?:const|let|var)\s+(\w+)/.exec(l))) push(m[1], "const", i);
      else if ((m = /^\s*(?:async\s+)?function\s+(\w+)/.exec(l))) push(m[1], "function", i);
    } else if (lang === "py") {
      let m;
      if ((m = /^\s*(?:async\s+)?def\s+(\w+)/.exec(l))) push(m[1], "function", i);
      else if ((m = /^\s*class\s+(\w+)/.exec(l))) push(m[1], "class", i);
    } else if (lang === "go") {
      let m;
      if ((m = /^func\s+(?:\([^)]*\)\s*)?(\w+)/.exec(l))) push(m[1], "func", i);
      else if ((m = /^type\s+(\w+)/.exec(l))) push(m[1], "type", i);
    } else if (lang === "rust") {
      let m;
      if ((m = /^\s*(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/.exec(l))) push(m[1], "fn", i);
      else if ((m = /^\s*(?:pub\s+)?(?:struct|enum|trait)\s+(\w+)/.exec(l))) push(m[1], "type", i);
    } else {
      let m;
      if ((m = /^\s*(?:public|private|protected|static|\s)*\s*(?:class|interface|struct)\s+(\w+)/.exec(l)))
        push(m[1], "class", i);
      else if ((m = /^\s*(?:func|function|def|fn)\s+(\w+)/.exec(l))) push(m[1], "function", i);
    }
  }
  return syms;
}

function extractImports(lang: string, text: string): string[] {
  const specs: string[] = [];
  const add = (s?: string) => {
    if (s) specs.push(s);
  };
  if (lang === "ts" || lang === "js") {
    const re = /(?:import|export)[^'"]*from\s*['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)|import\(\s*['"]([^'"]+)['"]\s*\)/g;
    let m;
    while ((m = re.exec(text))) add(m[1] || m[2] || m[3]);
  } else if (lang === "py") {
    const re = /^\s*(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))/gm;
    let m;
    while ((m = re.exec(text))) add(m[1] || m[2]);
  } else if (lang === "go") {
    const re = /"([^"]+)"/g;
    const imp = /import\s*\(([\s\S]*?)\)/.exec(text);
    if (imp) {
      let m;
      while ((m = re.exec(imp[1]))) add(m[1]);
    }
  }
  return specs;
}

// Resolve an import spec (from a given file) to a repo-relative file, or null.
function resolveImport(fromRel: string, spec: string, fileSet: Set<string>): string | null {
  const tryPaths = (base: string): string | null => {
    const cands = [
      base,
      base + ".ts", base + ".tsx", base + ".js", base + ".jsx", base + ".mjs", base + ".py", base + ".go", base + ".rs",
      base + "/index.ts", base + "/index.tsx", base + "/index.js", base + "/__init__.py", base + "/mod.rs",
    ];
    for (const c of cands) {
      const norm = c.replace(/\\/g, "/").replace(/^\.\//, "");
      if (fileSet.has(norm)) return norm;
    }
    return null;
  };
  if (spec.startsWith(".")) {
    const dir = path.posix.dirname(fromRel);
    return tryPaths(path.posix.normalize(path.posix.join(dir, spec)));
  }
  if (spec.startsWith("@/")) return tryPaths("src/" + spec.slice(2));
  // Python dotted internal module: a.b.c -> a/b/c
  if (/^[\w.]+$/.test(spec) && spec.includes(".")) {
    const r = tryPaths(spec.replace(/\./g, "/"));
    if (r) return r;
  }
  return null;
}

export function computeRepoMap(root: string): RepoMap {
  const abs = walk(root);
  const truncated = abs.length > MAX_FILES;
  const chosen = abs.slice(0, MAX_FILES);

  const rel = (p: string) => path.relative(root, p).replace(/\\/g, "/");
  const fileSet = new Set(chosen.map(rel));

  const meta = new Map<string, { language: string; symbols: RepoSymbol[]; specs: string[]; loc: number }>();
  const langCount: Record<string, number> = {};

  for (const f of chosen) {
    const lang = EXT_LANG[path.extname(f).toLowerCase()];
    let text = "";
    try {
      if (fs.statSync(f).size > MAX_BYTES) continue;
      text = fs.readFileSync(f, "utf8");
    } catch {
      continue;
    }
    const r = rel(f);
    meta.set(r, {
      language: lang,
      symbols: extractSymbols(lang, text),
      specs: extractImports(lang, text),
      loc: text.split("\n").length,
    });
    langCount[lang] = (langCount[lang] || 0) + 1;
  }

  // Build edges: importer -> imported
  const outLinks = new Map<string, Set<string>>();
  const inCount = new Map<string, number>();
  for (const [r] of meta) {
    outLinks.set(r, new Set());
    inCount.set(r, 0);
  }
  for (const [r, m] of meta) {
    for (const spec of m.specs) {
      const target = resolveImport(r, spec, fileSet);
      if (target && target !== r && meta.has(target)) {
        outLinks.get(r)!.add(target);
      }
    }
  }
  for (const [, targets] of outLinks) for (const t of targets) inCount.set(t, (inCount.get(t) || 0) + 1);

  // PageRank
  const nodes = [...meta.keys()];
  const N = nodes.length || 1;
  const d = 0.85;
  let rank = new Map(nodes.map((n) => [n, 1 / N]));
  for (let iter = 0; iter < 30; iter++) {
    const next = new Map(nodes.map((n) => [n, (1 - d) / N]));
    let dangling = 0;
    for (const n of nodes) {
      const targets = outLinks.get(n)!;
      if (targets.size === 0) dangling += rank.get(n)! * d;
      else {
        const share = (rank.get(n)! * d) / targets.size;
        for (const t of targets) next.set(t, next.get(t)! + share);
      }
    }
    if (dangling) for (const n of nodes) next.set(n, next.get(n)! + dangling / N);
    rank = next;
  }

  const files: RepoFile[] = nodes.map((r) => {
    const m = meta.get(r)!;
    return {
      path: r,
      language: m.language,
      rank: rank.get(r)!,
      importedBy: inCount.get(r) || 0,
      imports: outLinks.get(r)!.size,
      loc: m.loc,
      symbols: m.symbols.slice(0, 14),
    };
  });
  // Rank: PageRank, tie-broken by importedBy then symbol count.
  files.sort(
    (a, b) => b.rank - a.rank || b.importedBy - a.importedBy || b.symbols.length - a.symbols.length
  );

  return {
    root,
    scanned: meta.size,
    truncated,
    languages: Object.entries(langCount)
      .map(([language, files]) => ({ language, files }))
      .sort((a, b) => b.files - a.files),
    files: files.slice(0, 70),
  };
}
