import type { Metadata } from "next";
import { InvestigationIndex } from "@/components/investigation/investigation-index";
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
        <InvestigationIndex investigations={investigations} />
      </section>
    </div>
  );
}
