import { getCompany, listCompanies, writeupsByCompany } from "@/lib/content";
import { card, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og";

export function generateStaticParams() {
  return listCompanies().map((c) => ({ companyId: c.id }));
}

export const dynamicParams = false;
export const alt = "One idea from a company's engineering writing, with an investigation to practise it";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ companyId: string }> }) {
  const company = getCompany((await params).companyId);
  if (!company) return new Response("Not found", { status: 404 });
  const writeups = writeupsByCompany(company.id);
  const practised = new Set(writeups.flatMap((w) => w.investigationIds)).size;

  return card({
    label: company.name,
    title: company.topic,
    body: company.summary,
    aside: (
      <div style={{ display: "flex", flexDirection: "column", gap: 18, padding: "0 32px", width: "100%" }}>
        {writeups.slice(0, 3).map((w) => (
          <div key={w.id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", fontFamily: "Mono", fontSize: 15, letterSpacing: 1.5, color: "#858585" }}>
              {w.published.slice(0, 4)}
            </div>
            <div style={{ display: "flex", fontSize: 22, lineHeight: 1.25, color: "#e5e5e5" }}>{w.title}</div>
          </div>
        ))}
      </div>
    ),
    facts: [
      `${writeups.length} ${writeups.length === 1 ? "source" : "sources"}`,
      ...(practised > 0 ? [`${practised} to practise`] : []),
    ],
  });
}
