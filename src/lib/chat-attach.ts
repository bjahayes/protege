// Server-only. Turns files attached in the Chat page into what Claude Code receives:
//   - images (PNG, JPEG, GIF, WebP) go in the message itself, so Claude sees them;
//   - PDFs go in as documents, so Claude reads them page by page;
//   - anything else is saved under data/uploads/ and named in the message, so Claude can open
//     it with its own tools (Read, or a script for spreadsheets and Word files).

import fs from "fs";
import path from "path";
import { ATTACHED_PREFIX } from "./chat-format";

export interface Attachment {
  name: string;
  type: string;
  /** base64, without a data: prefix */
  data: string;
}

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const MAX_IMAGE = 5 * 1024 * 1024; // Claude's limit per image
const MAX_PDF = 32 * 1024 * 1024;
const MAX_FILE = 50 * 1024 * 1024;

function safeName(n: string): string {
  return path.basename(String(n || "file")).replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 120) || "file";
}

export function attachmentBlocks(list: Attachment[], sessionId: string): { blocks: any[]; lines: string[] } {
  const blocks: any[] = [];
  const lines: string[] = [];
  for (const a of list.slice(0, 20)) {
    const name = safeName(a.name);
    const bytes = Math.floor((String(a.data || "").length * 3) / 4);
    if (IMAGE_TYPES.has(a.type)) {
      if (bytes > MAX_IMAGE) throw new Error(`${name} is larger than 5 MB, the most Claude accepts for one image.`);
      blocks.push({ type: "image", source: { type: "base64", media_type: a.type, data: a.data } });
    } else if (a.type === "application/pdf") {
      if (bytes > MAX_PDF) throw new Error(`${name} is larger than 32 MB, the most Claude accepts for one PDF.`);
      blocks.push({ type: "document", title: name, source: { type: "base64", media_type: "application/pdf", data: a.data } });
    } else {
      if (bytes > MAX_FILE) throw new Error(`${name} is larger than 50 MB.`);
      const dir = path.join(process.cwd(), "data", "uploads", sessionId.replace(/[^\w-]/g, ""));
      fs.mkdirSync(dir, { recursive: true });
      let file = path.join(dir, name);
      for (let i = 2; fs.existsSync(file); i++) file = path.join(dir, `${path.parse(name).name} (${i})${path.parse(name).ext}`);
      fs.writeFileSync(file, Buffer.from(a.data, "base64"));
      lines.push(`${ATTACHED_PREFIX}${file}`);
    }
  }
  return { blocks, lines };
}
