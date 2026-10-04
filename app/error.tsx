"use client";

import Link from "next/link";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-6xl px-5 sm:px-8 pt-24">
      <p className="eyebrow">Something went wrong</p>
      <h1 className="mt-3 font-serif text-4xl tracking-tight">This page failed to load</h1>
      <p className="mt-4 max-w-xl text-lg text-ink-2">
        Your progress is stored in this browser and is unaffected. Try again, or go back to the investigations.
      </p>
      {error.digest && <p className="mt-2 font-mono text-xs text-ink-3">Reference: {error.digest}</p>}
      <div className="mt-8 flex gap-3">
        <button type="button" className="btn btn-primary" onClick={reset}>Try again</button>
        <Link href="/investigations" className="btn btn-secondary">Investigations</Link>
      </div>
    </div>
  );
}
