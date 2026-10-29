// Checks the resizable panels in a real browser (no model calls): dragging an edge changes the
// panel's width, the width is remembered after a reload, double-click puts it back, and the panel
// can't be dragged so wide that the page has no room.
//   node scripts/test-resize.mjs [baseUrl] [session id]
import { chromium } from "playwright-core";

const base = process.argv[2] || "http://127.0.0.1:4327";
const sid = process.argv[3];
let failures = 0;
const check = (ok, what) => {
  console.log(`${ok ? "pass" : "FAIL"}  ${what}`);
  if (!ok) failures++;
};
const browser = await chromium.launch({ executablePath: process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.goto(`${base}/chat?s=${sid}`);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForSelector('section[aria-label="What\'s happening"]', { timeout: 15000 });
const panelW = () => page.evaluate(() => Math.round(document.querySelector('section[aria-label="What\'s happening"]').closest("aside").getBoundingClientRect().width));
const handle = page.locator('[role=separator][aria-label^="What\'s happening panel"]');
const w0 = await panelW();
check(w0 === 440, `the panel opens at its usual width at 1440 px (${w0}px)`);
const box = await handle.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + 200);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2 - 60, box.y + 200, { steps: 4 });
const mid = await panelW();
check(Math.abs(mid - (w0 + 60)) <= 2, `the panel follows the mouse while dragging, before it is let go (${w0} → ${mid} halfway)`);
await page.mouse.move(box.x + box.width / 2 - 120, box.y + 200, { steps: 4 });
await page.mouse.up();
const w1 = await panelW();
check(Math.abs(w1 - (w0 + 120)) <= 2, `dragging its edge 120 px left widens it by 120 px (${w0} → ${w1})`);
await page.reload();
await page.waitForSelector('section[aria-label="What\'s happening"]');
check(Math.abs((await panelW()) - w1) <= 2, "the width is remembered after a reload");
await handle.dblclick();
check((await panelW()) === w0, "double-clicking the edge puts the width back");
const b2 = await handle.boundingBox();
await page.mouse.move(b2.x + 2, b2.y + 200);
await page.mouse.down();
await page.mouse.move(10, b2.y + 200, { steps: 8 });
await page.mouse.up();
const wide = await panelW();
check(wide <= 1440 - 560, `it can't be dragged so wide that the chat has no room (${wide}px)`);
await handle.dblclick();
await handle.focus();
await page.keyboard.press("ArrowLeft");
check((await panelW()) === w0 + 16, "the arrow keys resize it too");
const list = page.locator('[role=separator][aria-label^="List of sessions"]');
check((await list.count()) === 1, "the list of sessions has its own edge to drag");
// The panel beside a Simple-mode task.
const job = process.argv[4];
if (job) {
  await page.goto(`${base}/simple/project/demo-clause-library?job=${job}`);
  const h2 = page.locator("[role=separator][aria-label^=\"What's happening panel\"]");
  await h2.waitFor({ timeout: 15000 });
  const tw = () => page.evaluate(() => Math.round(document.querySelector("section[aria-label=\"What's happening\"]").parentElement.getBoundingClientRect().width));
  const t0 = await tw();
  const b = await h2.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + 100);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 - 80, b.y + 100, { steps: 4 });
  const tm = await tw();
  await page.mouse.up();
  check(Math.abs(tm - (t0 + 80)) <= 2, `the Simple task panel follows the mouse while dragging (${t0} → ${tm})`);
  check(Math.abs((await tw()) - (t0 + 80)) <= 2, "and keeps the width when let go");
}
await browser.close();
console.log(failures ? `\n${failures} failed` : "\nAll passed");
process.exit(failures ? 1 : 0);
