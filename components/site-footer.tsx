import Link from "next/link";
import { ABOUT, LEARN, YOURS } from "@/components/nav-items";
import { Brand } from "@/components/site-nav";

export function SiteFooter() {
  const column = (title: string, items: typeof LEARN) => (
    <div>
      <p className="text-[0.8125rem] font-medium">{title}</p>
      <ul className="mt-3 space-y-2 text-[0.8125rem]">
        {items.map((item) => (
          <li key={item.href}>
            <Link href={item.href} prefetch={false} className="text-ink-2 hover:text-ink">
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <footer className="mt-16 border-t border-rule-soft bg-well">
      <div className="shell grid gap-10 py-12 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:gap-16">
        <div className="max-w-xs">
          <Brand />
          <p className="mt-4 text-[0.8125rem] leading-relaxed text-ink-2">
            System design practice that asks why, what breaks, and what changes at ten times the load.
          </p>
          <p className="mt-4 text-[0.75rem] leading-relaxed text-ink-3">
            Free, no accounts, no AI grading. Your progress stays in this browser; export it from{" "}
            <Link href="/understanding" className="underline underline-offset-2 hover:text-ink">
              Your progress
            </Link>
            .
          </p>
        </div>
        {column("Learn", LEARN)}
        {column("Yours", YOURS)}
        {column("Guide", ABOUT)}
      </div>
    </footer>
  );
}
