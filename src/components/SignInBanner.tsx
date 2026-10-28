"use client";

// Shown across the top of every page when Claude Code isn't installed or isn't signed in.
// "Sign in to Claude" opens Claude Code's own sign-in in a window of its own: the Claude sign-in
// page opens in the browser, and any code it shows is pasted into that window, straight into
// Claude Code. The banner goes away once Claude Code reports it is signed in.

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
}

export default function SignInBanner() {
  const [s, setS] = useState<Status | null>(null);
  const [login, setLogin] = useState<Login>({ status: "idle" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (refresh = false) => {
    try {
      const r = await fetch(`/api/claude/status${refresh ? "?refresh=1" : ""}`, { cache: "no-store" });
      setS(await r.json());
    } catch {
      /* leave as is */
    }
  }, []);

  useEffect(() => {
    load();
    fetch("/api/claude/login", { cache: "no-store" })
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
        const l: Login = await (await fetch("/api/claude/login", { cache: "no-store" })).json();
        setLogin(l);
        if (l.status === "done") load(true);
      } catch {
        /* ignore */
      }
    }, 3000);
    return () => clearInterval(t);
  }, [login.status, load]);

  const start = async () => {
    setBusy(true);
    try {
      const l: Login = await (
        await fetch("/api/claude/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start" }) })
      ).json();
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
        <button
          onClick={start}
          disabled={busy}
          className="px-3 py-1 rounded-lg bg-accent/20 border border-accent/50 text-accent hover:bg-accent/30 font-medium disabled:opacity-50"
        >
          {waiting ? "Open the sign-in window again" : "Sign in to Claude"}
        </button>
        {login.status === "failed" && login.message && <span className="text-bad text-[12px]">{login.message}</span>}
      </div>
      {waiting && (
        <p className="mt-1.5 text-muted">
          A Claude Code sign-in window has opened, and the Claude sign-in page should be open in your browser. Sign in there; if the
          page then shows a code, paste it into the sign-in window and press Enter. This message goes away once you&apos;re signed in.
        </p>
      )}
    </div>
  );
}
