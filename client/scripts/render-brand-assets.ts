// Renders the brand-derived files in public/ from brand.json. client-metadata.json's scope must match
// OAUTH_SCOPE byte-for-byte. Committed output; Tests.yml's client job reruns this and fails on drift.
// Run with `bun scripts/render-brand-assets.ts` from client/.
import brand from "../../brand.json";
import { OAUTH_SCOPE } from "../../server/src/lib/contracts";

const { appName, appDomain, markTileRadius, markGlyphPath } = brand;
const origin = `https://${appDomain}`;

const markTile = `<rect width="160" height="160" rx="${markTileRadius}" fill="#10224A"/><path d="${markGlyphPath}" fill="#FFFFFF"/>`;
const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">${markTile}</svg>\n`;
const markSvg = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" width="160" height="160" role="img" aria-label="${appName}">${markTile}</svg>
`;

const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${origin}/</loc>
    <lastmod>2025-05-30</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`;

const clientMetadataJson =
  JSON.stringify(
    {
      client_name: `${appName} App`,
      client_id: `${origin}/client-metadata.json`,
      client_uri: origin,
      redirect_uris: [`${origin}/api/oauth/callback`],
      scope: OAUTH_SCOPE,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      application_type: "web",
      token_endpoint_auth_method: "none",
      dpop_bound_access_tokens: true,
    },
    null,
    2
  ) + "\n";

const publicDir = new URL("../public/", import.meta.url);
const sitemapPath = Bun.fileURLToPath(new URL("sitemap.xml", publicDir));
const clientMetadataPath = Bun.fileURLToPath(new URL("client-metadata.json", publicDir));

await Bun.write(sitemapPath, sitemapXml);
await Bun.write(clientMetadataPath, clientMetadataJson);
await Bun.write(new URL("favicon.svg", publicDir), faviconSvg);
await Bun.write(new URL("mark.svg", publicDir), markSvg);

// JSON.stringify breaks every array onto multiple lines; prettier restores the house style.
await Bun.$`bunx --bun prettier --write ${clientMetadataPath}`.quiet();
