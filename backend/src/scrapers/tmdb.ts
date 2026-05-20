/**
 * TMDB API v3 scraper.
 * Docs: https://developer.themoviedb.org/reference/intro/getting-started
 *
 * Auth: API key passed as query param `api_key` (v3) or Bearer token (v4).
 * Rate limit: ~50 requests/second per API key.
 * Image base URL must be fetched from /configuration endpoint.
 */
import type {
  IMovieScraper,
  SearchQuery,
  SearchResult,
  ArtworkResult,
} from "@mediamanager/types";
import type { Movie, CastMember, CrewMember, Rating } from "@mediamanager/types";
import { ScraperError, ScraperNotConfiguredError, withRetry } from "./base.js";
import { getApiKey } from "../config/index.js";

const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

// These sizes match TMDB /configuration output as of 2024.
const POSTER_SIZE = "original";
const BACKDROP_SIZE = "original";
const PROFILE_SIZE = "h632";

interface TmdbMovie {
  id: number;
  title: string;
  original_title: string;
  overview: string;
  release_date: string;
  runtime: number;
  genres: Array<{ id: number; name: string }>;
  production_companies: Array<{ id: number; name: string }>;
  vote_average: number;
  vote_count: number;
  imdb_id: string;
  poster_path: string | null;
  backdrop_path: string | null;
  belongs_to_collection: { id: number; name: string; part_number?: number } | null;
  credits?: {
    cast: TmdbCastMember[];
    crew: TmdbCrewMember[];
  };
  videos?: {
    results: Array<{ name: string; key: string; site: string; type: string }>;
  };
  images?: {
    posters: TmdbImage[];
    backdrops: TmdbImage[];
    logos: TmdbImage[];
  };
  certification?: string;
}

interface TmdbCastMember {
  id: number;
  name: string;
  character: string;
  order: number;
  profile_path: string | null;
}

interface TmdbCrewMember {
  id: number;
  name: string;
  job: string;
  department: string;
  profile_path: string | null;
}

interface TmdbImage {
  file_path: string;
  width: number;
  height: number;
  iso_639_1: string | null;
  vote_average: number;
}

interface TmdbSearchResult {
  id: number;
  title: string;
  original_title: string;
  overview: string;
  release_date: string;
  poster_path: string | null;
  vote_average: number;
  vote_count: number;
}

async function tmdbFetch<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  if (!getApiKey("tmdb")) {
    throw new ScraperNotConfiguredError("tmdb");
  }

  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set("api_key", getApiKey("tmdb")!);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString());

  if (!res.ok) {
    throw new ScraperError("tmdb", `HTTP ${res.status}: ${res.statusText}`, res.status);
  }

  return res.json() as Promise<T>;
}

function posterUrl(path: string | null, size = POSTER_SIZE): string | undefined {
  if (!path) return undefined;
  return `${TMDB_IMAGE_BASE}/${size}${path}`;
}

function yearFromDate(dateStr?: string): number | undefined {
  if (!dateStr) return undefined;
  const y = parseInt(dateStr.slice(0, 4), 10);
  return isNaN(y) ? undefined : y;
}

function computeConfidence(result: TmdbSearchResult, query: SearchQuery): number {
  let score = result.vote_count > 0 ? 0.3 : 0.1;

  if (query.title) {
    const qTitle = query.title.toLowerCase().trim();
    const rTitle = result.title.toLowerCase().trim();
    const rOrig = result.original_title.toLowerCase().trim();
    if (rTitle === qTitle || rOrig === qTitle) score += 0.5;
    else if (rTitle.includes(qTitle) || qTitle.includes(rTitle)) score += 0.3;
  }

  if (query.year) {
    const rYear = yearFromDate(result.release_date);
    if (rYear === query.year) score += 0.2;
    else if (rYear && Math.abs(rYear - query.year) <= 1) score += 0.1;
  }

  return Math.min(score, 1);
}

