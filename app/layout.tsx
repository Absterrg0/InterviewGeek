import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Source_Serif_4 } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import { StorageNotice } from "@/components/storage-notice";
import { SITE_URL } from "@/lib/site-url";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const serif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-serif-display",
  display: "swap",
  axes: ["opsz"],
});
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono-code", display: "swap" });

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
    { media: "(prefers-color-scheme: light)", color: "#f7f6f2" },
    { media: "(prefers-color-scheme: dark)", color: "#131312" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${serif.variable} ${mono.variable}`}>
      <body className="min-h-dvh flex flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 btn btn-secondary"
        >
          Skip to content
        </a>
        <SiteHeader />
        <StorageNotice />
        <main id="main" className="flex-1">
          {children}
        </main>
        <footer className="border-t border-rule mt-24">
          <div className="mx-auto max-w-6xl px-5 sm:px-8 py-8 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between text-sm text-ink-3">
            <p>Your progress is stored in this browser only. Export it from Understanding.</p>
            <p>No accounts, no tracking, no AI grading.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
