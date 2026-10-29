"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/simple", label: "My projects", icon: "▦" },
  { href: "/simple/new", label: "Start something new", icon: "✨" },
  { href: "/simple/do", label: "Do a task", icon: "✍️" },
  { href: "/simple/ask", label: "Ask a question", icon: "💬" },
  { href: "/simple/help", label: "How this works", icon: "?" },
];

export default function SimpleSidebar() {
  const pathname = usePathname();
  return (
    <nav className="p-2 flex flex-col gap-0.5 text-sm">
      {ITEMS.map((it) => {
        const active = it.href === "/simple" ? pathname === "/simple" : pathname.startsWith(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            className={`px-3 py-2 rounded-md flex items-center gap-2 transition-colors ${
              active ? "bg-panel-2 text-text" : "text-muted hover:bg-panel-2 hover:text-text"
            }`}
          >
            <span className="w-4 text-center opacity-70">{it.icon}</span>
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