export class TmdbScraper implements IMovieScraper {
  readonly provider = "tmdb" as const;
  readonly priority = 1;

  isAvailable(): boolean {
    return Boolean(getApiKey("tmdb"));
  }

  async searchMovies(query: SearchQuery): Promise<SearchResult[]> {
    if (!query.title) return [];

    const data = await withRetry(() =>
      tmdbFetch<{ results: TmdbSearchResult[] }>("/search/movie", {
        query: query.title!,
        ...(query.year ? { year: String(query.year) } : {}),
        language: query.language ?? "en-US",
      })
    );

    return data.results.slice(0, 10).map((r) => ({
      id: String(r.id),
      provider: "tmdb" as const,
      title: r.title,
      originalTitle: r.original_title,
      year: yearFromDate(r.release_date),
      overview: r.overview,
      posterUrl: posterUrl(r.poster_path, "w342"),
      confidence: computeConfidence(r, query),
    }));
  }

  async getMovie(id: string): Promise<Partial<Movie>> {
    const data = await withRetry(() =>
      tmdbFetch<TmdbMovie>(`/movie/${id}`, {
        append_to_response: "credits,videos,images,release_dates",
        language: "en-US",
        include_image_language: "en,null",
      })
    );

    const cast: CastMember[] = (data.credits?.cast ?? []).map((c) => ({
      name: c.name,
      character: c.character,
      order: c.order,
      profilePath: posterUrl(c.profile_path, PROFILE_SIZE),
      tmdbPersonId: c.id,
    }));

    const crew: CrewMember[] = (data.credits?.crew ?? []).map((c) => ({
      name: c.name,
      job: c.job,
      department: c.department,
      tmdbPersonId: c.id,
    }));

    const ratings: Rating[] = [];
    if (data.vote_count > 0) {
      ratings.push({ source: "tmdb", value: data.vote_average, votes: data.vote_count });
    }

    return {
      title: data.title,
      originalTitle: data.original_title,
      sortTitle: data.title.toLowerCase(),
      year: yearFromDate(data.release_date),
      releaseDate: data.release_date,
      plot: data.overview,
      runtime: data.runtime,
      tmdbId: data.id,
      imdbId: data.imdb_id || undefined,
      genres: data.genres.map((g) => g.name),
      studios: data.production_companies.map((c) => c.name),
      cast,
      crew,
      ratings,
      collectionName: data.belongs_to_collection?.name,
      tmdbCollectionId: data.belongs_to_collection?.id,
      status: "matched",
    };
  }

  async getMovieArtwork(id: string): Promise<ArtworkResult[]> {
    const data = await withRetry(() =>
      tmdbFetch<TmdbMovie>(`/movie/${id}`, {
        append_to_response: "images",
        include_image_language: "en,null",
      })
    );

    const results: ArtworkResult[] = [];

    for (const img of data.images?.posters ?? []) {
      results.push({
        type: "poster",
        url: `${TMDB_IMAGE_BASE}/${POSTER_SIZE}${img.file_path}`,
        width: img.width,
        height: img.height,
        language: img.iso_639_1 ?? undefined,
        votes: Math.round(img.vote_average * 100),
        source: "tmdb",
      });
    }

    for (const img of data.images?.backdrops ?? []) {
      results.push({
        type: "backdrop",
        url: `${TMDB_IMAGE_BASE}/${BACKDROP_SIZE}${img.file_path}`,
        width: img.width,
        height: img.height,
        language: img.iso_639_1 ?? undefined,
        votes: Math.round(img.vote_average * 100),
        source: "tmdb",
      });
    }

    for (const img of data.images?.logos ?? []) {
      results.push({
        type: "logo",
        url: `${TMDB_IMAGE_BASE}/original${img.file_path}`,
        width: img.width,
        height: img.height,
        language: img.iso_639_1 ?? undefined,
        source: "tmdb",
      });
    }

    return results;
  }
}

export const tmdbScraper = new TmdbScraper();
