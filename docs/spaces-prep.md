# Spaces prep: what is built, what is waiting on upstream

Tracks the `spaces-prep` branch against atproto spaces (proposal
[0016](https://github.com/bluesky-social/proposals/tree/main/0016-permissioned-data),
reference PDS in [atproto#5187](https://github.com/bluesky-social/atproto/pull/5187)).
Both are drafts; recheck before building on any name below.

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
- Decide whose credentials write the target: a bot-owned space is written by the bot,
  so the drain would need the bot's agent for the space and the user's agent only
  for deleting legacy PDS records.
- Add a migration-completeness check (rows left in `message` with no `inbox_drain`
  marker) so the cutoff announcement has a number behind it.

## Not built, in order

1. **Space-type lexicon.** Sketch in `docs/spaces/app.kodamachi.inbox.draft.json`.
   The field names under `main` are a guess from the proposal prose. It lives
   outside `server/lexicons/` on purpose: the installed `@atproto/lexicon` has no
   `space` type, so `bun run lexgen` and `publish-lexicons` would reject it. Move it
   once the tooling accepts it.
2. **Bot DID**, provisioned, with the write grant on its own account and only the
   manage grant requested of recipients at sign-in (#228 acceptance criteria).
3. **`SpaceInboxStore`** implementing `InboxStore` over `com.atproto.space.*`.
   `putIgnoringDuplicates` keys on `tid`; pin "ignores a duplicate tid" and
   "writes a new tid" as a test pair.
4. **Space creation** via `com.atproto.simplespace` (`createSpace`), owner per the
   open question above, `member-list` policy with the bot as sole member.
5. **OAuth scope** `space:app.kodamachi.inbox?...` in the client metadata. Permission
   sets need the concrete type; wildcards are standalone-scope only.

## Settled in #228

The bot DID is the sole writer into a per-recipient space (the queue), because a
signed commit carries the author's key and askers have no identity. The queue drains
into the recipient's own PDS at login. The `message` table is kept only as the
rollback path during the bake (dual-writes), then dropped on an announced cutoff.
Access policy is `#memberListPolicy` with the bot as sole member.

## Open, per #228

- **Who owns the space**, recipient or bot. It decides whether the member list
  survives kodamachi going away, and a recipient-owned space cannot exist before
  that recipient's first post-cutover login.
- **`appAccess`**: `#open` or an `#allowList` of client ids.
- **Bot write ceiling**: one writer shares one rate-limit bucket, roughly 1,666
  questions an hour across all users, unless the bot's PDS is self-hosted.
- **Drained marker meaning**: `inbox_drain` currently marks "table backfilled into the
  space". Recheck it against the login-time queue-to-PDS drain before wiring either.

## Upstream churn to watch

- `Repo` to `SpaceRepo`; `listSpaces` filters by `spaceType`; a `did` to `authority`
  rename was requested.
- DPoP replaced by HTTP Message Signatures.
- The PR's sync endpoints (`getRepoState`, `getRepoOplog`, `getMembers`) differ
  from the proposal's (`listRepoOps`, `getLatestCommit`).
- Check whether `@atproto/api` ships `com.atproto.space.*` before hand-writing clients.
