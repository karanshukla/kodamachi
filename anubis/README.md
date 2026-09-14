# Anubis WAF

[Anubis](https://anubis.techaro.lol) sits in front of the client and the OpenGraph
shim and issues a one-time proof-of-work challenge to browsers. The policy is
[`botPolicy.json`](botPolicy.json); `scripts/bot-policy.test.ts` checks it against
what the client actually ships. Railway-side rules (the ed25519 key, the Valkey
challenge store) live in `.claude/skills/railway-deployment/SKILL.md`.

## What the challenge page can and cannot look like

The open-source Anubis image this service builds from (`ghcr.io/techarohq/anubis`)
has no branding hooks. Every option that would let the interstitial carry the
kodamachi mark or palette — `OVERLAY_FOLDER` (custom images and CSS),
`CHALLENGE_TITLE` / `ERROR_TITLE`, and `USE_TEMPLATES` (a full HTML rewrite) — is
flagged enterprise-only in upstream's configuration table and shipped only in the
paid BotStopper build. Setting them on the OSS image does nothing.

What the OSS build does honour, and what this policy sets:

| Setting                      | Where                                  | Effect                                                                                                                     |
| ---------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `openGraph.enabled`          | `botPolicy.json`                       | Anubis fetches the app's own `og:*` tags from behind the challenge, so link previews show the kodamachi card, not Anubis'. |
| `impressum.footer` / `.page` | `botPolicy.json`                       | A one-line footer on every challenge page, linking to a short "About this check" page. The only branded copy we control.   |
| `WEBMASTER_EMAIL`            | Railway service variable (not in repo) | Shown on Anubis error pages as the contact address. Optional; set it on the service if you want one shown.                 |

`openGraph.considerHost` is off because the service answers one host. If the
upstream image is ever switched to BotStopper, the mark lives at
`client/public/mark.svg`.
