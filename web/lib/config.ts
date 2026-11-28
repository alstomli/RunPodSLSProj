import "server-only";

export type Config = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
  runpodApiKey: string;
  runpodEndpointId: string;
  runpodApiBase: string;
  jobFollowerTimer: boolean;
};

const REQUIRED = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "RUNPOD_API_KEY",
  "RUNPOD_ENDPOINT_ID",
] as const;

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const missing = REQUIRED.filter((name) => !env[name]?.trim());
  if (missing.length) {
    throw new Error(`Missing environment variable(s): ${missing.join(", ")}`);
  }
  const value = (name: (typeof REQUIRED)[number]) => env[name]!.trim();
  const endpointId = value("RUNPOD_ENDPOINT_ID");
  return {
    supabaseUrl: value("SUPABASE_URL"),
    supabaseAnonKey: value("SUPABASE_ANON_KEY"),
    supabaseServiceRoleKey: value("SUPABASE_SERVICE_ROLE_KEY"),
    runpodApiKey: value("RUNPOD_API_KEY"),
    runpodEndpointId: endpointId,
    runpodApiBase: (env.RUNPOD_API_BASE?.trim() || `https://api.runpod.ai/v2/${endpointId}`).replace(/\/+$/, ""),
    jobFollowerTimer: env.JOB_FOLLOWER?.trim().toLowerCase() !== "off",
  };
}

let cached: Config | undefined;

export function config(): Config {
  return (cached ??= loadConfig());
}
