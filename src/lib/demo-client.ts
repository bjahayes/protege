// Client-safe helpers for demo mode. Demo state lives in a cookie (so the server
// can swap in made-up projects) mirrored to localStorage (for instant UI reads).

export const isDemoId = (id: string) => id.startsWith("demo-");

export function isDemoOn(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.split("; ").some((c) => c === "protege_demo=1");
}

export function setDemo(on: boolean) {
  document.cookie = `protege_demo=${on ? "1" : ""};path=/;max-age=${on ? 60 * 60 * 24 * 365 : 0}`;
  try {
    localStorage.setItem("protege_demo", on ? "1" : "0");
  } catch {
    /* ignore */
  }
}
