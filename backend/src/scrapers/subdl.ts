/**
 * SubDL subtitle scraper.
 * API: https://subdl.com/api-doc
 * Key: register free at subdl.com (30 downloads/day free)
 *
 * Flow:
 *   GET /api/v1/subtitles?api_key=...&imdb_id=...&languages=EN&type=movie
 *   → { results: [{ sd_id, name, imdb_id, tmdb_id, ... }], subtitles: [...] }
 *
 *   When imdb_id/tmdb_id is supplied, `subtitles` is populated directly.
 *   When only film_name is supplied, `results` lists matching movies but `subtitles` is empty;
 *   a second call with the matched sd_id is then needed.
 *
 * Subtitle object fields:
 *   release_name, name (zip filename), url (/subtitle/xxx.zip),
 *   lang ("English"), language ("EN"), hi (hearing impaired),
 *   author, season, episode, full_season
 *
 * Download: GET https://dl.subdl.com{url}  → ZIP  → extract first subtitle file
 */
import AdmZip from "adm-zip";
import type { ISubtitleScraper, SubtitleResult } from "@mediamanager/types";
import { ScraperError, ScraperNotConfiguredError, withRetry } from "./base.js";
import { getApiKey } from "../config/index.js";

const SUBDL_API = "https://api.subdl.com/api/v1";
const SUBDL_DL  = "https://dl.subdl.com";

const SUBTITLE_EXTS = new Set([".srt", ".ass", ".ssa", ".sub", ".vtt"]);

interface SubDlMovie {
  sd_id: number;
  type: string;
  name: string;
  imdb_id?: string;
  tmdb_id?: number;
  year?: number | null;
  slug?: string;
}

interface SubDlSubtitle {
  release_name: string;
  name: string;          // zip filename
  lang: string;          // "English"
  language: string;      // "EN"
  author?: string;
  url: string;           // "/subtitle/xxx-yyy.zip"
  subtitlePage?: string;
  season?: number | null;
  episode?: number | null;
  hi: boolean;
  full_season?: boolean;
}

interface SubDlResponse {
  status: boolean;
  results?: SubDlMovie[];
  subtitles?: SubDlSubtitle[];
  error?: string;
}

function idFromUrl(url: string): string {
  // "/subtitle/3571207-8490171.zip"  →  "3571207-8490171"
  return url.replace(/^.*\/subtitle\//, "").replace(/\.zip$/, "");
}

async function subDlFetch(params: Record<string, string>): Promise<SubDlResponse> {
  const key = getApiKey("subdl");
  if (!key) throw new ScraperNotConfiguredError("subdl");

  const url = new URL(`${SUBDL_API}/subtitles`);
  url.searchParams.set("api_key", key);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": "MediaManager/0.1.0" },
  });

  if (res.status === 429) throw new ScraperError("subdl", "Rate limited", 429);
  if (res.status === 403) throw new ScraperError("subdl", "Invalid API key or quota exceeded", 403);
  if (!res.ok) throw new ScraperError("subdl", `HTTP ${res.status}`, res.status);

  return res.json() as Promise<SubDlResponse>;
}

function mapSubtitles(subs: SubDlSubtitle[], provider: "subdl" = "subdl"): SubtitleResult[] {
  return subs.map((s): SubtitleResult => ({
    id: idFromUrl(s.url),
    language: s.language?.toLowerCase() ?? s.lang.slice(0, 2).toLowerCase(),
    forced: false,
    sdh: s.hi,
    matchScore: 75, // SubDL doesn't expose download counts in subtitle objects
    source: provider,
    filename: s.release_name || s.name,
    downloadUrl: `${SUBDL_DL}${s.url}`,
  }));
}

export class SubDlScraper implements ISubtitleScraper {
  readonly provider = "subdl" as const;
  readonly priority = 1;

  isAvailable(): boolean {
    return Boolean(getApiKey("subdl"));
  }

  async searchSubtitles(params: {
    title: string;
    year?: number;
    imdbId?: string;
    language: string;
    season?: number;
    episode?: number;
  }): Promise<SubtitleResult[]> {
    const lang = params.language.toUpperCase();
    const type = params.season !== undefined ? "tv" : "movie";

    // Fast path: IMDB ID gives subtitles in a single call
    if (params.imdbId) {
      const data = await withRetry(() => subDlFetch({
        imdb_id: params.imdbId!.replace(/^tt/, ""),
        languages: lang,
        type,
        ...(params.season !== undefined ? { season_number: String(params.season) } : {}),
        ...(params.episode !== undefined ? { episode_number: String(params.episode) } : {}),
      }));

      if (data.status && data.subtitles?.length) {
        return mapSubtitles(data.subtitles);
      }
    }

    // Fallback: search by title, get sd_id, then fetch subtitles
    const searchData = await withRetry(() => subDlFetch({
      film_name: params.title,
      languages: lang,
      type,
      ...(params.year ? { year: String(params.year) } : {}),
    }));

    if (!searchData.status || !searchData.results?.length) return [];

    // If the response already has subtitles (can happen with exact matches), use them
    if (searchData.subtitles?.length) {
      return mapSubtitles(searchData.subtitles);
    }

    // Pick best movie match (exact TMDB match preferred)
    const best = searchData.results[0];
    if (!best) return [];

    const subtitleData = await withRetry(() => subDlFetch({
      sd_id: String(best.sd_id),
      languages: lang,
      ...(params.season !== undefined ? { season_number: String(params.season) } : {}),
      ...(params.episode !== undefined ? { episode_number: String(params.episode) } : {}),
    }));

    if (!subtitleData.status || !subtitleData.subtitles?.length) return [];
    return mapSubtitles(subtitleData.subtitles);
  }

  async downloadSubtitle(result: SubtitleResult): Promise<Buffer> {
    const dlUrl = result.downloadUrl ?? `${SUBDL_DL}/subtitle/${result.id}.zip`;

    const res = await fetch(dlUrl, {
      headers: { "User-Agent": "MediaManager/0.1.0" },
    });
    if (!res.ok) throw new ScraperError("subdl", `Download failed: HTTP ${res.status}`);

    const zipBuf = Buffer.from(await res.arrayBuffer());

    let zip: AdmZip;
    try {
      zip = new AdmZip(zipBuf);
    } catch {
      throw new ScraperError("subdl", "Failed to parse ZIP archive from SubDL");
    }

    const entry = zip.getEntries().find((e) => {
      const ext = e.entryName.slice(e.entryName.lastIndexOf(".")).toLowerCase();
      return SUBTITLE_EXTS.has(ext) && !e.isDirectory;
    });

    if (!entry) throw new ScraperError("subdl", "No subtitle file found in ZIP");
    return entry.getData();
  }
}

export const subDlScraper = new SubDlScraper();
