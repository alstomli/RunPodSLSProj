import { describe, expect, it } from "vitest";
import { loadConfig } from "@/lib/config";

const ENV = {
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  RUNPOD_API_KEY: "key",
  RUNPOD_ENDPOINT_ID: "ep1",
};

describe("configuration", () => {
  it("names each missing or blank variable", () => {
    for (const name of Object.keys(ENV)) {
      expect(() => loadConfig({ ...ENV, [name]: undefined })).toThrow(name);
      expect(() => loadConfig({ ...ENV, [name]: "  " })).toThrow(name);
    }
  });

  it("sends Jobs to the Endpoint on Runpod unless RUNPOD_API_BASE overrides it", () => {
    expect(loadConfig(ENV).runpodApiBase).toBe("https://api.runpod.ai/v2/ep1");
    expect(loadConfig({ ...ENV, RUNPOD_API_BASE: "http://127.0.0.1:9999/" }).runpodApiBase).toBe("http://127.0.0.1:9999");
  });
});
