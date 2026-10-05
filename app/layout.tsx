import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import Link from "next/link";
import { Funnel_Display, Funnel_Sans } from "next/font/google";
import localFont from "next/font/local";
import { SiteHeader, SiteSidebar } from "@/components/site-header";
import type { NavInvestigation } from "@/components/site-nav";
import { StorageNotice } from "@/components/storage-notice";
import { listCompanies, listConcepts, listInvestigations } from "@/lib/content";
import { jsonLd, TITLE_SUFFIX } from "@/lib/metadata";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL } from "@/lib/site";
import "./globals.css";

const sans = Funnel_Sans({ subsets: ["latin"], variable: "--font-funnel-sans", display: "swap" });
const display = Funnel_Display({ subsets: ["latin"], variable: "--font-funnel-display", display: "swap" });
// Labels, numerals and code: pinned to weight 400 and subset to ASCII, 5.5 kB.
const mono = localFont({
  src: "../assets/fonts/GeistMono-Latin.woff2",
  variable: "--font-geist-mono",
  display: "swap",
  preload: false,
});
// The wordmark, subset to "sysgeeks" so the brand costs 1.6 kB instead of a whole family.
const pixel = localFont({
  src: "../assets/fonts/GeistPixel-Wordmark.woff2",
  variable: "--font-geist-pixel",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: `%s${TITLE_SUFFIX}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "system design interview",
    "system design practice",
    "system design interview questions",
    "high level design",
    "HLD interview",
    "distributed systems",
    "software engineering interview prep",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: "/",
    siteName: SITE_NAME,
    type: "website",
    locale: "en_US",
  },
  twitter: { card: "summary_large_image", title: SITE_TITLE, description: SITE_DESCRIPTION },
  // A vercel.app host cannot be verified by DNS, so Search Console and Bing Webmaster Tools use meta tags.
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION,
    other: process.env.BING_SITE_VERIFICATION ? { "msvalidate.01": process.env.BING_SITE_VERIFICATION } : undefined,
  },
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
  const companies = listCompanies();
  const titles: Record<string, string> = Object.fromEntries([
    ...investigations.flatMap((inv) => [
      [`/investigations/${inv.id}`, inv.title],
      [`/investigations/${inv.id}/review`, "The full walkthrough"],
      ...inv.stages.map((s) => [`/investigations/${inv.id}/${s.id}`, s.title]),
    ]),
    ...concepts.map((c) => [`/concepts/${c.id}`, c.title]),
    ...companies.map((c) => [`/companies/${c.id}`, c.name]),
  ]);

  return (
    <html lang="en" className={`${sans.variable} ${display.variable} ${mono.variable} ${pixel.variable}`}>
      <body className="min-h-dvh">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 btn btn-secondary"
        >
          Skip to content
        </a>
        <div className="min-h-dvh lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
          <SiteSidebar investigations={investigations} />
          <div className="flex min-w-0 flex-col">
            <SiteHeader investigations={investigations} titles={titles} />
            <StorageNotice />
            <main id="main" className="mx-auto w-full max-w-[56rem] flex-1">
              {children}
            </main>
            <footer className="mx-auto w-full max-w-[56rem] px-5 pt-10 pb-8 text-[0.75rem] text-ink-3 sm:px-10">
              Free, no accounts, no AI grading. Your progress stays in this browser; export it from{" "}
              <Link href="/understanding" className="underline underline-offset-2 hover:text-ink">
                Your progress
              </Link>
              .
            </footer>
          </div>
        </div>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLd({
              "@graph": [
                {
                  "@type": "WebSite",
                  "@id": `${SITE_URL}/#website`,
                  name: SITE_NAME,
                  url: SITE_URL,
                  description: SITE_DESCRIPTION,
                  inLanguage: "en",
                  publisher: { "@id": `${SITE_URL}/#organization` },
                },
                {
                  "@type": "Organization",
                  "@id": `${SITE_URL}/#organization`,
                  name: SITE_NAME,
                  url: SITE_URL,
                  logo: `${SITE_URL}/apple-icon`,
                  sameAs: ["https://github.com/Absterrg0/InterviewGeek"],
                },
              ],
            }),
          }}
        />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
