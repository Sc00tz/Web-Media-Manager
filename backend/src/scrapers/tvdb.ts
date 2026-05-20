/**
 * TheTVDB API v4 scraper.
 * Docs: https://thetvdb.github.io/v4-api/
 *
 * Auth: POST /login with { apikey } → returns { data: { token } }
 * Token expires after 30 days. We cache it in memory and re-fetch when needed.
 * Rate limit: not officially published; be conservative (1 req/s burst).
 */
import type { ITvScraper, SearchQuery, SearchResult, ArtworkResult } from "@mediamanager/types";
import type { Show, Season, Episode, CastMember, Rating } from "@mediamanager/types";
import { ScraperError, ScraperNotConfiguredError, withRetry } from "./base.js";
import { getApiKey } from "../config/index.js";

const TVDB_BASE = "https://api4.thetvdb.com/v4";

// Artwork type IDs as returned by TVDB v4 /artwork/types
// https://thetvdb.github.io/v4-api/#/Artwork%20Types/getAllArtworkTypes
const TVDB_ARTWORK_TYPE: Record<number, ArtworkResult["type"] | null> = {
  1: "banner",
  2: "poster",
  3: "backdrop",
  5: "backdrop",    // fanart
  6: "backdrop",    // background
  7: "season_poster",
  8: "season_poster",
  11: "episode_thumb",
  14: "logo",
  16: "clearart",
  17: "disc",
};

interface TvdbLoginResponse {
  data: { token: string };
}

interface TvdbSearchItem {
  tvdb_id: string;
  name: string;
  type: string;
  year?: string;
  overview?: string;
  image_url?: string;
  score?: number;
}

interface TvdbExtendedSeries {
  id: number;
  name: string;
  slug: string;
  firstAired?: string;
  overview?: string;
  status?: { name: string };
  averageRuntime?: number;
  originalLanguage?: string;
  nameTranslations?: string[];
  genres?: Array<{ name: string }>;
  companies?: Array<{ name: string; companyType?: { companyTypeId: number } }>;
  characters?: TvdbCharacter[];
  artworks?: TvdbArtwork[];
  remoteIds?: Array<{ id: string; type: number }>;
  ratings?: Array<{ type: string; value: number; votes?: number }>;
  seasons?: TvdbSeason[];
}

interface TvdbSeason {
  id: number;
  number: number;
  name?: string;
  overview?: string;
  year?: string;
  tvdbId?: number;
  image?: string;
  imageType?: number;
}

interface TvdbEpisode {
  id: number;
  seasonNumber: number;
  number: number;
  name?: string;
  overview?: string;
  aired?: string;
  runtime?: number;
  image?: string;
}

interface TvdbCharacter {
  id: number;
  name: string;
  personName: string;
  type: number; // 3 = actor, 1 = director
  sort?: number;
  image?: string;
  peopleId?: number;
}

interface TvdbArtwork {
  id: number;
  image: string;
  type: number;
  width?: number;
  height?: number;
  language?: string;
  score?: number;
}

interface TvdbSeasonExtended {
  id: number;
  number: number;
  name?: string;
  overview?: string;
  year?: string;
  episodes?: TvdbEpisode[];
  artwork?: TvdbArtwork[];
}

