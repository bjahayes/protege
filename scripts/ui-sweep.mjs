// Opens every page of Protégé at three window sizes, screenshots each, and counts layout faults that
// are measured, not eyeballed:
//   overflow   the page scrolls sideways
//   offscreen  something sticks out past the right edge without being in a scrolling box
//   spill      text that runs out of its box (and isn't cut off with "…" on purpose)
//   overlap    two buttons, links or fields drawn on top of each other
//   tiny       text smaller than 11 px
//   wires      arrows in the parts diagram crossing cards or each other (data-wire-faults)
// Usage: node scripts/ui-sweep.mjs [baseUrl] [outDir]   (default http://127.0.0.1:4327, data/ui-sweep)
// It only reads pages; it never presses anything that changes a project.
import { chromium } from "playwright-core";
import fs from "fs";
import path from "path";

const base = process.argv[2] || "http://127.0.0.1:4327";
const out = path.resolve(process.argv[3] || "data/ui-sweep");
fs.mkdirSync(out, { recursive: true });
const id = (p) => Buffer.from(p).toString("base64url");
const bw = id("C:\\Users\\Ben\\Buildwork");

const extra = (process.env.SWEEP_PAGES || "").split(",").filter(Boolean);
const PAGES = extra.length
  ? extra
  : [
      "/",
      "/live",
      "/inbox",
      "/agents",
      "/costs",
      "/brain",
      "/assistant",
      "/chat",
      `/chat?s=${process.env.SWEEP_SESSION || ""}`,
      `/projects/${bw}`,
      `/projects/${bw}?tab=history`,
      "/simple",
      "/simple/do",
      "/simple/ask",
      "/simple/new",
      "/simple/help",
      `/simple/project/${bw}`,
      "/simple/project/demo-deadline-tracker",
      `/simple/project/demo-clause-library?job=${process.env.SWEEP_JOB || ""}`,
      "/simple/preview/demo-deadline-tracker",
    ];
const SIZES = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "laptop", width: 1024, height: 768 },
  { name: "phone", width: 390, height: 844, mobile: true },
];

function measure() {
  const vw = window.innerWidth;
  const faults = [];
  const say = (kind, el, extra = "") => {
    const t = (el.getAttribute?.("aria-label") || el.innerText || el.value || el.tagName || "").replace(/\s+/g, " ").trim().slice(0, 70);
    const r = el.getBoundingClientRect();
    faults.push({ kind, what: `${el.tagName.toLowerCase()} “${t}”${extra}`, at: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] });
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.05;
  };
  const inScroller = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (/(auto|scroll|hidden|clip)/.test(cs.overflowX)) return p;
    }
    return null;
  };
  const se = document.scrollingElement;
  if (se.scrollWidth > vw + 1) faults.push({ kind: "overflow", what: `page is ${se.scrollWidth}px wide in a ${vw}px window`, at: [] });
  const main = document.getElementById("main-scroll");
  if (main && main.scrollWidth > main.clientWidth + 1)
    faults.push({ kind: "overflow", what: `main area is ${main.scrollWidth}px wide in ${main.clientWidth}px`, at: [] });

  const all = [...document.body.querySelectorAll("*")].filter((e) => !e.closest("svg") || e.tagName === "svg");
  for (const el of all) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (cs.position === "fixed" && el.closest("[role=dialog]")) continue;
    // Sticks out past the right edge, and nothing clips or scrolls it.
    if (r.right > vw + 2 && !inScroller(el) && el.children.length === 0) say("offscreen", el, ` ends at ${Math.round(r.right)}px`);
    // Text running out of its box.
    const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (hasText && cs.overflowX === "visible" && el.scrollWidth > el.clientWidth + 3 && el.clientWidth > 0 && cs.display !== "inline")
      say("spill", el, ` (${el.scrollWidth} in ${el.clientWidth}px)`);
    if (hasText && parseFloat(cs.fontSize) < 11 && el.innerText.trim()) say("tiny", el, ` ${cs.fontSize}`);
  }
  // Controls on top of one another (a control scrolled out of sight inside its box doesn't count).
  const shown = (el) => {
    const r = el.getBoundingClientRect();
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (/(auto|scroll|hidden|clip)/.test(cs.overflowY + cs.overflowX)) {
        const b = p.getBoundingClientRect();
        if (r.bottom <= b.top + 2 || r.top >= b.bottom - 2 || r.right <= b.left + 2 || r.left >= b.right - 2) return false;
      }
    }
    return true;
  };
  // The part of an element actually on screen: its box cut down by every box that clips it.
  const clipped = (el) => {
    const r = el.getBoundingClientRect();
    let x0 = r.left, y0 = r.top, x1 = r.right, y1 = r.bottom;
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (/(auto|scroll|hidden|clip)/.test(cs.overflowY + cs.overflowX)) {
        const b = p.getBoundingClientRect();
        x0 = Math.max(x0, b.left); y0 = Math.max(y0, b.top); x1 = Math.min(x1, b.right); y1 = Math.min(y1, b.bottom);
      }
    }
    return { left: x0, top: y0, right: Math.max(x0, x1), bottom: Math.max(y0, y1) };
  };
  const ctrls = [...document.querySelectorAll("button, a[href], input, select, textarea, [role=tab], [role=separator]")].filter((e) => visible(e) && shown(e));
  for (let i = 0; i < ctrls.length; i++)
    for (let j = i + 1; j < ctrls.length; j++) {
      const a = ctrls[i], b = ctrls[j];
      if (a.contains(b) || b.contains(a)) continue;
      const A = clipped(a), B = clipped(b);
      const ox = Math.min(A.right, B.right) - Math.max(A.left, B.left);
      const oy = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top);
      if (ox > 4 && oy > 4) say("overlap", a, ` overlaps ${b.tagName.toLowerCase()} “${(b.innerText || b.getAttribute("aria-label") || "").trim().slice(0, 40)}”`);
    }
  for (const d of document.querySelectorAll("[data-wire-faults]"))
    if (Number(d.dataset.wireFaults) > 0 && visible(d)) faults.push({ kind: "wires", what: `${d.dataset.wireFaults} arrow faults in a parts diagram`, at: [] });
  // Group repeats (a list of 40 rows with the same fault is one problem).
  const seen = new Map();
  for (const f of faults) {
    const k = f.kind + f.what.replace(/\d+/g, "#");
    if (seen.has(k)) seen.get(k).times++;
    else seen.set(k, { ...f, times: 1 });
  }
  return [...seen.values()];
}

