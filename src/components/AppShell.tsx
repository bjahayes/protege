"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import SidebarNav from "./SidebarNav";
import SimpleSidebar from "./SimpleSidebar";
import NotificationCenter from "./NotificationCenter";
import CommandBar from "./CommandBar";
import GuideHelper from "./GuideHelper";
import SignInBanner from "./SignInBanner";
import RestartButton from "./RestartButton";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const simple = pathname.startsWith("/simple");

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="w-56 shrink-0 border-r border-border bg-panel/60 flex flex-col overflow-y-auto">
        <Link href={simple ? "/simple" : "/"} className="px-5 py-4 border-b border-border block">
          <div className="text-lg font-bold tracking-tight">Protégé</div>
          <div className="text-[11px] text-muted -mt-0.5">{simple ? "Build things, simply" : "Claude Code mission control"}</div>
        </Link>

        {simple ? <SimpleSidebar /> : <SidebarNav />}

        <div className="mt-auto border-t border-border">
          {simple && (
            <div className="px-3 pt-3">
              <div className="rounded-lg border border-good/25 bg-good/5 px-2.5 py-2 text-[11px] text-good flex items-start gap-1.5">
                <span className="shrink-0">🔒</span>
                <span className="leading-snug">Everything runs on your own computer. Your files never leave it.</span>
              </div>
            </div>
          )}
          {!simple && (
            <div className="p-3 flex flex-col gap-2">
              <NotificationCenter />
              <RestartButton />
            </div>
          )}
          <div className="px-3 py-3">
            <Link
              href={simple ? "/" : "/simple"}
              className={`block text-center text-[11px] px-2.5 py-1.5 rounded-lg border ${
                simple
                  ? "border-border text-muted hover:text-text hover:border-accent/40"
                  : "border-accent/30 text-accent hover:bg-accent/10"
              }`}
            >
              {simple ? "Switch to full view →" : "✦ Switch to simple view"}
            </Link>
          </div>
          {!simple && (
            <div className="px-3 pb-3 text-[11px] text-muted leading-relaxed">
              Runs jobs with your existing Claude Code login. Localhost only.
            </div>
          )}
        </div>
      </aside>

      <main className="flex-1 min-w-0 flex flex-col">
        <SignInBanner />
        {/* Pages scroll here, so the sign-in banner never pushes a full-height page off screen. */}
        <div id="main-scroll" className="flex-1 min-h-0 overflow-y-auto" style={{ scrollbarGutter: "stable" }}>
          {children}
        </div>
      </main>
      {!simple && <CommandBar />}
      {simple && <GuideHelper />}
    </div>
  );
}
