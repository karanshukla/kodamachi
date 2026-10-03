import { MARK_DATA_URI } from "#/lib/brand";

/** The sprout mark inlined as a data URI: html-to-image only lets `data:` and `https:` through, and a fetch mid-render would slow every image. */
export function brandMark(size: number): string {
  return `<img class="mark" src="${MARK_DATA_URI}" width="${size}" height="${size}" alt="" aria-hidden="true">`;
}
