import { describe, expect, it } from "vitest";
import { downloadFileName } from "@/lib/download-name";

describe("the download file name", () => {
  it("turns punctuation and spaces into single dashes and appends the seed", () => {
    expect(downloadFileName("A red fox, in snow!", 123456)).toBe("a-red-fox-in-snow_seed123456.png");
    expect(downloadFileName("  --Hello__World...  2026?? ", 0)).toBe("hello-world-2026_seed0.png");
  });

  it("drops letters outside a-z instead of keeping them", () => {
    expect(downloadFileName("Café crème brûlée", 7)).toBe("caf-cr-me-br-l-e_seed7.png");
  });

  it("cuts a very long prompt to about 50 characters with no trailing dash", () => {
    const prompt =
      "A highly detailed oil painting of an old lighthouse on a rocky coast at dusk, waves crashing, gulls overhead";

    expect(downloadFileName(prompt, 42)).toBe("a-highly-detailed-oil-painting-of-an-old-lighthous_seed42.png");
    // Here the 50th character is a dash, which is dropped.
    expect(downloadFileName("word ".repeat(30), 1)).toBe("word-word-word-word-word-word-word-word-word-word_seed1.png");
  });

  it("falls back to 'image' when the prompt has no letters or digits", () => {
    expect(downloadFileName("!!! ??? ...", 99)).toBe("image_seed99.png");
    expect(downloadFileName("日本の風景", 5)).toBe("image_seed5.png");
  });
});
