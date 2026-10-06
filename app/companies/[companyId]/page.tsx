import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InvestigationTile } from "@/components/investigation/investigation-tile";
import { PageHeader, Section } from "@/components/page-header";
import { Prose } from "@/components/prose";
import { ShareButton } from "@/components/share";
import { SourceList } from "@/components/writeup";
import { getCompany, getInvestigation, listCompanies, writeupsByCompany } from "@/lib/content";
import { breadcrumbs, clip, jsonLd, pageMetadata } from "@/lib/metadata";
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
    title: `${company.name} System Design: ${company.topic}`,
    description: clip(`${company.summary} What ${company.name}'s engineers published, and a system to practise it on.`),
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

  return (
    <div className="measure">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd({
            "@graph": [
              breadcrumbs([
                { name: "How companies do system design", path: "/companies" },
                { name: company.name, path: `/companies/${company.id}` },
              ]),
              {
                "@type": "CollectionPage",
                name: `${company.name}: ${company.topic}`,
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
              },
            ],
          }),
        }}
      />
      <PageHeader
        title={`${company.name}: ${company.topic.toLowerCase()}`}
        actions={
          <>
            {investigations[0] && (
              <Link href={`/investigations/${investigations[0].id}`} className="btn btn-primary">
                Practise it
              </Link>
            )}
            <a href={company.blogUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
              Their engineering blog
            </a>
            <ShareButton
              url={url}
              title={`${company.name}: ${company.topic} · ${SITE_NAME}`}
              text={`${company.topic}: how ${company.name} does it, with the original writeups and a design exercise.`}
            />
          </>
        }
      >
        {company.summary}
      </PageHeader>

      <Section id="idea" title="The idea">
        <div className="max-w-[66ch]">
          <Prose text={company.context} />
        </div>
      </Section>

      <Section id="read" title="Read the originals" description="Written by the engineers who built it.">
        <SourceList writeups={writeups} />
      </Section>

      {investigations.length > 0 && (
        <Section id="practise" title="Practise it" description="Make the decisions yourself, then compare.">
          <ul className="grid gap-3">
            {investigations.map((inv) => (
              <li key={inv.id}>
                <InvestigationTile investigation={inv} wide />
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
