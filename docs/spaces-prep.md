# Spaces prep: what is built, what is waiting on upstream

Tracks the `spaces-prep` branch against atproto spaces (proposal
[0016](https://github.com/bluesky-social/proposals/tree/main/0016-permissioned-data),
reference PDS in [atproto#5187](https://github.com/bluesky-social/atproto/pull/5187)).
#5187 is still a draft. Names below are checked against the
`0.0.0-spaces-alpha-20261124235736` release on the `alpha` dist-tag (the Nov 24
release notes); each later release ships a migration note in `alpha-migrations/` on
that branch.

## Built

- `InboxStore` seam, every call scoped to a recipient (`server/src/services/inbox-store.ts`).
- `DualWriteInboxStore` and `InboxDrain` for the table-to-space move.
- `app.kodamachi.inbox.question` record lexicon.
- A drained marker (`inbox_drain` table, migration 015): `DualWriteInboxStore` reads
  the space only for a drained recipient, and `InboxDrain` marks one once its writes land.
  `MessageService.syncMessages` skips a drained user, so sync cannot recreate the
  legacy PDS records the drain deleted.

## Table-to-space migration

`InboxDrain` is that migration (write to target, then delete, `tid` as the key, so a
failed run repeats safely), but it has no real target yet and nothing runs it. To
finish it:

- Point it at `SpaceInboxStore` once that exists (item 3 below).
- Run it for every user with table rows, not only at that user's login, if the bake
  is to end on a cutoff date rather than on who happens to log in.
- Write the target with the recipient's own agent: the space is theirs, and the drain
  runs at their login with the session that just provisioned it. Users who never log
  in after cutover keep their rows in the table until the cutoff.
- Add a migration-completeness check (rows left in `message` with no `inbox_drain`
  marker) so the cutoff announcement has a number behind it.

## Not built, in order

1. **Space-type lexicon.** Sketch in `docs/spaces/app.kodamachi.inbox.draft.json`.
   The alpha `@atproto/lexicon` defines a `space` def (`collections`, optional `key`
   and `title`, 1–64 chars); the `key` value is still a guess. It lives outside
   `server/lexicons/` on purpose: the installed release has no `space` type, so
   `bun run lexgen` and `publish-lexicons` would reject it. Move it once the tooling
   accepts it. Every collection a space type lists must be a record lexicon that
   consumers can resolve, or their `lex install` fails, so publish
   `app.kodamachi.inbox.question` before the space type.
2. **Bot DID**, provisioned, with the write grant on its own account and only the
   manage grant requested of recipients at sign-in (#228 acceptance criteria). Space
   routes refuse app-password sessions, so the bot signs in with OAuth or its full
   password, unlike `publish-lexicons`.
3. **`SpaceInboxStore`** implementing `InboxStore` over `com.atproto.space.*`,
   through `@atproto/lex-space` (`SpaceClient` to write, `SpaceReader.listAll()` to
   read). The typed helpers take a collection NSID or a built record, not a schema:
   `listAll(app.kodamachi.inbox.question.$type)` with `repo` required, and
   `put(app.kodamachi.inbox.question.$build({ ... }), { rkey })`. Reads skip records
   with `valid: false`, which covers schema mismatches and records filed under a
   collection other than their `$type`, as `InboxDrain` skips legacy records that fail
   `validateRecord`. `putIgnoringDuplicates` keys on `tid`; pin "ignores a duplicate
   tid" and "writes a new tid" as a test pair. A server-side `SpaceReader` contacts
   hosts named by DID documents, so give it an SSRF-protected `fetch`; under Bun that
   means the patched `@atproto-labs/fetch-node` (#286), not the global `fetch`.
4. **Space creation** via `com.atproto.space.createSpace` (`{ spaceType, policy }`,
   returns `{ space }`) with a `com.atproto.memberspace.policy`, then the bot added
   with `com.atproto.memberspace.putMembers` (`members: [{ did, read, write: true }]`;
   all three fields are required). A space ref is
   `at:space/{recipientDid}/app.kodamachi.inbox/{skey}`; if one is stored, store that
   form and read it back through `SpaceRef.for()`, never by splitting the string.
5. **OAuth scope** `space:app.kodamachi.inbox?...` in the client metadata. Permission
   sets need the concrete type; wildcards are standalone-scope only.

## Settled in #228

The bot DID is the sole writer into a per-recipient space (the queue), because a
signed commit carries the author's key and askers have no identity. The queue drains
into the recipient's own PDS at login. The `message` table is kept only as the
rollback path during the bake (dual-writes), then dropped on an announced cutoff.
Access policy is `com.atproto.memberspace.policy` with the bot as sole member.

**The recipient owns the space**; the bot is a temporary passthrough. The recipient
provisions it at sign-in (`manage=create`) and adds the bot as the one member
(`manage=update`). Consequences:

- No space exists before a recipient's first post-cutover login, so until then their
  questions can only land in the `message` table. The table is the landing zone for
  unprovisioned recipients, not just a rollback path.
- Writes go to the bot's own repo inside the recipient's space (the queue); the login
  drain moves them into the recipient's repo and deletes them from the bot's.
- The member list and the data outlive kodamachi.

## Open, per #228

- **`allowedApps`** on the memberspace policy: omit it (any app reads) or list
  client ids. Setting it requires a client attestation on reads; it never limits
  writes.
- **Bot write ceiling**: one writer shares one rate-limit bucket. Space writes have
  their own budget, separate from the bot's public repo writes: 5,000 points an hour
  and 35,000 a day at 3 per create, so roughly 1,666 questions an hour and 11,666 a
  day across all users, unless the bot's PDS is self-hosted. Each recipient's host
  also accepts at most 1,500 `notifyRepoUpdate` calls an hour (10,000 a day) from the
  bot; past that the bot's host retries, so delivery slows rather than drops.
- **Drained marker meaning**: `inbox_drain` currently marks "table backfilled into the
  space". Recheck it against the login-time queue-to-PDS drain before wiring either.

## Upstream, as of the Nov 24 alpha

- Space URIs are `at:space/{spaceDid}/{spaceType}/{skey}[/{authorDid}/{collection}/{rkey}]`;
  the old `at://{spaceDid}/space/...` form is read leniently until beta and never
  written.
- Space methods refuse app-password sessions, privileged ones included.
- `updateSpace` replaces the policy wholesale; changing one field means reading it
  with `getSpace` and sending the whole object back.
- Space credentials come from `authorizeSpaceSync` with the delegation token in the
  request body; notification registration rides on the same call.
- Sync endpoints are `getLatestCommit`, `listRepoOps` and `listWriters`, with commits
  MACed through HTTP Message Signatures over an HPKE-derived secret.
- `@atproto/api@alpha` ships `com.atproto.space.*` and `com.atproto.memberspace.*`,
  and `@atproto/lex-space` wraps credentials, signing and record checks, so no
  hand-written clients.
- The reference PDS squashed its spaces migrations, so alpha PDS databases do not
  upgrade. A self-hosted bot PDS (the write-ceiling escape above) starts fresh.
