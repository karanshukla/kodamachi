import {
  buildWaypointsForParsed,
  parseURI,
  WAYPOINT_DESTINATIONS_DATA,
  WAYPOINT_ORDER,
  waypointActivity,
  type WaypointData,
} from "@aturi.to/waypoints";
import { Logger } from "pino";

import { EXTRA_APPS } from "../lib/atmosphere-extras";
import { isPublicPdsUrl } from "../lib/public-pds-url";
import { withRetry } from "../lib/retry";
import { createTtlCache } from "../lib/ttl-cache";

export interface AtprotoDataResolver {
  did: { resolveAtprotoData(did: string): Promise<{ pds?: string } | undefined> };
}

/** A public page never pays for a repo scan twice in an hour. */
const PRESENCE_TTL_MS = 60 * 60 * 1000;

/** Failures are cached too, but briefly: a transient outage must not hide apps for an hour. */
const FAILURE_TTL_MS = 5 * 60 * 1000;

const MAX_CACHED_REPOS = 500;

/** Per attempt, not per loop, so one hung PDS cannot eat the retry budget. */
const DESCRIBE_REPO_TIMEOUT_MS = 5000;

const NO_APPS: string[] = [];

interface DescribeRepoResponse {
  collections?: string[];
}

/** Records every Bluesky account has, so evidence of nothing: Deer, Northsky etc. are alternative readers. */
const BLUESKY_PREFIX = "app.bsky.";

function beyondBluesky(entry: WaypointData): string[] {
  return (entry.expectedCollections ?? []).filter((prefix) => !prefix.startsWith(BLUESKY_PREFIX));
}

/** One key per body of data, so five readers of one blog are one icon. */
function dataFamilyOf(entry: WaypointData): string {
  return entry.redirectCompat.join("|");
}

/**
 * The Atmosphere apps whose own records `collections` contains, one per body of
 * data, in the catalog's recommendation order. Judged only on prefixes outside
 * `app.bsky.`: "what else does this account publish", not "what could open it".
 *
 * @see [atmosphere-service.test.ts](../tests/atmosphere-service.test.ts):
 * "omits a Bluesky-only client every account would match" and "counts five
 * readers of one blog once".
 */
export function appsPresentIn(collections: ReadonlySet<string>): string[] {
  const seenFamilies = new Set<string>();
  const present: string[] = [];

  for (const id of WAYPOINT_ORDER) {
    const entry = WAYPOINT_DESTINATIONS_DATA[id];
    if (!entry) continue;
    const expectedCollections = beyondBluesky(entry);
    if (waypointActivity({ expectedCollections }, collections) !== "present") continue;

    const family = dataFamilyOf(entry);
    if (seenFamilies.has(family)) continue;
    seenFamilies.add(family);
    present.push(id);
  }

  for (const app of EXTRA_APPS) {
    if (
      waypointActivity({ expectedCollections: app.collectionPrefixes }, collections) === "present"
    ) {
      present.push(app.id);
    }
  }

  return present;
}

export interface AtmosphereAppLink {
  id: string;
  name: string;
  url: string;
}

/**
 * Turns the ids `appsPresentIn` found into names and destinations. Separate
 * from the scan because the scan is cached per DID and a handle can change
 * inside that window.
 *
 * @see [atmosphere-service.test.ts](../tests/atmosphere-service.test.ts):
 * "drops an app that cannot address this account".
 */
export function appLinksFor(
  ids: readonly string[],
  handle: string | undefined,
  did: string | undefined
): AtmosphereAppLink[] {
  if (!handle) return [];

  const parsed = parseURI(handle);
  const target = did ? { ...parsed, did } : parsed;
  const catalogUrls = new Map(
    buildWaypointsForParsed(target).waypoints.map((waypoint) => [waypoint.id, waypoint.url])
  );
  const extrasById = new Map(EXTRA_APPS.map((app) => [app.id, app]));

  return ids.flatMap((id) => {
    const extra = extrasById.get(id);
    if (extra) return [{ id, name: extra.name, url: extra.profileUrl(handle) }];

    const url = catalogUrls.get(id);
    return url ? [{ id, name: WAYPOINT_DESTINATIONS_DATA[id].name, url }] : [];
  });
}

export class AtmosphereService {
  private cache = createTtlCache<string[]>(MAX_CACHED_REPOS);

  constructor(
    private idResolver: AtprotoDataResolver,
    private logger: Logger,
    private fetchImpl: typeof fetch = fetch
  ) {}

  /**
   * Which Atmosphere apps an account uses, read off its own PDS. Never rejects:
   * a bad PDS answers "no apps" rather than taking the profile down.
   *
   * @see [atmosphere-service.test.ts](../tests/atmosphere-service.test.ts):
   * "answers with no apps rather than throwing when the PDS is unreachable".
   */
  async presenceFor(did: string): Promise<string[]> {
    const cached = this.cache.get(did);
    if (cached) return cached;

    try {
      const present = appsPresentIn(await this.scanRepo(did));
      this.cache.set(did, present, PRESENCE_TTL_MS);
      return present;
    } catch (err) {
      this.logger.warn({ err, did }, "Failed to scan repo for Atmosphere apps");
      this.cache.set(did, NO_APPS, FAILURE_TTL_MS);
      return NO_APPS;
    }
  }

  private async scanRepo(did: string): Promise<Set<string>> {
    const atprotoData = await this.idResolver.did.resolveAtprotoData(did);
    const pds = atprotoData?.pds;
    if (!pds || !isPublicPdsUrl(pds)) {
      throw new Error(`Refusing to scan a repo at a non-public PDS: ${pds}`);
    }

    const url = `${pds.replace(/\/$/, "")}/xrpc/com.atproto.repo.describeRepo?repo=${encodeURIComponent(did)}`;
    const body = await withRetry(() => this.readDescribeRepo(url), this.logger, {
      did,
      op: "describeRepo",
    });
    return new Set(body.collections ?? []);
  }

  /**
   * `redirect: "manual"` is the other half of `isPublicPdsUrl`: a public host
   * can 302 to a private address (SSRF). A real describeRepo never redirects.
   *
   * @see [atmosphere-service.test.ts](../tests/atmosphere-service.test.ts):
   * "refuses to follow a redirect away from the PDS it validated".
   */
  private async readDescribeRepo(url: string): Promise<DescribeRepoResponse> {
    const response = await this.fetchImpl(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(DESCRIBE_REPO_TIMEOUT_MS),
    });
    if (response.status >= 300 && response.status < 400) {
      throw new Error(`describeRepo redirected to ${response.headers.get("location")}`);
    }
    if (!response.ok) {
      throw new Error(`describeRepo answered ${response.status}`);
    }
    return (await response.json()) as DescribeRepoResponse;
  }
}
