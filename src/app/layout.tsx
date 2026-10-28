import type { Metadata } from "next";
import "./globals.css";
import AppShell from "@/components/AppShell";

export const metadata: Metadata = {
  title: "Protégé",
  description: "See where every project is and orchestrate multiple Claude Code agents.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-bg text-text">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
