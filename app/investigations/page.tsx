import type { Metadata } from "next";
import { InvestigationTile } from "@/components/investigation/investigation-tile";
import { PageHeader } from "@/components/page-header";
import { listInvestigations } from "@/lib/content";

export const metadata: Metadata = {
  title: "Investigations",
  description: "Real systems, worked through from requirements to failure modes.",
};

export default function InvestigationsPage() {
  const investigations = listInvestigations();
  return (
    <div>
      <PageHeader title="Investigations" meta={<span className="chip-flat">{investigations.length} systems</span>}>
        Each one is a real system you design from its requirements: decide, explain why, see the consequences, break it,
        change the constraints, and defend what is left. The sketch on each is the finished design; the outlined parts
        are the ones you work out.
      </PageHeader>
      <section aria-label="All investigations" className="section">
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
