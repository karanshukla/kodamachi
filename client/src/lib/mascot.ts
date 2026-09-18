export type MascotMood = "neutral" | "success" | "error";
export type MascotArt = MascotMood | "mark";

/** Maps `…/success.webp` to `{ success: url }`, keyed by file name without extension. */
export function artByName(files: Record<string, string>): Partial<Record<MascotArt, string>> {
  return Object.fromEntries(
    Object.entries(files).map(([path, url]) => [
      path.slice(path.lastIndexOf("/") + 1, path.lastIndexOf(".")),
      url,
    ])
  );
}

const art = artByName(
  import.meta.glob<string>("../assets/mascot/*.{svg,png,webp,avif}", {
    eager: true,
    query: "?url",
    import: "default",
  })
);

/** URL of the artwork for `name`, or undefined until that file is dropped into assets/mascot/. */
export function mascotSrc(name: MascotArt): string | undefined {
  return art[name];
}
