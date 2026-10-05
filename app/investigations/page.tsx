import type { Metadata } from "next";
import { InvestigationTile } from "@/components/investigation/investigation-tile";
import { PageHeader } from "@/components/page-header";
import { listInvestigations } from "@/lib/content";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
  title: "System Design Interview Questions",
  description:
    "Classic system design interview questions worked through from requirements: URL shortener, news feed, product analytics, chat storage, distributed cache, job queue, rate limiter, payments, notifications, live queries, sharding and more.",
  path: "/investigations",
});

export default function InvestigationsPage() {
  const investigations = listInvestigations();
  return (
    <div>
      <PageHeader title="Investigations">
        Each one is a system you design from its requirements: decide, explain why, see the consequences, break it,
        change the constraints, and defend what is left.
      </PageHeader>
      <section aria-label="All investigations" className="section pt-2 sm:pt-2">
        <ul className="space-y-3">
          {investigations.map((inv) => (
            <li key={inv.id}>
              <InvestigationTile investigation={inv} wide />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
