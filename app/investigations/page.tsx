import type { Metadata } from "next";
import Link from "next/link";
import { InvestigationIndex } from "@/components/investigation/investigation-index";
import { PageHeader } from "@/components/page-header";
import { listInvestigations } from "@/lib/content";
import { itemList, jsonLd, pageMetadata } from "@/lib/metadata";

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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd(
            itemList(
              "System design interview questions",
              investigations.map((inv) => ({ name: inv.searchTitle, path: `/investigations/${inv.id}` })),
            ),
          ),
        }}
      />
      <PageHeader title="System design interview questions">
        Each one is a system you design from its requirements: decide, explain why, see the consequences, break it,
        change the constraints, and defend what is left. New to the format? Start with{" "}
        <Link href="/system-design-interview" className="link">
          how the interview works
        </Link>
        .
      </PageHeader>
      <section aria-label="All investigations" className="section pt-2 sm:pt-2">
        <InvestigationIndex investigations={investigations} />
      </section>
    </div>
  );
}
