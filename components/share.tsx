"use client";

import { track } from "@vercel/analytics";
import { useState } from "react";

/** Tag a shared link with where it was posted, so referrers show up in analytics. */
function tagged(url: string, source: string) {
  const u = new URL(url);
  u.searchParams.set("utm_source", source);
  u.searchParams.set("utm_medium", "share");
  return u.toString();
}

const TARGETS = [
  {
    id: "x",
    label: "Post on X",
    href: (url: string, text: string) =>
      `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    href: (url: string) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
  },
  {
    id: "reddit",
    label: "Reddit",
    href: (url: string, text: string) =>
      `https://www.reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(text)}`,
  },
] as const;

function useCopy(url: string) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(tagged(url, "copy"));
      setCopied(true);
      track("share", { target: "copy", url });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused; the address bar still has the link.
    }
  }
  return { copied, copy };
}

/** One button: the system share sheet where there is one, otherwise copy the link. */
export function ShareButton({ url, title, text }: { url: string; title: string; text: string }) {
  const { copied, copy } = useCopy(url);

  async function share() {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text, url: tagged(url, "native") });
        track("share", { target: "native", url });
      } catch {
        // Dismissing the share sheet is not an error worth surfacing.
      }
      return;
    }
    await copy();
  }

  return (
    <button type="button" className="btn btn-ghost" onClick={share}>
      {copied ? "Link copied" : "Share"}
    </button>
  );
}

/** Explicit share targets, for the moments worth posting about. */
export function ShareLinks({ url, text }: { url: string; text: string }) {
  const { copied, copy } = useCopy(url);
  return (
    <div className="flex flex-wrap gap-2">
      {TARGETS.map((t) => (
        <a
          key={t.id}
          href={t.href(tagged(url, t.id), text)}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-secondary"
          onClick={() => track("share", { target: t.id, url })}
        >
          {t.label}
        </a>
      ))}
      <button type="button" className="btn btn-ghost" onClick={copy}>
        {copied ? "Link copied" : "Copy link"}
      </button>
    </div>
  );
}
