"use client";

// Shown across the top of every page when Claude Code isn't installed or isn't signed in.
// "Sign in to Claude" opens Claude Code's own sign-in in a window of its own: the Claude sign-in
// page opens in the browser, and any code it shows is pasted into that window, straight into
// Claude Code. The banner goes away once Claude Code reports it is signed in.

import { apiFetch } from "@/lib/api-client";
import { useCallback, useEffect, useState } from "react";

interface Status {
  installed: boolean;
  loggedIn: boolean;
  claudePath: string | null;
  checkError?: string;
}
interface Login {
  status: "idle" | "waiting" | "done" | "failed";
  message?: string;
  url?: string;
  askingForCode?: boolean;
  inWindow?: boolean;
}

export default function SignInBanner() {
  const [s, setS] = useState<Status | null>(null);
  const [login, setLogin] = useState<Login>({ status: "idle" });
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");

  const load = useCallback(async (refresh = false) => {
    try {
      const r = await apiFetch(`/api/claude/status${refresh ? "?refresh=1" : ""}`, { cache: "no-store" });
      setS(await r.json());
    } catch {
      /* leave as is */
    }
  }, []);

  useEffect(() => {
    load();
    apiFetch("/api/claude/login", { cache: "no-store" })
      .then((r) => r.json())
      .then((l) => l.status === "waiting" && setLogin(l))
      .catch(() => {});
    const t = setInterval(() => load(), 60_000);
    const onFocus = () => load(true);
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  // While the sign-in window is open, check every few seconds whether it has finished.
  useEffect(() => {
    if (login.status !== "waiting") return;
    const t = setInterval(async () => {
      try {
        const l: Login = await (await apiFetch("/api/claude/login", { cache: "no-store" })).json();
        setLogin(l);
        if (l.status === "done") load(true);
      } catch {
        /* ignore */
      }
    }, 3000);
    return () => clearInterval(t);
  }, [login.status, load]);

  const post = async (body: object) =>
    (await apiFetch("/api/claude/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json();
  const sendCode = async () => {
    if (!code.trim()) return;
    setBusy(true);
    try {
      setLogin(await post({ action: "code", code }));
      setCode("");
    } catch {
      /* ignore */
    }
    setBusy(false);
  };
  const start = async (window = false) => {
    setBusy(true);
    try {
      const l: Login = await post({ action: "start", window });
      setLogin(l);
    } catch {
      /* ignore */
    }
    setBusy(false);
  };

  if (!s || (s.installed && s.loggedIn)) return null;

  if (!s.installed) {
    return (
      <div className="border-b border-warn/30 bg-warn/10 px-5 py-2.5 text-[13px] flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="font-medium text-warn">Claude Code isn&apos;t installed on this computer.</span>
        <a href="https://docs.anthropic.com/en/docs/claude-code/setup" target="_blank" rel="noreferrer" className="text-accent hover:underline">
          Install Claude Code
        </a>
        <span className="text-muted">then come back here to sign in.</span>
        <button onClick={() => load(true)} className="ml-auto text-[12px] px-2.5 py-1 rounded border border-border text-muted hover:text-text">
          Check again
        </button>
      </div>
    );
  }

  const waiting = login.status === "waiting";
  return (
    <div className="border-b border-warn/30 bg-warn/10 px-5 py-2.5 text-[13px]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="font-medium text-warn">Claude Code isn&apos;t signed in, so tasks and chats can&apos;t run.</span>
        {!waiting && (
          <button
            onClick={() => start()}
            disabled={busy}
            className="px-3 py-1 rounded-lg bg-accent/20 border border-accent/50 text-accent hover:bg-accent/30 font-medium disabled:opacity-50"
          >
            Sign in to Claude
          </button>
        )}
        {login.status === "failed" && login.message && <span className="text-bad text-[12px]">{login.message}</span>}
      </div>
      {waiting && login.inWindow && (
        <p className="mt-1.5 text-muted">
          A Claude Code sign-in window has opened, and the Claude sign-in page should be open in your browser. Sign in there; if the
          page then shows a code, paste it into the sign-in window and press Enter. This message goes away once you&apos;re signed in.{" "}
          <button onClick={() => start(true)} disabled={busy} className="underline hover:text-text">
            Open the window again
          </button>
        </p>
      )}
      {waiting && !login.inWindow && (
        <div className="mt-1.5 text-muted">
          {login.url ? (
            <>
              The Claude sign-in page should be open in your browser. Sign in there and this message goes away.{" "}
              <a href={login.url} target="_blank" rel="noreferrer" className="text-accent underline">
                Open the sign-in page
              </a>
            </>
          ) : (
            <>Starting the sign-in…</>
          )}
          {login.askingForCode && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendCode();
              }}
              className="mt-2 flex items-center gap-2 flex-wrap"
            >
              <span className="text-text">If the page shows a code, paste it here:</span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                aria-label="The code from the sign-in page"
                className="px-2 py-1 rounded-lg bg-bg border border-border text-[13px] min-w-[240px] focus:outline-none focus:border-accent/60"
              />
              <button type="submit" disabled={busy || !code.trim()} className="px-3 py-1 rounded-lg border border-accent/50 text-accent hover:bg-accent/10 disabled:opacity-50">
                Finish signing in
              </button>
            </form>
          )}
          <div className="mt-1">
            <button onClick={() => start(true)} disabled={busy} className="text-[12px] underline hover:text-text">
              Sign in using a window instead
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
