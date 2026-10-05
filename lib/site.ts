/** Absolute origin for sitemaps and metadata. Production sets SITE_URL; Vercel provides a fallback host. */
export const SITE_URL =
  process.env.SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

export const SITE_NAME = "SysGeeks";

export const SITE_TITLE = "Free System Design Interview Practice · SysGeeks";

export const SITE_DESCRIPTION =
  "System design interview practice on real systems: URL shortener, rate limiter, news feed, payments and more. Decide, break it, defend it. Free, no signup.";

/** A display host for share cards and footers, e.g. "sysgeeks.vercel.app". */
export const SITE_HOST = new URL(SITE_URL).host;
