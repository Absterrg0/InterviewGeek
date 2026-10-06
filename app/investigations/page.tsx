import type { Metadata } from "next";
import { InvestigationTile } from "@/components/investigation/investigation-tile";
import { PageHeader } from "@/components/page-header";
import { listInvestigations } from "@/lib/content";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
  title: "System Design Interview Questions",
  description:
    "Classic system design interview questions, worked step by step: URL shortener, rate limiter, news feed, chat, payments, job queue, distributed cache and more.",
  path: "/investigations",
});

export default function InvestigationsPage() {
  const investigations = listInvestigations();
  return (
    <div>
      <PageHeader title="System design interview questions">
        Each one is a system you design from its requirements: decide, explain why, see the consequences, break it,
        change the constraints, and defend what is left.
      </PageHeader>
      <section aria-label="All investigations" className="section pt-2 sm:pt-2">
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {investigations.map((inv) => (
            <li key={inv.id}>
              <InvestigationTile investigation={inv} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
