// Submits every URL in the live sitemap to IndexNow (Bing, Yandex, Seznam, Naver and others share
// submissions). Run after a deploy that adds or changes pages:  SITE_URL=https://example.com pnpm indexnow
import { readFileSync } from "node:fs";

const site = process.env.SITE_URL?.replace(/\/$/, "");
if (!site) {
  console.error("Set SITE_URL to the production origin, e.g. SITE_URL=https://example.com pnpm indexnow");
  process.exit(1);
}

const key = readFileSync(new URL("../lib/indexnow.ts", import.meta.url), "utf8").match(/INDEXNOW_KEY = "([a-f0-9]+)"/)?.[1];
const served = await fetch(`${site}/indexnow.txt`).then((r) => (r.ok ? r.text() : ""));
if (!key || served.trim() !== key) {
  console.error(`${site}/indexnow.txt does not serve the key in lib/indexnow.ts yet. Deploy first.`);
  process.exit(1);
}

const sitemap = await fetch(`${site}/sitemap.xml`).then((r) => r.text());
const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

const response = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host: new URL(site).host, key, keyLocation: `${site}/indexnow.txt`, urlList }),
});
console.log(`Submitted ${urlList.length} URLs: ${response.status} ${response.statusText}`);
if (!response.ok) process.exit(1);
