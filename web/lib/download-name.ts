/**
 * The file name a downloaded Image gets: a slug of the prompt plus the seed, for example
 * `A red fox, in snow!` with seed 123456 → `a-red-fox-in-snow_seed123456.png`.
 * Only a-z, 0-9, `-` and `_` appear in it, so it is safe in a Content-Disposition header.
 */

/** Longest the prompt's part of the name gets. */
const MAX_SLUG = 50;

export function downloadFileName(prompt: string, seed: number): string {
  const slug = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG)
    .replace(/-+$/, "");
  return `${slug || "image"}_seed${seed}.png`;
}