let cachedToken: string | null = null;
let tokenFetchedAt = 0;
const TOKEN_TTL_MS = 29 * 24 * 60 * 60 * 1000; // 29 days

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() - tokenFetchedAt < TOKEN_TTL_MS) {
    return cachedToken;
  }

  if (!getApiKey("tvdb")) throw new ScraperNotConfiguredError("tvdb");

  const res = await fetch(`${TVDB_BASE}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apikey: getApiKey("tvdb") }),
  });

  if (!res.ok) {
    throw new ScraperError("tvdb", `Login failed: HTTP ${res.status}`, res.status);
  }

  const data = (await res.json()) as TvdbLoginResponse;
  cachedToken = data.data.token;
  tokenFetchedAt = Date.now();
  return cachedToken;
}

async function tvdbFetch<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const token = await getToken();

  const url = new URL(`${TVDB_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401) {
    // Token expired — clear cache and retry once
    cachedToken = null;
    const freshToken = await getToken();
    const retry = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${freshToken}` },
    });
    if (!retry.ok) {
      throw new ScraperError("tvdb", `HTTP ${retry.status}`, retry.status);
    }
    return retry.json() as Promise<T>;
  }

  if (!res.ok) {
    throw new ScraperError("tvdb", `HTTP ${res.status}: ${res.statusText}`, res.status);
  }

  return res.json() as Promise<T>;
}

function yearFromDate(dateStr?: string | null): number | undefined {
  if (!dateStr) return undefined;
  const y = parseInt(dateStr.slice(0, 4), 10);
  return isNaN(y) ? undefined : y;
}

function mapArtwork(items: TvdbArtwork[], source: "tvdb" = "tvdb"): ArtworkResult[] {
  return items
    .map((a): ArtworkResult | null => {
      const type = TVDB_ARTWORK_TYPE[a.type];
      if (!type) return null;
      return {
        type,
        url: a.image,
        width: a.width,
        height: a.height,
        language: a.language ?? undefined,
        votes: a.score ? Math.round(a.score) : undefined,
        source,
      };
    })
    .filter((x): x is ArtworkResult => x !== null);
}

export class TvdbScraper implements ITvScraper {
  readonly provider = "tvdb" as const;
  readonly priority = 1;

  isAvailable(): boolean {
    return Boolean(getApiKey("tvdb"));
  }

  async searchShows(query: SearchQuery): Promise<SearchResult[]> {
    if (!query.title) return [];

    const data = await withRetry(() =>
      tvdbFetch<{ data: TvdbSearchItem[] }>("/search", {
        query: query.title!,
        type: "series",
        limit: "10",
      })
    );

    return (data.data ?? []).map((r) => {
      const year = r.year ? parseInt(r.year, 10) : undefined;
      let confidence = 0.3;
      if (query.title) {
        const qTitle = query.title.toLowerCase();
        const rTitle = r.name.toLowerCase();
        if (rTitle === qTitle) confidence = 0.9;
        else if (rTitle.includes(qTitle) || qTitle.includes(rTitle)) confidence = 0.6;
      }
      if (query.year && year && Math.abs(year - query.year) <= 1) confidence += 0.1;

      return {
        id: r.tvdb_id,
        provider: "tvdb" as const,
        title: r.name,
        year,
        overview: r.overview,
        posterUrl: r.image_url,
        confidence: Math.min(confidence, 1),
      };
    });
  }

  async getShow(id: string): Promise<Partial<Show>> {
    const data = await withRetry(() =>
      tvdbFetch<{ data: TvdbExtendedSeries }>(`/series/${id}/extended`, {
        meta: "translations",
        short: "true",
      })
    );

    const s = data.data;

    const cast: CastMember[] = (s.characters ?? [])
      .filter((c) => c.type === 3) // actors only
      .map((c) => ({
        name: c.personName || c.name,
        character: c.name,
        order: c.sort,
        profilePath: c.image,
        tmdbPersonId: c.peopleId,
      }));

    const ratings: Rating[] = [];
    if (s.ratings) {
      for (const r of s.ratings) {
        ratings.push({ source: `tvdb_${r.type}`, value: r.value, votes: r.votes });
      }
    }

    const imdbId = s.remoteIds?.find((r) => r.type === 2)?.id;
    const networks = (s.companies ?? [])
      .filter((c) => c.companyType?.companyTypeId === 1)
      .map((c) => c.name);

    return {
      title: s.name,
      sortTitle: s.name.toLowerCase(),
      firstAirDate: s.firstAired,
      plot: s.overview,
      status: s.status?.name,
      tvdbId: s.id,
      imdbId,
      genres: (s.genres ?? []).map((g) => g.name),
      networks,
      cast,
      ratings,
    };
  }

  async getSeason(showId: string, seasonNumber: number): Promise<Partial<Season>> {
    // First get the extended series to find the season's TVDB ID
    const seriesData = await withRetry(() =>
      tvdbFetch<{ data: TvdbExtendedSeries }>(`/series/${showId}/extended`, { short: "true" })
    );

    const tvdbSeason = seriesData.data.seasons?.find((s) => s.number === seasonNumber);
    if (!tvdbSeason) return { seasonNumber };

    const seasonData = await withRetry(() =>
      tvdbFetch<{ data: TvdbSeasonExtended }>(`/seasons/${tvdbSeason.id}/extended`)
    );

    const sd = seasonData.data;
    return {
      seasonNumber: sd.number,
      title: sd.name,
      plot: sd.overview,
      airDate: sd.year,
      tvdbId: sd.id,
    };
  }

  async getEpisode(
    showId: string,
    seasonNumber: number,
    episodeNumber: number
  ): Promise<Partial<Episode>> {
    const data = await withRetry(() =>
      tvdbFetch<{ data: { episodes: TvdbEpisode[] } }>(
        `/series/${showId}/episodes/default`,
        { season: String(seasonNumber), episodeNumber: String(episodeNumber) }
      )
    );

    const ep = data.data.episodes?.[0];
    if (!ep) return {};

    return {
      episodeNumber: ep.number,
      title: ep.name,
      plot: ep.overview,
      airDate: ep.aired,
      runtime: ep.runtime,
      tvdbId: ep.id,
    };
  }

  async getShowArtwork(id: string): Promise<ArtworkResult[]> {
    const data = await withRetry(() =>
      tvdbFetch<{ data: TvdbExtendedSeries }>(`/series/${id}/artworks`, {
        lang: "eng",
      })
    );

    return mapArtwork(data.data.artworks ?? []);
  }
}

export const tvdbScraper = new TvdbScraper();
