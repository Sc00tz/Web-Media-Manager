import type { Movie, Show, Season, Episode, Artwork, Subtitle } from "./media.js";

export type ScraperProvider = "tmdb" | "tvdb" | "fanart" | "opensubtitles" | "subdl";

export interface SearchQuery {
  title?: string;
  year?: number;
  imdbId?: string;
  tmdbId?: number;
  tvdbId?: number;
  language?: string;
}

export interface SearchResult {
  id: string;
  provider: ScraperProvider;
  title: string;
  originalTitle?: string;
  year?: number;
  overview?: string;
  posterUrl?: string;
  confidence: number;
}

export interface ArtworkResult {
  type: Artwork["type"];
  url: string;
  width?: number;
  height?: number;
  language?: string;
  votes?: number;
  source: ScraperProvider;
}

export interface SubtitleResult {
  id: string;
  language: string;
  forced: boolean;
  sdh: boolean;
  downloadUrl?: string;
  matchScore: number;
  source: ScraperProvider;
  filename?: string;
}

export interface IScraper {
  readonly provider: ScraperProvider;
  readonly priority: number;
  isAvailable(): boolean;
}

export interface IMovieScraper extends IScraper {
  searchMovies(query: SearchQuery): Promise<SearchResult[]>;
  getMovie(id: string): Promise<Partial<Movie>>;
  getMovieArtwork?(id: string): Promise<ArtworkResult[]>;
}

export interface ITvScraper extends IScraper {
  searchShows(query: SearchQuery): Promise<SearchResult[]>;
  getShow(id: string): Promise<Partial<Show>>;
  getSeason?(showId: string, seasonNumber: number): Promise<Partial<Season>>;
  getEpisode?(showId: string, seasonNumber: number, episodeNumber: number): Promise<Partial<Episode>>;
  getShowArtwork?(id: string): Promise<ArtworkResult[]>;
}

export interface IArtworkScraper extends IScraper {
  getMovieArtwork(tmdbId: string): Promise<ArtworkResult[]>;
  getTvArtwork(tvdbId: string): Promise<ArtworkResult[]>;
}

export interface ISubtitleScraper extends IScraper {
  searchSubtitles(params: {
    title: string;
    year?: number;
    imdbId?: string;
    language: string;
    season?: number;
    episode?: number;
  }): Promise<SubtitleResult[]>;
  downloadSubtitle(result: SubtitleResult): Promise<Buffer>;
}
