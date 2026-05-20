import { z } from "zod";
import "dotenv/config";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3001),
  HOST: z.string().default("0.0.0.0"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().default("redis://localhost:6379"),

  TMDB_API_KEY: z.string().optional(),
  TVDB_API_KEY: z.string().optional(),
  FANART_API_KEY: z.string().optional(),
  OPENSUBTITLES_API_KEY: z.string().optional(),
  OPENSUBTITLES_USERNAME: z.string().optional(),
  OPENSUBTITLES_PASSWORD: z.string().optional(),
  SUBDL_API_KEY: z.string().optional(),

  CACHE_DIR: z.string().default("./cache"),
  UPLOAD_DIR: z.string().default("./uploads"),

  JWT_SECRET: z.string().default("dev-secret-change-in-production"),
});

function loadConfig() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error("Invalid environment configuration:");
    console.error(result.error.format());
    process.exit(1);
  }
  return result.data;
}

export const config = loadConfig();
export type Config = typeof config;

// Runtime API key overrides — DB values win over env values.
// Scrapers call getApiKey() instead of reading config directly.
const runtimeKeys: Partial<Record<string, string>> = {};

export function setRuntimeKey(provider: string, key: string): void {
  runtimeKeys[provider] = key;
}

export function getApiKey(provider: "tmdb" | "tvdb" | "fanart" | "opensubtitles" | "subdl"): string | undefined {
  if (runtimeKeys[provider]) return runtimeKeys[provider];
  switch (provider) {
    case "tmdb": return config.TMDB_API_KEY;
    case "tvdb": return config.TVDB_API_KEY;
    case "fanart": return config.FANART_API_KEY;
    case "opensubtitles": return config.OPENSUBTITLES_API_KEY;
    case "subdl": return config.SUBDL_API_KEY;
  }
}

export function getRuntimeUsername(provider: "opensubtitles"): string | undefined {
  return runtimeKeys[`${provider}_username`] ?? config.OPENSUBTITLES_USERNAME;
}

export function getRuntimePassword(provider: "opensubtitles"): string | undefined {
  return runtimeKeys[`${provider}_password`] ?? config.OPENSUBTITLES_PASSWORD;
}
