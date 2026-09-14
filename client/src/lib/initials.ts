/**
 * Avatar fallback text: up to two initials from a display name or handle, so a
 * missing picture shows tint with navy letters rather than the brand mark.
 *
 * @see [initials.test.ts](../tests/lib/initials.test.ts): pins two words →
 * two letters, one word → one, and the empty case.
 */
export function initialsOf(name: string | null | undefined): string {
  const words = (name ?? "")
    .replace(/^@/, "")
    .split(/[\s._-]+/)
    .filter(Boolean);
  if (words.length === 0) return "?";
  return words
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}
