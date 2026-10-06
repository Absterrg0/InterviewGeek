import type { ReactNode } from "react";

/** The opening of a page: a title, one paragraph saying what is here, and what to do next. */
export function PageHeader({
  title,
  eyebrow,
  children,
  meta,
  actions,
  aside,
}: {
  title: ReactNode;
  /** One quiet line above the title. */
  eyebrow?: ReactNode;
  children?: ReactNode;
  /** One quiet line of facts under the paragraph, e.g. "Intermediate · 40 min". */
  meta?: ReactNode;
  actions?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <header className="section rise grid gap-x-16 gap-y-8 pt-10 sm:pt-14 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div className="max-w-2xl">
        {eyebrow && <p className="mb-2 text-[0.8125rem] text-ink-3">{eyebrow}</p>}
        <h1 className="font-display text-[2rem] leading-[1.08] text-balance sm:text-[2.75rem]">{title}</h1>
        {children && (
          <p className="mt-4 max-w-[62ch] text-[1.0625rem] leading-relaxed text-ink-2 text-pretty">{children}</p>
        )}
        {meta && <p className="mt-3 text-[0.8125rem] text-ink-3">{meta}</p>}
        {actions && <div className="mt-6 flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {aside}
    </header>
  );
}

/** A titled block of the main column. */
export function Section({
  id,
  title,
  description,
  children,
  className = "",
  action,
}: {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className={`section scroll-mt-14 ${className}`}>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 id={id} className="font-display text-[1.5rem] leading-tight">
            {title}
          </h2>
          {description && (
            <p className="mt-1.5 max-w-[60ch] text-[0.875rem] leading-relaxed text-ink-2 text-pretty">{description}</p>
          )}
        </div>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

/** A plain list with small dashes, for requirements, assumptions and the like. */
export function DashList({ items, muted = false }: { items: readonly ReactNode[]; muted?: boolean }) {
  return (
    <ul className={`space-y-2 text-[0.9375rem] leading-relaxed ${muted ? "text-ink-2" : ""}`}>
      {items.map((item, i) => (
        <li key={i} className="flex gap-3">
          <span className="mt-[0.7rem] h-px w-2.5 shrink-0 bg-ink-3" aria-hidden="true" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