const exe = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const browser = await chromium.launch({ executablePath: exe, headless: true });
const report = [];
for (const size of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height }, isMobile: !!size.mobile, hasTouch: !!size.mobile, deviceScaleFactor: 1 });
  // Keep the floating guide closed and use the default panel widths, as a first-time visitor sees them.
  await ctx.addInitScript(() => {
    try {
      if (!sessionStorage.getItem("sweep")) {
        localStorage.clear();
        sessionStorage.setItem("sweep", "1");
      }
    } catch {}
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 200)));
  for (const p of PAGES) {
    const url = base + p;
    errors.length = 0;
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(1500);
    } catch (e) {
      report.push({ page: p, size: size.name, faults: [{ kind: "load", what: String(e.message).slice(0, 160), at: [] }] });
      continue;
    }
    let faults = await page.evaluate(measure);
    // A page with a Conversation / What's happening switch: measure the other side too.
    const other = page.locator("[role=tab]", { hasText: "What's happening" });
    if ((await other.count()) && (await other.first().isVisible())) {
      await other.first().click();
      await page.waitForTimeout(1200);
      const more = await page.evaluate(measure);
      faults = faults.concat(more.map((f) => ({ ...f, what: "[What's happening] " + f.what })));
      await page.screenshot({ path: path.join(out, `${size.name}-${p.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "").slice(0, 50)}-panel.png`), fullPage: true });
    }
    for (const e of errors) faults.push({ kind: "script", what: e, at: [], times: 1 });
    const file = `${size.name}-${p.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "").slice(0, 60) || "home"}.png`;
    await page.screenshot({ path: path.join(out, file), fullPage: true });
    report.push({ page: p, size: size.name, file, faults });
  }
  await ctx.close();
}
await browser.close();
fs.writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 2));
let total = 0;
for (const r of report) {
  const n = r.faults.reduce((s, f) => s + 1, 0);
  total += n;
  if (!n) continue;
  console.log(`\n${r.size.padEnd(7)} ${r.page}  (${r.file || "-"})`);
  for (const f of r.faults) console.log(`   ${f.kind.padEnd(9)} ${f.what}${f.times > 1 ? `  ×${f.times}` : ""}`);
}
console.log(`\n${total} faults across ${report.length} page views. Screenshots in ${out}`);
process.exit(0);
