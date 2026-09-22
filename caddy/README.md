# Caddy Proxy

The single public entry point for `navyfragen.app`. It fans one domain out to two
upstream chains: `/api/*` to a regional kodamachi server, everything else to the
WAF. It also owns the site's security headers and cache policy.

The [`Caddyfile`](Caddyfile) is deliberately comment-free. Everything that used to
be an inline comment lives here instead, so this file is the reference for why the
config reads the way it does.

## Topology

Production (Railway):

```
Railway edge (TLS) → Caddy Proxy
                       ├─ /api/*  → Navyfragen Server NA  (nf-region=us)
                       │          → Navyfragen Server EU  (everything else)
                       └─ /*      → Anubis WAF → opengraph-service → client
```

Local Docker Compose inverts the first two hops: Anubis is the outer entry point on
`:8080` and Caddy sits behind it on `:8082`, which is also the default local entry
point because it skips Anubis's proof-of-work check. See
[`docker/README.md`](../docker/README.md). Playwright gets its own Caddy on `:8090`
via `docker/docker-compose.e2e.yml`, for the same reason.

## Environment variables

| Variable | Production value | Purpose |
|---|---|---|
| `PORT` | injected by Railway | The site block's listen port. |
| `FRONTEND_DOMAIN` | `test-anubis.railway.internal` | Upstream for `/*`. Points at **Anubis**, not the client. |
| `FRONTEND_PORT` | `8080` | |
| `BACKEND_NA_DOMAIN` | `navyfragen-server-na.railway.internal` | `/api/*` upstream for `nf-region=us`. |
| `BACKEND_NA_PORT` | `8080` (default `3000`) | |
| `BACKEND_EU_DOMAIN` | `navyfragen-server.railway.internal` | `/api/*` upstream for everyone else. |
| `BACKEND_EU_PORT` | `8080` (default `3000`) | |
| `BACKEND_DOMAIN` / `BACKEND_PORT` | set, but unused by the Caddyfile | Legacy. Keep them set: [`entrypoint.sh`](entrypoint.sh) runs under `set -u` and dereferences them (falling back to `BACKEND_HOST`) before Caddy starts, so unsetting both crashes the container on boot. |

`BACKEND_PATH` overrides the `/api` prefix and defaults to `/api`. Nothing sets it.

