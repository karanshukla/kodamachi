/**
 * A DID-document PDS endpoint is attacker-controlled: a `did:web` can name a
 * host on Railway's private network, turning a public route into an SSRF proxy.
 * A real PDS is a public domain name over TLS, so IP literals and
 * internal-only suffixes are rejected before any request.
 *
 * @see [public-pds-url.test.ts](../tests/public-pds-url.test.ts): pins one
 * accepted host and one rejected host for each rule below.
 */

import { isIP } from "node:net";

const INTERNAL_SUFFIXES = [".internal", ".local", ".localhost", ".home.arpa"];

const IPV4_LITERAL = /^\d{1,3}(\.\d{1,3}){3}$/;

function isIpLiteral(hostname: string): boolean {
  // `URL` brackets IPv6 hosts.
  return hostname.startsWith("[") || IPV4_LITERAL.test(hostname) || isIP(hostname) !== 0;
}

function isInternalName(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.+$/, "");
  return !host || !host.includes(".") || INTERNAL_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

function parseIpv4Octets(ip: string): number[] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => (/^\d+$/.test(p) ? Number(p) : -1));
  return nums.every((n) => n >= 0 && n <= 255) ? nums : null;
}

function isPublicIpv4(ip: string): boolean {
  const octets = parseIpv4Octets(ip);
  if (!octets) return false;
  const [a, b, c] = octets;
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false; // 100.64.0.0/10 CGNAT
  if (a === 169 && b === 254) return false; // 169.254.0.0/16 link-local
  if (a === 172 && b >= 16 && b <= 31) return false; // 172.16.0.0/12 private
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false; // 192.0.0.0/24, 192.0.2.0/24
  if (a === 192 && b === 88 && c === 99) return false; // 192.88.99.0/24 6to4 relay
  if (a === 192 && b === 168) return false; // 192.168.0.0/16 private
  if (a === 198 && (b === 18 || b === 19)) return false; // 198.18.0.0/15 benchmarking
  if (a === 198 && b === 51 && c === 100) return false; // 198.51.100.0/24 TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return false; // 203.0.113.0/24 TEST-NET-3
  if (a >= 224) return false; // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved/broadcast
  return true;
}

function expandIpv6(raw: string): number[] | null {
  const addr = raw.toLowerCase().split("%")[0]!;
  let ipv6 = addr;
  if (ipv6.includes(".")) {
    const lastColon = ipv6.lastIndexOf(":");
    if (lastColon === -1) return null;
    const v4 = parseIpv4Octets(ipv6.slice(lastColon + 1));
    if (!v4) return null;
    const hi = ((v4[0]! << 8) | v4[1]!).toString(16);
    const lo = ((v4[2]! << 8) | v4[3]!).toString(16);
    ipv6 = `${ipv6.slice(0, lastColon)}:${hi}:${lo}`;
  }
  const halves = ipv6.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - (left.length + right.length);
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null;
  const groups = [...left, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...right];
  if (groups.length !== 8) return null;
  const words = groups.map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : -1));
  return words.every((w) => w >= 0 && w <= 0xffff) ? words : null;
}

function isPublicIpv6(ip: string): boolean {
  const w = expandIpv6(ip);
  if (!w) return false;
  // Unspecified ::/128 or Loopback ::1/128
  if (w.slice(0, 7).every((x) => x === 0) && (w[7] === 0 || w[7] === 1)) return false;
  // IPv4-mapped ::ffff:0:0/96 or IPv4-compatible ::/96
  if (w.slice(0, 5).every((x) => x === 0) && (w[5] === 0 || w[5] === 0xffff)) {
    const v4 = `${w[6]! >> 8}.${w[6]! & 0xff}.${w[7]! >> 8}.${w[7]! & 0xff}`;
    return isPublicIpv4(v4);
  }
  // NAT64 well-known prefix 64:ff9b::/96 and local-use 64:ff9b:1::/48
  if (w[0] === 0x0064 && w[1] === 0xff9b) return false;
  // Discard-only 100::/64
  if (w[0] === 0x0100 && w[1] === 0 && w[2] === 0 && w[3] === 0) return false;
  // Documentation 2001:db8::/32, IETF protocol assignments 2001::/23 (Teredo 2001:0000::/32)
  if (w[0] === 0x2001 && (w[1] === 0x0db8 || w[1]! < 0x0200)) return false;
  // 6to4 2002::/16 — check embedded IPv4
  if (w[0] === 0x2002) {
    const v4 = `${w[1]! >> 8}.${w[1]! & 0xff}.${w[2]! >> 8}.${w[2]! & 0xff}`;
    return isPublicIpv4(v4);
  }
  // Unique-local fc00::/7
  if ((w[0]! & 0xfe00) === 0xfc00) return false;
  // Link-local fe80::/10
  if ((w[0]! & 0xffc0) === 0xfe80) return false;
  // Site-local deprecated fec0::/10
  if ((w[0]! & 0xffc0) === 0xfec0) return false;
  // Multicast ff00::/8
  if ((w[0]! & 0xff00) === 0xff00) return false;
  // Only global unicast 2000::/3 is considered public
  return (w[0]! & 0xe000) === 0x2000;
}

export function isPublicUnicastIp(rawIp: string): boolean {
  const clean = rawIp.trim().replace(/^\[|\]$/g, "");
  const kind = isIP(clean);
  if (kind === 4) return isPublicIpv4(clean);
  if (kind === 6) return isPublicIpv6(clean);
  return false;
}

export function isPublicPdsUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  const host = url.hostname.replace(/\.+$/, "");
  if (!host) return false;
  return !isIpLiteral(host) && !isInternalName(host);
}
