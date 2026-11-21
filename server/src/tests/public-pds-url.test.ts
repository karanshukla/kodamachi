import assert from "node:assert";
import { describe, it } from "bun:test";

import { isPublicPdsUrl, isPublicUnicastIp } from "../lib/public-pds-url";

describe("isPublicPdsUrl", () => {
  it("accepts a PDS addressed by a public domain name over TLS", () => {
    assert.strictEqual(isPublicPdsUrl("https://morel.us-east.host.bsky.network"), true);
  });

  it("accepts a self-hosted PDS on its own domain", () => {
    assert.strictEqual(isPublicPdsUrl("https://pds.example.social"), true);
  });

  it("rejects plain HTTP, which no real PDS serves", () => {
    assert.strictEqual(isPublicPdsUrl("http://pds.example.social"), false);
  });

  it("rejects a scheme that is not HTTP at all", () => {
    assert.strictEqual(isPublicPdsUrl("file:///etc/passwd"), false);
  });

  it("rejects an IPv4 literal", () => {
    assert.strictEqual(isPublicPdsUrl("https://10.0.0.5"), false);
  });

  it("rejects an IPv6 literal", () => {
    assert.strictEqual(isPublicPdsUrl("https://[::1]"), false);
  });

  it("rejects the cloud metadata address", () => {
    assert.strictEqual(isPublicPdsUrl("https://169.254.169.254"), false);
  });

  it("rejects a bare hostname with no dot in it", () => {
    assert.strictEqual(isPublicPdsUrl("https://localhost"), false);
    assert.strictEqual(isPublicPdsUrl("https://localhost."), false);
  });

  it("rejects a Railway private-network name, even with a trailing FQDN dot", () => {
    assert.strictEqual(isPublicPdsUrl("https://navyfragen-server.railway.internal"), false);
    assert.strictEqual(isPublicPdsUrl("https://navyfragen-server.railway.internal."), false);
  });

  it("rejects an mDNS name regardless of case", () => {
    assert.strictEqual(isPublicPdsUrl("https://Printer.LOCAL"), false);
    assert.strictEqual(isPublicPdsUrl("https://Printer.LOCAL."), false);
  });

  it("rejects a string that is not a URL", () => {
    assert.strictEqual(isPublicPdsUrl("not a url"), false);
  });
});

describe("isPublicUnicastIp", () => {
  it("accepts public IPv4 and IPv6 unicast addresses", () => {
    assert.strictEqual(isPublicUnicastIp("93.184.216.34"), true);
    assert.strictEqual(isPublicUnicastIp("2606:2800:220:1:248:1893:25c8:1946"), true);
  });

  it("rejects IPv4 240.0.0.0/4, private, loopback, and link-local ranges", () => {
    assert.strictEqual(isPublicUnicastIp("240.0.0.1"), false);
    assert.strictEqual(isPublicUnicastIp("255.255.255.255"), false);
    assert.strictEqual(isPublicUnicastIp("10.0.0.1"), false);
    assert.strictEqual(isPublicUnicastIp("127.0.0.1"), false);
    assert.strictEqual(isPublicUnicastIp("169.254.169.254"), false);
  });

  it("rejects IPv6 link-local, multicast, NAT64, unique-local, and loopback ranges", () => {
    assert.strictEqual(isPublicUnicastIp("::1"), false);
    assert.strictEqual(isPublicUnicastIp("fe80::1"), false);
    assert.strictEqual(isPublicUnicastIp("febf::1"), false);
    assert.strictEqual(isPublicUnicastIp("ff02::1"), false);
    assert.strictEqual(isPublicUnicastIp("64:ff9b::10.0.0.1"), false);
    assert.strictEqual(isPublicUnicastIp("fd00::1"), false);
  });
});