Use [reference variables](https://docs.railway.com/guides/variables#referencing-another-services-variable)
(`${{Service.RAILWAY_PRIVATE_DOMAIN}}`) rather than hardcoding hostnames. The
`.railway/railway.ts` IaC file declares all of these as `preserve()`, so it will not
clobber whatever is set in the dashboard.

`entrypoint.sh` also strips a leading `https://` from the domains and splits a
`HOST:PORT`-style `FRONTEND_HOST` / `BACKEND_HOST` into its two halves, both for
backwards compatibility with the upstream template.

## Global options

`admin off` (no need for the admin API on Railway), `persist_config off` (storage
isn't persistent anyway), and `auto_https off` (Railway terminates TLS at its edge).
Runtime and access logs are both JSON, which is what the Axiom log drain expects.
`trusted_proxies static private_ranges` trusts Railway's proxy so `{remote_host}`
is the real client IP rather than the edge.

## Regional `/api/*` routing

`handle_path` strips the `/api` prefix before proxying, so the server's routes do
not start with `/api`.

Region is chosen by the `nf-region` cookie. `server/src/hono/auth-routes.ts` sets it
on `POST /oauth/consume` after resolving the user's PDS: `bsky.social` and
`*.bsky.network` map to `us`, everything else to `eu` (`server/src/lib/pds-region.ts`).
Requests without the cookie (first login, pre-auth, or a failed PDS resolution) fall
through to the EU backend. The chosen region is echoed as an `X-Backend-Region`
response header and appended to the access log as `backend_region`, which is the
fastest way to confirm routing in Axiom.

This is not just latency tuning. `RenderService` keeps question-image renders in an
in-process TTL cache, so a user's render and their polls have to land on the same
process. That holds only because each region runs `numReplicas: 1` **and** this
cookie pins the session. See the tripwire in [`server/CLAUDE.md`](../server/CLAUDE.md)
before raising either replica count.

## Load balancing and retries

Two different retry budgets, on purpose.

**`lb_settings` (API backends): 100 retries over 10s.** `/api/*` is stateless JSON,
so replaying a request that may never have reached the upstream costs nothing but
latency.

**`waf_lb_settings` (the `/*` WAF upstream): 2 retries over 3s.** Anubis owns
challenge state, and `/.within.website/.../pass-challenge` is a `GET`, which Caddy
treats as safe to replay when a connection fails. If Anubis has already marked the
challenge spent and the connection then drops, Caddy cannot tell that from an unsent
request, so it re-sends it and Anubis answers `double_spend`: a 500 the user sees as
"administrator has misconfigured Anubis" (issue #306, fixed in `9c2cf04`). Retries
here only need to cover a replica swap, not ride out a sustained outage.

Both upstreams use `dynamic a` DNS resolution with `refresh 1s`. Railway exposes
replicas as multiple DNS results on the private network, and this turns each result
into a separate upstream. `versions ipv4 ipv6` is required because that network is
IPv6-only. `lb_policy round_robin` has no stickiness, which is why the region cookie
carries the session affinity instead.

`passive_health_checks` is shared by both: `fail_duration 60s`, `max_fails 300`,
`unhealthy_latency 5s`, `unhealthy_request_count 200`. Deliberately slack, so a slow
render or a cold start does not eject a healthy single-replica upstream.

## Headers

`header_up Host {upstream_hostport}` is set on every proxy so the upstream sees the
resolved private hostname rather than `navyfragen.app`. The backend proxies also
forward `X-Forwarded-Proto`, `X-Forwarded-For` (from the trusted `{remote_host}`),
and `X-Forwarded-Host`.

Security headers are applied to every response: `X-Content-Type-Options: nosniff`,
`X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`,
`Permissions-Policy: geolocation=(), camera=(), microphone=()`, and `-Server` to drop
the Caddy version banner. These are asserted by the Nuclei DAST scan in
`DockerSmoke.yml`, which points at `http://caddy`.

## Caching

| Path | `Cache-Control` |
|---|---|
| `/assets/*` | `public, max-age=31536000, immutable` |
| `/api/*`, `/og-cache/*` | untouched, the upstream decides |
| everything else | `no-cache, no-store, must-revalidate` |

Vite emits content-hashed filenames under `/assets/`, so those can be cached forever.
`index.html`, the manifest, and the service worker must revalidate on every load or a
deploy strands clients on a stale bundle.

`/og-cache/*` is excluded from the catch-all because the `header` directive *replaces*
the header rather than merging: the opengraph shim varies it deliberately, a long
`max-age` for a stored render and a short one for the fallback it serves while a
render is still in flight. Flattening both to "never cache" would defeat the cache for
every crawler that hits it.

## Build

[`Dockerfile`](Dockerfile) is `FROM caddy:latest`, copies the Caddyfile and
entrypoint, strips CRLF line endings in case of a Windows checkout, and runs
`caddy fmt --overwrite Caddyfile` at build time. Formatting is therefore not
something you need to get right by hand, but a syntax error still only surfaces at
build.

The service pins `builder: "DOCKERFILE"` in `.railway/railway.ts` like every other
service in this repo. Do not let Railway's native detection take over: see
[`.claude/skills/railway-deployment/SKILL.md`](../.claude/skills/railway-deployment/SKILL.md).

## Origins

Started from Railway's [`brody192/reverse-proxy`](https://github.com/brody192/reverse-proxy)
template, whose MIT [`LICENSE`](LICENSE) is kept here. Very little of the original
survives beyond the `entrypoint.sh` host/port splitting and the general shape of the
site block.

Relevant Caddy docs: [the Caddyfile](https://caddyserver.com/docs/caddyfile),
[directives](https://caddyserver.com/docs/caddyfile/directives),
[`reverse_proxy`](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy),
[`handle_path`](https://caddyserver.com/docs/caddyfile/directives/handle_path).
