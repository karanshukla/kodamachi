// Lives beside index.html rather than under src/ so the `include: ["src"]` tsc gate skips it.
// The opengraph-service shim fetches index.html from here: serve it as plain text/html, uncompressed.
// Run: bun serve.ts (PORT env, default 3000)

import { fileURLToPath } from "node:url";
import { dirname, normalize, join } from "node:path";
import { statSync } from "node:fs";

const DIST = join(dirname(fileURLToPath(import.meta.url)), "dist");
const PORT = Number(process.env.PORT ?? 3000);
const INDEX_HTML = join(DIST, "index.html");

// A bare "/" resolves to the dist/ directory; it must fall through to the SPA fallback (streaming a directory throws EISDIR).
function resolveStaticFile(urlPath: string): string | null {
  const clean = urlPath.split("?")[0]!.split("#")[0]!;
  // Decode first so encoded traversal (%2e%2e) is caught by normalize.
  const decoded = decodeURIComponent(clean);
  const resolved = normalize(join(DIST, decoded));
  if (!resolved.startsWith(DIST)) return null;
  try {
    return statSync(resolved).isFile() ? resolved : null;
  } catch {
    return null;
  }
}

// Caddy reaches this service over Railway's IPv6-only private network (same class of bug as #298):
// bind the IPv6 wildcard, which also serves IPv4, and fall back to 0.0.0.0 where IPv6 is absent.
function listen(fetch: (req: Request) => Response | Promise<Response>) {
  try {
    return Bun.serve({ port: PORT, hostname: "::", fetch });
  } catch (err) {
    console.warn("IPv6 wildcard bind failed, falling back to 0.0.0.0:", err);
    return Bun.serve({ port: PORT, hostname: "0.0.0.0", fetch });
  }
}

const server = listen(async (req) => {
  if (req.method !== "GET") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { "cache-control": "no-store" },
    });
  }

  const url = new URL(req.url);
  const filePath = resolveStaticFile(url.pathname);

  if (filePath) {
    const isImmutable = url.pathname.startsWith("/assets/");
    return new Response(Bun.file(filePath), {
      headers: {
        "cache-control": isImmutable ? "public, max-age=31536000, immutable" : "no-cache",
      },
    });
  }

  // SPA fallback; no-cache so a deploy is picked up without a hard refresh.
  return new Response(Bun.file(INDEX_HTML), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-cache",
    },
  });
});

console.log(`client (bun static) listening on http://localhost:${server.port}`);

export { server };
