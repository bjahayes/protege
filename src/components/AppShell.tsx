"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import SidebarNav from "./SidebarNav";
import SimpleSidebar from "./SimpleSidebar";
import NotificationCenter from "./NotificationCenter";
import CommandBar from "./CommandBar";
import GuideHelper from "./GuideHelper";
import SignInBanner from "./SignInBanner";
import RestartButton from "./RestartButton";
import { DemoNotice } from "./DemoBar";
import SettingsMenu from "./SettingsMenu";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const simple = pathname.startsWith("/simple");
  // Below tablet width the sidebar becomes a menu that slides in over the page.
  const [menu, setMenu] = useState(false);
  useEffect(() => setMenu(false), [pathname]);
  useEffect(() => {
    if (!menu) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [menu]);

  return (
    <div className="flex h-[100dvh] overflow-hidden">
      {menu && <div className="md:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setMenu(false)} aria-hidden="true" />}
      <aside
        id="app-menu"
        className={`w-56 shrink-0 border-r border-border bg-panel flex flex-col overflow-y-auto md:static md:translate-x-0 md:bg-panel/60 fixed inset-y-0 left-0 z-50 transition-transform ${
          menu ? "translate-x-0 shadow-2xl" : "-translate-x-full"
        }`}
      >
        <Link href={simple ? "/simple" : "/"} className="px-5 py-4 border-b border-border block">
          <div className="brand-mark">Protégé</div>
          <div className="text-[12.5px] text-muted mt-[5px]">{simple ? "Build things, simply" : "Claude Code mission control"}</div>
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
          <div className="px-3 pt-3 flex flex-col gap-2">
            <SettingsMenu simple={simple} />
            {!simple && <RestartButton statusOnly />}
          </div>
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
        </div>
      </aside>

      <main className="flex-1 min-w-0 flex flex-col">
        <div className="md:hidden flex items-center gap-3 px-4 h-12 border-b border-border bg-panel/60 shrink-0">
          <button
            onClick={() => setMenu(true)}
            aria-label="Open the menu"
            aria-expanded={menu}
            aria-controls="app-menu"
            className="w-9 h-9 -ml-2 rounded-lg text-lg text-muted hover:text-text hover:bg-panel-2"
          >
            ☰
          </button>
          <Link href={simple ? "/simple" : "/"} className="brand-mark">
            Protégé
          </Link>
        </div>
        <SignInBanner />
        {!simple && <DemoNotice />}
        {/* Pages scroll here, so the sign-in banner never pushes a full-height page off screen. */}
        <div id="main-scroll" className={`flex-1 min-h-0 overflow-y-auto ${simple ? "pb-16" : ""}`} style={{ scrollbarGutter: "stable" }}>
          {children}
        </div>
      </main>
      <NotificationCenter />
      {!simple && <CommandBar />}
      {simple && <GuideHelper />}
    </div>
  );
}
