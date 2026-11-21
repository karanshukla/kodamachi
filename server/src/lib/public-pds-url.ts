/**
 * A DID-document PDS endpoint is attacker-controlled: a `did:web` can name a
 * host on Railway's private network, turning a public route into an SSRF proxy.
 * A real PDS is a public domain name over TLS, so IP literals and
 * internal-only suffixes are rejected before any request.
 *
 * @see [public-pds-url.test.ts](../tests/public-pds-url.test.ts): pins one
 * accepted host and one rejected host for each rule below.
 */

const INTERNAL_SUFFIXES = [".internal", ".local", ".localhost", ".home.arpa"];

const IPV4_LITERAL = /^\d{1,3}(\.\d{1,3}){3}$/;

function isIpLiteral(hostname: string): boolean {
  // `URL` brackets IPv6 hosts.
  return hostname.startsWith("[") || IPV4_LITERAL.test(hostname);
}

function isInternalName(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return !host.includes(".") || INTERNAL_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

export function isPublicPdsUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  return !isIpLiteral(url.hostname) && !isInternalName(url.hostname);
}
