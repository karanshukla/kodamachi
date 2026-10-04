# Design source

`kodamachi-handoff/` is the Claude Design export the redesign was built from — nine
`.dc.html` artboards; `github.md` inside it maps every screen to the files under
`client/src`. The artboards are plain HTML/CSS: read them as source, which is what the
export's own README asks for. The `support.js` runtime the export ships for rendering
them in a browser is deliberately not vendored — it is generated third-party code
that trips the repo's code scanners and nothing here needs it; the original export
zip (or Claude Design itself) has it if you want to view an artboard live.

Read `Kodamachi Foundations.dc.html` first: palette, type and chrome rules.
`Kodamachi Share Images.dc.html` is the source for the OG card and the
three question-image themes; `Kodamachi System Surfaces.dc.html` covers push, the
PWA shell, the Anubis interstitial and the bot profile.

How the artboards map onto the token layers is in [`../design-tokens.md`](../design-tokens.md).
