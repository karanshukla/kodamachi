# Mascot artwork

Drop the files here named by state; `src/lib/mascot.ts` picks them up by name.
Any of `.svg`, `.png`, `.webp` or `.avif`.

| File | Used for |
|---|---|
| `mark.*` | The small mascot that replaces 木 wherever `BrandMark` renders in the app |
| `neutral.*` | Inbox zero, closed inbox, home greeting, OAuth loading, profile notices |
| `success.*` | Question sent |
| `error.*` | 404, login failed, profile load failure |

A missing file keeps the current UI for that slot, so the art can land one state at a time.
The favicon, app icons, OG card and question images still draw 木 from `brand.json`.
