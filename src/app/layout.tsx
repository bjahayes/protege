import type { Metadata } from "next";
import { Geist, Cal_Sans, Montserrat } from "next/font/google";
import "./globals.css";
import AppShell from "@/components/AppShell";

export const metadata: Metadata = {
  title: "Protégé",
  description: "See where every project is and orchestrate multiple Claude Code agents.",
};

// The Midnight theme's typefaces. Next.js downloads them once at build time and serves them from
// Protégé itself, so pages never fetch fonts from the internet.
const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const calSans = Cal_Sans({ subsets: ["latin"], weight: "400", variable: "--font-cal-sans", display: "swap", adjustFontFallback: false });
// The Protégé name in the sidebar, in either look.
const montserrat = Montserrat({ subsets: ["latin"], weight: "600", variable: "--font-brand", display: "swap" });

// Applies the chosen theme before the page draws, so it never flashes the other one.
// ?theme=midnight|classic in the address also sets it (handy for checking a page in each theme).
const THEME_SCRIPT = `(function(){try{var q=new URLSearchParams(location.search).get("theme");if(q==="midnight"||q==="classic")localStorage.setItem("protege.theme",q);var t=localStorage.getItem("protege.theme");if(t==="midnight")document.documentElement.dataset.theme="midnight";}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${calSans.variable} ${montserrat.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-bg text-text">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
