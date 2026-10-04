import type { MetadataRoute } from "next";
import { listConcepts, listInvestigations } from "@/lib/content";
import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = [
    "/",
    "/investigations",
    "/concepts",
    "/practice",
    "/interview",
    ...listInvestigations().flatMap((inv) => [
      `/investigations/${inv.id}`,
      `/investigations/${inv.id}/review`,
      ...inv.stages.map((s) => `/investigations/${inv.id}/${s.id}`),
    ]),
    ...listConcepts().map((c) => `/concepts/${c.id}`),
  ];
  return paths.map((path) => ({ url: `${SITE_URL}${path}` }));
}
