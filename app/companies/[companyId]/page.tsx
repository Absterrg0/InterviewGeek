import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InvestigationTile } from "@/components/investigation/investigation-tile";
import { PageHeader, Section } from "@/components/page-header";
import { Prose } from "@/components/prose";
import { ShareButton } from "@/components/share";
import { WriteupCard } from "@/components/writeup";
import { getCompany, getInvestigation, listCompanies, writeupsByCompany } from "@/lib/content";
import { jsonLd, pageMetadata } from "@/lib/metadata";
import { SITE_NAME, SITE_URL } from "@/lib/site";

export function generateStaticParams() {
  return listCompanies().map((c) => ({ companyId: c.id }));
}

export const dynamicParams = false;

export async function generateMetadata(props: PageProps<"/companies/[companyId]">): Promise<Metadata> {
  const { companyId } = await props.params;
  const company = getCompany(companyId);
  if (!company) return {};
  return pageMetadata({
    title: `${company.name} System Design: How They Built It`,
    description: `${company.summary} Case studies from ${company.name}'s engineers, summarised, with practice for each.`,
    path: `/companies/${company.id}`,
  });
}

export default async function CompanyPage(props: PageProps<"/companies/[companyId]">) {
  const { companyId } = await props.params;
  const company = getCompany(companyId);
  if (!company) notFound();

  const writeups = writeupsByCompany(company.id);
  const investigations = [...new Set(writeups.flatMap((w) => w.investigationIds))].flatMap((id) => {
    const inv = getInvestigation(id);
    return inv ? [inv] : [];
  });
  const url = `${SITE_URL}/companies/${company.id}`;

  let n = 0;
  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd({
            "@type": "CollectionPage",
            name: `${company.name} system design`,
            description: company.summary,
            url,
            isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
            about: { "@type": "Organization", name: company.name, url: company.blogUrl },
            mainEntity: {
              "@type": "ItemList",
              itemListElement: writeups.map((w, i) => ({
                "@type": "ListItem",
                position: i + 1,
                item: {
                  "@type": w.format === "paper" ? "ScholarlyArticle" : "CreativeWork",
                  name: w.title,
                  url: w.url,
                  datePublished: w.published,
                  author: w.authors.map((name) => ({ "@type": "Person", name })),
                },
              })),
            },
          }),
        }}
      />
      <PageHeader
        title={`How ${company.name} built it`}
        meta={
          <>
            <span className="chip">Company</span>
            <span className="chip-flat">
              {writeups.length} {writeups.length === 1 ? "source" : "sources"}
            </span>
          </>
        }
        actions={
          <>
            {investigations[0] && (
              <a href="#practise" className="btn btn-primary">
                Practise the same problems
              </a>
            )}
            <a href={company.blogUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
              {company.name}&apos;s engineering blog
            </a>
            <ShareButton
              url={url}
              title={`${company.name} system design · ${SITE_NAME}`}
              text={`How ${company.name} built it: their engineering writeups, summarised for system design interviews.`}
            />
          </>
        }
      >
        {company.summary}
      </PageHeader>

      <Section id="why" n={++n} title="Why read them">
        <div className="max-w-[66ch]">
          <Prose text={company.context} />
        </div>
      </Section>

      <Section
        id="writeups"
        n={++n}
        title="What their engineers wrote"
        description="Newest first. Summaries are ours; numbers are theirs. Each links to the original."
      >
        <div className="space-y-3">
          {writeups.map((w) => (
            <WriteupCard key={w.id} writeup={w} />
          ))}
        </div>
      </Section>

      {investigations.length > 0 && (
        <Section
          id="practise"
          n={++n}
          title="Practise the same problems"
          description="Investigations built from these writeups. Make the decisions yourself before you read how it went."
        >
          <ul className="grid gap-3 md:grid-cols-2">
            {investigations.map((inv) => (
              <li key={inv.id}>
                <InvestigationTile investigation={inv} />
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
