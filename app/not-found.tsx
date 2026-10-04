import Link from "next/link";

export default function NotFound() {
  return (
    <div className="section py-16">
      <div className="max-w-xl">
        <p className="eyebrow flex items-center gap-2.5">
          <span className="led led-partial" aria-hidden="true" />
          Error 404
        </p>
        <h1 className="mt-3 font-display text-[1.875rem] leading-[1.1]">Nothing at this address</h1>
        <p className="mt-3 max-w-xl text-[0.9375rem] text-ink-2">The page may have moved, or the link may be mistyped.</p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Link href="/investigations" className="btn btn-primary">
            Investigations
          </Link>
          <Link href="/concepts" className="btn btn-secondary">
            Concepts
          </Link>
        </div>
      </div>
    </div>
  );
}
