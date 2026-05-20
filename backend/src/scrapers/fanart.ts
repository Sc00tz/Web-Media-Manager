/**
 * Fanart.tv API scraper.
 * Docs: https://fanarttv.docs.apiary.io/
 *
 * Auth: API key passed as query param `api_key`.
 * Movie images: GET /movies/{tmdb_id}
 * TV images:    GET /tv/{tvdb_id}
 *
 * Response structure: object keyed by artwork type, each value is an array of image objects.
 * Content license: Creative Commons — attribution required.
 */
import type { IArtworkScraper, ArtworkResult } from "@mediamanager/types";
import { ScraperError, ScraperNotConfiguredError, withRetry } from "./base.js";
import { getApiKey } from "../config/index.js";

const FANART_BASE = "https://webservice.fanart.tv/v3";

// Fanart.tv response key → our ArtworkType
const FANART_MOVIE_KEY_MAP: Record<string, ArtworkResult["type"]> = {
  movieposter: "poster",
  moviebackground: "backdrop",
  hdmovielogo: "logo",
  movielogo: "logo",
  hdmovieclearart: "clearart",
  movieart: "clearart",
  moviedisc: "disc",
  moviebanner: "banner",
  moviethumb: "thumb",
};

const FANART_TV_KEY_MAP: Record<string, ArtworkResult["type"]> = {
  tvposter: "poster",
  showbackground: "backdrop",
  hdtvlogo: "logo",
  clearlogo: "logo",
  hdclearart: "clearart",
  clearart: "clearart",
  tvbanner: "banner",
  tvthumb: "thumb",
  seasonposter: "season_poster",
  seasonbanner: "banner",
  seasonthumb: "thumb",
  characterart: "clearart",
};

interface FanartImage {
  id: string;
  url: string;
  lang: string;
  likes: string;
  season?: string;
}

type FanartMovieResponse = Record<string, FanartImage[] | string>;
type FanartTvResponse = Record<string, FanartImage[] | string>;

async function fanartFetch<T>(path: string): Promise<T> {
  if (!getApiKey("fanart")) throw new ScraperNotConfiguredError("fanart");

  const url = new URL(`${FANART_BASE}${path}`);
  url.searchParams.set("api_key", getApiKey("fanart")!);

  const res = await fetch(url.toString());

  if (res.status === 404) return {} as T;
  if (!res.ok) throw new ScraperError("fanart", `HTTP ${res.status}`, res.status);

  return res.json() as Promise<T>;
}

function mapImages(
  data: Record<string, FanartImage[] | string>,
  keyMap: Record<string, ArtworkResult["type"]>
): ArtworkResult[] {
  const results: ArtworkResult[] = [];

  for (const [key, images] of Object.entries(data)) {
    const artType = keyMap[key];
    if (!artType || !Array.isArray(images)) continue;

    for (const img of images) {
      results.push({
        type: artType,
        url: img.url,
        language: img.lang === "00" ? undefined : img.lang,
        votes: parseInt(img.likes, 10) || 0,
        source: "fanart",
      });
    }
  }

  return results;
}

export class FanartScraper implements IArtworkScraper {
  readonly provider = "fanart" as const;
  readonly priority = 2;

  isAvailable(): boolean {
    return Boolean(getApiKey("fanart"));
  }

  async getMovieArtwork(tmdbId: string): Promise<ArtworkResult[]> {
    const data = await withRetry(() =>
      fanartFetch<FanartMovieResponse>(`/movies/${tmdbId}`)
    );
    return mapImages(data, FANART_MOVIE_KEY_MAP);
  }

  async getTvArtwork(tvdbId: string): Promise<ArtworkResult[]> {
    const data = await withRetry(() =>
      fanartFetch<FanartTvResponse>(`/tv/${tvdbId}`)
    );
    return mapImages(data, FANART_TV_KEY_MAP);
  }
}

export const fanartScraper = new FanartScraper();
