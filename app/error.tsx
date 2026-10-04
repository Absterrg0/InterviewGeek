"use client";

import Link from "next/link";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="section py-16">
      <div className="max-w-xl">
        <p className="eyebrow flex items-center gap-2.5">
          <span className="led led-gap" aria-hidden="true" />
          Something went wrong
        </p>
        <h1 className="mt-3 font-display text-[1.875rem] leading-[1.1]">This page failed to load</h1>
        <p className="mt-3 max-w-xl text-[0.9375rem] text-ink-2">
          Your progress is stored in this browser and is unaffected. Try again, or go back to the investigations.
        </p>
        {error.digest && <p className="mt-2 font-mono text-xs text-ink-3">Reference: {error.digest}</p>}
        <div className="mt-6 flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary" onClick={reset}>
            Try again
          </button>
          <Link href="/investigations" className="btn btn-secondary">
            Investigations
          </Link>
        </div>
      </div>
    </div>
  );
}
