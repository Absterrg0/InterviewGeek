import type { Metadata } from "next";
import { SITE_NAME, SITE_URL } from "@/lib/site";

export const TITLE_SUFFIX = ` · ${SITE_NAME}`;

/**
 * Title, description, canonical URL and social-card text for one page.
 * Pages set `openGraph` explicitly because Next.js does not derive it from `title`;
 * the card image itself comes from the nearest `opengraph-image` file.
 */
export function pageMetadata({
  title,
  description,
  path,
  noindex = false,
}: {
  title: string;
  description: string;
  /** Path from the site root, e.g. "/concepts/idempotency". */
  path: string;
  /** For pages that only show the visitor's own browser data: followed, never listed. */
  noindex?: boolean;
}): Metadata {
  return {
    // Search results show the site name on their own line, so the suffix is dropped where it would push
    // the title past what Google displays (about 60 characters) and cut off the words that matter.
    title: `${title}${TITLE_SUFFIX}`.length > 60 ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: path, siteName: SITE_NAME, type: "website", locale: "en_US" },
    twitter: { card: "summary_large_image", title, description },
    ...(noindex && { robots: { index: false, follow: true } }),
  };
}

/** A `<script type="application/ld+json">` payload, escaped so content cannot close the tag. */
export function jsonLd(data: Record<string, unknown>): string {
  return JSON.stringify({ "@context": "https://schema.org", ...data }).replace(/</g, "\\u003c");
}

/** A schema.org BreadcrumbList, which search results show in place of the bare URL. */
export function breadcrumbs(items: { name: string; path: string }[]): Record<string, unknown> {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: `${SITE_URL}${item.path}`,
    })),
  };
}

/** Plain text cut at a word boundary, for meta descriptions that should not be truncated mid-word. */
export function clip(text: string, max = 158): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ")).replace(/[\s,;:.—-]+$/, "")}…`;
}
