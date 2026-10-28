// Request filter for every page and API call.
//
// Protégé runs commands on this computer as you, so its API must only answer the Protégé page
// you opened yourself:
//   1. Host must be 127.0.0.1 or localhost (stops a website reaching it by pointing its own
//      name at this computer, "DNS rebinding").
//   2. A non-GET request that says where it came from (Origin) must come from Protégé itself.
//   3. A non-GET request must send JSON (a plain web form can't).
//   4. A browser request must come from a Protégé page itself (Sec-Fetch-Site: same-origin).
//   5. Pages only take GET from other sites (anything else must come from a Protégé page).
//   6. Every API call must carry this install's access key: the browser gets it as a cookie
//      when it opens a Protégé page (other sites can't send or read it); scripts can send it
//      in an X-Protege-Token header. The key is made by scripts/serve.mjs.

import { NextResponse, type NextRequest } from "next/server";

const TOKEN = process.env.PROTEGE_INSTALL_TOKEN || "";
const COOKIE = "protege_token";
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);

function sameKey(a: string | undefined | null, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function refuse(status: number, message: string) {
  return new NextResponse(JSON.stringify({ error: message }), { status, headers: { "Content-Type": "application/json" } });
}

export function middleware(req: NextRequest) {
  const host = req.headers.get("host") || "";
  const hostname = host.replace(/:\d+$/, "");
  if (!LOCAL_HOSTS.has(hostname)) {
    return new NextResponse("Protégé only answers on this computer, at 127.0.0.1 or localhost.", { status: 403 });
  }

  if (!req.nextUrl.pathname.startsWith("/api/")) {
    // Pages only ever need GET. Protégé has no server actions, so anything else sent to a page
    // must come from a Protégé page itself; that keeps attacks on Next.js's page handling
    // (crafted server-component requests) out, whatever version is running.
    if (req.method !== "GET" && req.method !== "HEAD") {
      const site = req.headers.get("sec-fetch-site");
      const origin = req.headers.get("origin");
      const own = site ? site === "same-origin" : origin === `${req.nextUrl.protocol}//${host}`;
      if (!own) return new NextResponse("Request from another site refused.", { status: 403 });
    }
    // A page: hand the browser this install's key, and don't let other sites frame Protégé.
    const res = NextResponse.next();
    if (TOKEN && !sameKey(req.cookies.get(COOKIE)?.value, TOKEN)) {
      res.cookies.set(COOKIE, TOKEN, { httpOnly: true, sameSite: "strict", path: "/" });
    }
    res.headers.set("X-Frame-Options", "DENY");
    res.headers.set("Content-Security-Policy", "frame-ancestors 'none'");
    return res;
  }

  if (!TOKEN) {
    return refuse(503, "Start Protégé with `npm run dev` or `npm start`: they set up its access key.");
  }
  // Browsers say where a request comes from. Only Protégé's own pages count: a preview page on
  // the next port is "same-site" to the browser (sites ignore ports) but not "same-origin".
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return refuse(403, "Request from another page refused.");
  if (req.method !== "GET" && req.method !== "HEAD") {
    const origin = req.headers.get("origin");
    if (origin && origin !== `${req.nextUrl.protocol}//${host}`) return refuse(403, "Request from another site refused.");
    const type = (req.headers.get("content-type") || "").toLowerCase();
    if (!type.startsWith("application/json")) return refuse(415, "Protégé's API only accepts JSON.");
  }
  if (!sameKey(req.cookies.get(COOKIE)?.value || req.headers.get("x-protege-token"), TOKEN)) {
    return refuse(401, "Missing or wrong access key. Open Protégé in your browser, or send X-Protege-Token.");
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
