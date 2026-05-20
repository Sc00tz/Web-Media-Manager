/**
 * OpenSubtitles REST API v1 scraper.
 * Docs: https://opensubtitles.stoplight.io/docs/opensubtitles-api
 *
 * Auth:
 *   - All requests need `Api-Key` header (free tier, required).
 *   - Download endpoint additionally needs a JWT bearer token obtained via POST /login.
 *   - JWT expires after 24 hours; we cache and refresh.
 *
 * Rate limits (free tier):
 *   - 5 requests/second
 *   - 200 requests/day for subtitle search
 *   - 20 subtitle downloads/day (40 for VIP)
 *   We surface remaining quota from response headers.
 *
 * Download flow:
 *   1. POST /download with { file_id } → returns { link, remaining }
 *   2. GET {link} → subtitle file content
 *   The download link is single-use and expires quickly.
 */
import type { ISubtitleScraper, SubtitleResult } from "@mediamanager/types";
import { ScraperError, ScraperNotConfiguredError, withRetry } from "./base.js";
import { getApiKey, getRuntimeUsername, getRuntimePassword } from "../config/index.js";

const OS_BASE = "https://api.opensubtitles.com/api/v1";

interface OsLoginResponse {
  token: string;
  user: { allowed_downloads: number };
}

interface OsSubtitleFile {
  file_id: number;
  file_name: string;
  cd_number?: number;
}

interface OsSubtitleAttribute {
  language: string;
  download_count: number;
  hearing_impaired: boolean;
  foreign_parts_only: boolean;
  files: OsSubtitleFile[];
  ratings: number;
  votes: number;
  feature_details: {
    feature_type: string;
    year?: number;
    title: string;
    imdb_id?: string;
    season_number?: number;
    episode_number?: number;
  };
}

interface OsSearchResult {
  id: string;
  attributes: OsSubtitleAttribute;
}

interface OsSearchResponse {
  data: OsSearchResult[];
  total_count: number;
}

interface OsDownloadResponse {
  link: string;
  file_name: string;
  remaining: number;
  requests: number;
  allowed: number;
}

let cachedToken: string | null = null;
let tokenFetchedAt = 0;
const TOKEN_TTL_MS = 23 * 60 * 60 * 1000; // 23 hours

function osHeaders(withAuth = false): Record<string, string> {
  const key = getApiKey("opensubtitles");
  if (!key) throw new ScraperNotConfiguredError("opensubtitles");
  const headers: Record<string, string> = {
    "Api-Key": key,
    "Content-Type": "application/json",
    "User-Agent": "MediaManager/0.1.0",
  };
  if (withAuth && cachedToken) {
    headers["Authorization"] = `Bearer ${cachedToken}`;
  }
  return headers;
}

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() - tokenFetchedAt < TOKEN_TTL_MS) return cachedToken;

  const username = getRuntimeUsername("opensubtitles");
  const password = getRuntimePassword("opensubtitles");
  if (!username || !password) {
    throw new ScraperError("opensubtitles", "Username and password required for downloads");
  }

  const res = await fetch(`${OS_BASE}/login`, {
    method: "POST",
    headers: osHeaders(),
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) throw new ScraperError("opensubtitles", `Login failed: HTTP ${res.status}`, res.status);

  const data = (await res.json()) as OsLoginResponse;
  cachedToken = data.token;
  tokenFetchedAt = Date.now();
  return cachedToken;
}

async function osFetch<T>(path: string, init?: RequestInit, withAuth = false): Promise<T> {
  if (!getApiKey("opensubtitles")) throw new ScraperNotConfiguredError("opensubtitles");

  const res = await fetch(`${OS_BASE}${path}`, {
    ...init,
    headers: { ...osHeaders(withAuth), ...(init?.headers as Record<string, string> ?? {}) },
  });

  if (res.status === 429) {
    throw new ScraperError("opensubtitles", "Rate limited — try again later", 429);
  }
  if (!res.ok) throw new ScraperError("opensubtitles", `HTTP ${res.status}`, res.status);

  return res.json() as Promise<T>;
}

function computeMatchScore(attr: OsSubtitleAttribute, params: {
  imdbId?: string;
  season?: number;
  episode?: number;
}): number {
  let score = 50;

  if (params.imdbId && attr.feature_details.imdb_id === params.imdbId) score += 30;

  const epMatch = params.season !== undefined &&
    attr.feature_details.season_number === params.season &&
    attr.feature_details.episode_number === params.episode;
  if (epMatch) score += 20;

  if (attr.votes > 10) score += 5;
  if (attr.ratings > 8) score += 5;

  return Math.min(score, 100);
}

export class OpenSubtitlesScraper implements ISubtitleScraper {
  readonly provider = "opensubtitles" as const;
  readonly priority = 1;

  isAvailable(): boolean {
    return Boolean(getApiKey("opensubtitles"));
  }

  async searchSubtitles(params: {
    title: string;
    year?: number;
    imdbId?: string;
    language: string;
    season?: number;
    episode?: number;
  }): Promise<SubtitleResult[]> {
    const searchParams = new URLSearchParams({
      query: params.title,
      languages: params.language,
      type: params.season !== undefined ? "episode" : "movie",
    });

    if (params.imdbId) searchParams.set("imdb_id", params.imdbId.replace("tt", ""));
    if (params.year) searchParams.set("year", String(params.year));
    if (params.season !== undefined) searchParams.set("season_number", String(params.season));
    if (params.episode !== undefined) searchParams.set("episode_number", String(params.episode));

    const data = await withRetry(() =>
      osFetch<OsSearchResponse>(`/subtitles?${searchParams}`)
    );

    return (data.data ?? []).flatMap((result): SubtitleResult[] => {
      const attr = result.attributes;
      return (attr.files ?? []).map((file) => ({
        id: String(file.file_id),
        language: attr.language,
        forced: attr.foreign_parts_only,
        sdh: attr.hearing_impaired,
        downloadUrl: undefined,
        matchScore: computeMatchScore(attr, params),
        source: "opensubtitles" as const,
        filename: file.file_name,
      }));
    });
  }

  async downloadSubtitle(result: SubtitleResult): Promise<Buffer> {
    await getToken();

    const dlData = await withRetry(() =>
      osFetch<OsDownloadResponse>("/download", {
        method: "POST",
        body: JSON.stringify({ file_id: parseInt(result.id, 10) }),
      }, true)
    );

    if (dlData.remaining === 0) {
      throw new ScraperError("opensubtitles", "Daily download quota exhausted");
    }

    const fileRes = await fetch(dlData.link);
    if (!fileRes.ok) throw new ScraperError("opensubtitles", `Download failed: HTTP ${fileRes.status}`);

    return Buffer.from(await fileRes.arrayBuffer());
  }
}

export const openSubtitlesScraper = new OpenSubtitlesScraper();
