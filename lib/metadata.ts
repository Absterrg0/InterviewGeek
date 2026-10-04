import type { Metadata } from "next";
import { SITE_NAME } from "@/lib/site";

/**
 * Title, description, canonical URL and social-card text for one page.
 * Pages set `openGraph` explicitly because Next.js does not derive it from `title`;
 * the card image itself comes from the nearest `opengraph-image` file.
 */
export function pageMetadata({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  /** Path from the site root, e.g. "/concepts/idempotency". */
  path: string;
}): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: path, siteName: SITE_NAME, type: "website", locale: "en_US" },
    twitter: { card: "summary_large_image", title, description },
  };
}

/** A `<script type="application/ld+json">` payload, escaped so content cannot close the tag. */
export function jsonLd(data: Record<string, unknown>): string {
  return JSON.stringify({ "@context": "https://schema.org", ...data }).replace(/</g, "\\u003c");
}
