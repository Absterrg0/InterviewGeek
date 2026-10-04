import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { Funnel_Display, Funnel_Sans, Geist_Mono, Geist_Pixel } from "next/font/google";
import { SiteHeader, SiteSidebar } from "@/components/site-header";
import type { NavInvestigation } from "@/components/site-nav";
import { StorageNotice } from "@/components/storage-notice";
import { listConcepts, listInvestigations } from "@/lib/content";
import { SITE_URL } from "@/lib/site-url";
import "./globals.css";

const sans = Funnel_Sans({ subsets: ["latin"], variable: "--font-funnel-sans", display: "swap" });
const display = Funnel_Display({ subsets: ["latin"], variable: "--font-funnel-display", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });
const pixel = Geist_Pixel({ subsets: ["latin"], variable: "--font-geist-pixel", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "InterviewGeek: learn how systems actually work",
    template: "%s · InterviewGeek",
  },
  description:
    "Prepare for system design interviews by working through real engineering investigations: requirements, decisions, tradeoffs, failures and changing constraints.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const investigations: NavInvestigation[] = listInvestigations().map((inv) => ({
    id: inv.id,
    title: inv.title,
    stages: inv.stages.map((s) => ({ id: s.id, title: s.title, phase: s.phase })),
  }));
  const concepts = listConcepts();
  const claimCount = concepts.reduce((n, c) => n + c.claims.length, 0);
  const titles: Record<string, string> = Object.fromEntries([
    ...investigations.flatMap((inv) => [
      [`/investigations/${inv.id}`, inv.title],
      [`/investigations/${inv.id}/review`, "The design, defended"],
      ...inv.stages.map((s) => [`/investigations/${inv.id}/${s.id}`, s.title]),
    ]),
    ...concepts.map((c) => [`/concepts/${c.id}`, c.title]),
  ]);
  const nav = { investigations, conceptCount: concepts.length, claimCount };

  return (
    <html lang="en" className={`${sans.variable} ${display.variable} ${mono.variable} ${pixel.variable}`}>
      <body className="min-h-dvh">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 btn btn-secondary"
        >
          Skip to content
        </a>
        <div className="frame mx-auto min-h-dvh max-w-[1200px] lg:grid lg:grid-cols-[16.5rem_minmax(0,1fr)]">
          <SiteSidebar {...nav} />
          <div className="flex min-w-0 flex-col">
            <SiteHeader {...nav} titles={titles} />
            <StorageNotice />
            <main id="main" className="flex-1">
              {children}
            </main>
            <footer className="flex flex-col gap-2 px-5 py-6 text-[0.75rem] text-ink-3 sm:flex-row sm:items-center sm:justify-between sm:px-10">
              <p>Your progress is stored in this browser only. Export it from Understanding.</p>
              <p className="font-mono text-[0.625rem] uppercase tracking-wider">No accounts · No cookies · No AI grading</p>
            </footer>
          </div>
        </div>
        <Analytics />
      </body>
    </html>
  );
}
