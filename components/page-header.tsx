import type { ReactNode } from "react";

/** The opening of a page: a title and one paragraph saying what is here. */
export function PageHeader({
  title,
  children,
  meta,
  actions,
  aside,
}: {
  title: ReactNode;
  children?: ReactNode;
  /** Chips above the title. */
  meta?: ReactNode;
  actions?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <header className="section rise grid gap-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
      <div className="max-w-2xl">
        {meta && <div className="mb-4 flex flex-wrap gap-1.5">{meta}</div>}
        <h1 className="font-display text-[1.875rem] leading-[1.1] text-balance sm:text-[2.25rem]">{title}</h1>
        {children && <p className="mt-3 max-w-[60ch] text-[0.9375rem] leading-relaxed text-ink-2 text-pretty">{children}</p>}
        {actions && <div className="mt-6 flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {aside}
    </header>
  );
}

/**
 * A numbered section of the main column. The number is shown only when the
 * sections on a page are meant to be read in order.
 */
export function Section({
  id,
  n,
  title,
  description,
  children,
  className = "",
  action,
}: {
  id: string;
  n?: number;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className={`section scroll-mt-14 ${className}`}>
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        {n !== undefined && (
          <span className="font-mono text-[0.625rem] tabular-nums text-ink-3">{String(n).padStart(2, "0")}</span>
        )}
        <h2 id={id} className="font-display text-[1.0625rem] leading-tight">
          {title}
        </h2>
        {description && <p className="min-w-0 flex-1 basis-64 text-[0.8125rem] text-ink-3 text-pretty">{description}</p>}
        {action && <div className="ml-auto">{action}</div>}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}
