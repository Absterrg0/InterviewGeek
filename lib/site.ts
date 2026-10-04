/** Absolute origin for sitemaps and metadata. Production sets SITE_URL; Vercel provides a fallback host. */
export const SITE_URL =
  process.env.SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

export const SITE_NAME = "SysGeeks";

export const SITE_TITLE = "SysGeeks: free system design interview practice";

export const SITE_DESCRIPTION =
  "Free system design interview practice. Work through real systems from requirements: make the decisions, explain why, break the design and defend it. No signup.";

/** A display host for share cards and footers, e.g. "sysgeeks.vercel.app". */
export const SITE_HOST = new URL(SITE_URL).host;
