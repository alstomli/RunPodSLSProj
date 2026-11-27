/** Only a-z, 0-9, `-` and `_`: the file route puts it in Content-Disposition unescaped. */

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
