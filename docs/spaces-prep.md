# Spaces prep: what is built, what is waiting on upstream

Tracks the `spaces-prep` branch against atproto spaces (proposal
[0016](https://github.com/bluesky-social/proposals/tree/main/0016-permissioned-data),
reference PDS in [atproto#5187](https://github.com/bluesky-social/atproto/pull/5187)).
Both are drafts; recheck before building on any name below.

## Built

- `InboxStore` seam, every call scoped to a recipient (`server/src/services/inbox-store.ts`).
- `DualWriteInboxStore` and `InboxDrain` for the table-to-space move.
- `app.kodamachi.inbox.question` record lexicon.

## Not built, in order

1. **Space-type lexicon.** Sketch in `docs/spaces/app.kodamachi.inbox.draft.json`.
   The field names under `main` are a guess from the proposal prose. It lives
   outside `server/lexicons/` on purpose: the installed `@atproto/lexicon` has no
   `space` type, so `bun run lexgen` and `publish-lexicons` would reject it. Move it
   once the tooling accepts it.
2. **Anonymous-send write path** (below).
3. **`SpaceInboxStore`** implementing `InboxStore` over `com.atproto.space.*`.
   `putIgnoringDuplicates` keys on `tid`; pin "ignores a duplicate tid" and
   "writes a new tid" as a test pair.
4. **Space creation** on first login or first drain, via `com.atproto.simplespace`
   (`createSpace`; recipient as authority, read and write policy `member-list`
   with the recipient as the only member).
5. **OAuth scope** `space:app.kodamachi.inbox?...` in the client metadata. Permission
   sets need the concrete type; wildcards are standalone-scope only.

## Open: who writes an anonymous question into the space

Space writes are OAuth-only and attributed to the repo owner. A sender has no
account, and the recipient is usually offline.

- **A. Table first, space at login.** Sends land in the table; `InboxDrain` moves
  them with the recipient's agent. No new trust, but the space lags until login.
- **B. Server writes with the recipient's stored OAuth session**, when it holds one
  with the space scope. Space is current, but the server now writes into user
  repos unattended, and a revoked or expired session has to fall back.

Recommendation: A now, B as an upgrade that reuses the same `InboxStore` contract.
Under B, `DualWriteInboxStore` keeps its order (table before space on write), and
the drain stays as the reconciler for sessions that lapsed.

## Upstream churn to watch

- `Repo` to `SpaceRepo`; `listSpaces` filters by `spaceType`; a `did` to `authority`
  rename was requested.
- DPoP replaced by HTTP Message Signatures.
- The PR's sync endpoints (`getRepoState`, `getRepoOplog`, `getMembers`) differ
  from the proposal's (`listRepoOps`, `getLatestCommit`).
- Check whether `@atproto/api` ships `com.atproto.space.*` before hand-writing clients.
