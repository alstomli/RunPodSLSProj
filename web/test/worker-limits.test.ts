import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LIMITS, MAX_SEED, SIZE_STEP } from "@/lib/settings";

const handler = fs.readFileSync(path.resolve(__dirname, "..", "..", "handler.py"), "utf8");

function pythonConstants(): Record<string, number> {
  const values: Record<string, number> = {};
  for (const line of handler.split(/\r?\n/)) {
    const match = line.match(/^([A-Z_, ]+?)\s*=\s*(.+)$/);
    if (!match) continue;
    const names = match[1].split(",").map((name) => name.trim());
    const expressions = match[2].split(",").map((value) => value.trim());
    names.forEach((name, i) => {
      if (/^[\d.\s*+-]+$/.test(expressions[i] ?? "")) values[name] = Number(new Function(`return ${expressions[i]}`)());
    });
  }
  return values;
}

describe("the settings limits", () => {
  it("are the Worker's own, so the form never allows what handler.py refuses", () => {
    const worker = pythonConstants();
    expect({
      size: LIMITS.size,
      sizeStep: SIZE_STEP,
      steps: LIMITS.steps.max,
      guidance: LIMITS.guidance.max,
      seed: MAX_SEED,
    }).toEqual({
      size: { min: worker.MIN_SIZE, max: worker.MAX_SIZE },
      sizeStep: worker.SIZE_STEP,
      steps: worker.MAX_STEPS,
      guidance: worker.MAX_GUIDANCE,
      seed: worker.MAX_SEED,
    });
  });
});
