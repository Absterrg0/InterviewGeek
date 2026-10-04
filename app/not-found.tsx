import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-6xl px-5 sm:px-8 pt-24">
      <p className="eyebrow">404</p>
      <h1 className="mt-3 font-serif text-4xl tracking-tight">Nothing at this address</h1>
      <p className="mt-4 max-w-xl text-lg text-ink-2">
        The page may have moved, or the link may be mistyped.
      </p>
      <div className="mt-8 flex gap-3">
        <Link href="/investigations" className="btn btn-primary">Investigations</Link>
        <Link href="/concepts" className="btn btn-secondary">Concepts</Link>
      </div>
    </div>
  );
}
