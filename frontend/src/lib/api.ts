import type { PaginatedResponse, MovieFilters, ShowFilters, ArtworkType } from "@mediamanager/types";

const BASE = "/api";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const hasBody = init?.body !== undefined && init.body !== null;
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    const msg = (body["message"] ?? body["error"]) as string | undefined;
    throw new Error(msg ?? `HTTP ${res.status}: ${res.statusText}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ─── Shared types (API shapes — lighter than full domain objects) ─────────────

export interface Library {
  id: string;
  name: string;
  path: string;
  type: "movie" | "tv";
  createdAt: string;
  updatedAt: string;
}

export interface Rating {
  source: string;
  value: string;
  votes?: number;
}

export interface CastMember {
  id: string;
  name: string;
  character?: string;
  order?: number;
  profilePath?: string;
}

export interface ArtworkItem {
  id: string;
  type: ArtworkType;
  filePath?: string;
  sourceUrl?: string;
  width?: number;
  height?: number;
  language?: string;
  active: boolean;
  source: string;
}

export interface VideoStream {
  codec: string;
  profile?: string;
  width?: number;
  height?: number;
  resolution: string;
  bitDepth?: number;
  hdrFormat?: string;
  hdrCompatibility?: string;
  frameRate?: string;
  aspectRatio?: string;
  scanType?: string;
  bitrate?: number;
}

export interface AudioStream {
  codec: string;
  channels?: number;
  channelLayout?: string;
  language?: string;
  languageName?: string;
  bitrate?: number;
  default?: boolean;
  commercial?: string;
}

export interface SubtitleStream {
  codec: string;
  language?: string;
  languageName?: string;
  title?: string;
  default?: boolean;
  forced?: boolean;
}

export interface MediaInfoItem {
  videoCodec?: string;
  audioCodec?: string;
  audioChannels?: number;
  hdrFormat?: string;
  resolution?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  container?: string;
  bitrate?: number;
  subtitleTracks?: string[] | null;
  streamsJson?: {
    video: VideoStream[];
    audio: AudioStream[];
    subtitles: SubtitleStream[];
  } | null;
}

// ─── Libraries ────────────────────────────────────────────────────────────────

export interface BrowseResult {
  current: string;
  parent: string | null;
  entries: { name: string; path: string; isDir: boolean }[];
}

export const libraryApi = {
  list: () => apiFetch<Library[]>("/libraries"),
  create: (body: { name: string; path: string; type: "movie" | "tv" }) =>
    apiFetch<Library>("/libraries", { method: "POST", body: JSON.stringify(body) }),
  delete: (id: string) => apiFetch<void>(`/libraries/${id}`, { method: "DELETE" }),
  scan: (id: string) => apiFetch<{ message: string }>(`/libraries/${id}/scan`, { method: "POST" }),
  browse: (dir?: string) => apiFetch<BrowseResult>(`/browse${dir ? `?dir=${encodeURIComponent(dir)}` : ""}`),
};

// ─── Movies ───────────────────────────────────────────────────────────────────

export interface MovieSummary {
  id: string;
  title: string;
  year?: number;
  status: "unmatched" | "matched" | "locked";
  tmdbId?: number;
  filePath: string;
  plot?: string;
  runtime?: number;
  certification?: string;
  metadataLocked: boolean;
  updatedAt: string;
  posterFilePath?: string | null;
  posterSourceUrl?: string | null;
}

export interface CrewMember {
  id: string;
  name: string;
  job?: string;
  department?: string;
}

export interface MovieDetail extends MovieSummary {
  originalTitle?: string;
  sortTitle?: string;
  releaseDate?: string;
  imdbId?: string;
  collectionName?: string;
  tagline?: string;
  edition?: string;
  country?: string;
  originalLanguage?: string;
  criticRating?: number;
  genres: string[];
  studios: string[];
  writers: string[];
  countries: string[];
  tags: string[];
  cast: CastMember[];
  crew: CrewMember[];
  ratings: Rating[];
  artwork: ArtworkItem[];
  mediaInfo?: MediaInfoItem;
}

export interface MovieFiltersExtended {
  search?: string;
  status?: "unmatched" | "matched" | "locked";
  genre?: string;
  yearMin?: number;
  yearMax?: number;
  resolution?: string;
  videoCodec?: string;
  // Artwork type filters
  missingArtwork?: boolean;
  missingPoster?: boolean;
  missingBackdrop?: boolean;
  missingLogo?: boolean;
  missingClearart?: boolean;
  // Metadata filters
  missingMetadata?: boolean;
  missingPlot?: boolean;
  missingDirector?: boolean;
  missingSubtitles?: boolean;
  missingMediaInfo?: boolean;
  sortBy?: "title" | "year" | "updatedAt" | "runtime";
  sortDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export interface MovieStats {
  total: number;
  unmatched: number;
  missingArtwork: number;
  missingSubtitles: number;
}

// Proxy URL helper — routes image requests through the backend proxy
export function proxyImageUrl(sourceUrl: string | undefined): string | undefined {
  if (!sourceUrl) return undefined;
  return `/api/proxy/image?url=${encodeURIComponent(sourceUrl)}`;
}

// Resolve the best displayable URL for an artwork item.
// Prefers the local file (served directly by backend) over remote sourceUrl.
export function artworkDisplayUrl(art: { id?: string; filePath?: string; sourceUrl?: string } | undefined): string | undefined {
  if (!art) return undefined;
  if (art.filePath) {
    // Include the artwork record's ID as a cache buster.
    // When an upload creates or updates a record, the ID (or its last few chars) ensures
    // the URL is unique per artwork version, forcing the browser to fetch the new file
    // even if it previously cached the same path under a different URL.
    const v = art.id ? `&v=${art.id.slice(-8)}` : "";
    return `/api/artwork/local?path=${encodeURIComponent(art.filePath)}${v}`;
  }
  if (art.sourceUrl) return proxyImageUrl(art.sourceUrl);
  return undefined;
}

export const movieApi = {
  list: (filters?: MovieFiltersExtended) => {
    const params = new URLSearchParams();
    if (filters?.search) params.set("search", filters.search);
    if (filters?.status) params.set("status", filters.status);
    if (filters?.genre) params.set("genre", filters.genre);
    if (filters?.yearMin) params.set("yearMin", String(filters.yearMin));
    if (filters?.yearMax) params.set("yearMax", String(filters.yearMax));
    if (filters?.resolution) params.set("resolution", filters.resolution);
    if (filters?.videoCodec) params.set("videoCodec", filters.videoCodec);
    if (filters?.missingArtwork) params.set("missingArtwork", "true");
    if (filters?.missingPoster) params.set("missingPoster", "true");
    if (filters?.missingBackdrop) params.set("missingBackdrop", "true");
    if (filters?.missingLogo) params.set("missingLogo", "true");
    if (filters?.missingClearart) params.set("missingClearart", "true");
    if (filters?.missingMetadata) params.set("missingMetadata", "true");
    if (filters?.missingPlot) params.set("missingPlot", "true");
    if (filters?.missingDirector) params.set("missingDirector", "true");
    if (filters?.missingSubtitles) params.set("missingSubtitles", "true");
    if (filters?.missingMediaInfo) params.set("missingMediaInfo", "true");
    if (filters?.sortBy) params.set("sortBy", filters.sortBy);
    if (filters?.sortDir) params.set("sortDir", filters.sortDir);
    if (filters?.page) params.set("page", String(filters.page));
    if (filters?.pageSize) params.set("pageSize", String(filters.pageSize));
    return apiFetch<PaginatedResponse<MovieSummary>>(`/movies?${params}`);
  },
  stats: () => apiFetch<MovieStats>("/movies/stats"),
  filterOptions: () => apiFetch<{ codecs: string[]; resolutions: string[] }>("/movies/filter-options"),
  scanMissing: () => apiFetch<{ message: string }>("/movies/scan-missing", { method: "POST" }),
  scanAllMediaInfo: () => apiFetch<{ message: string }>("/movies/scan-mediainfo", { method: "POST" }),
  get: (id: string) => apiFetch<MovieDetail>(`/movies/${id}`),
  scrape: (id: string) => apiFetch<{ message: string }>(`/movies/${id}/scrape`, { method: "POST" }),
  scanMediaInfo: (id: string) => apiFetch<{ message: string }>(`/movies/${id}/mediainfo`, { method: "POST" }),
  patchMetadata: (id: string, patch: Partial<MovieDetail> & { genres?: string[]; studios?: string[]; tags?: string[] }) =>
    apiFetch<{ success: boolean }>(`/movies/${id}/metadata`, { method: "PATCH", body: JSON.stringify(patch) }),
  bulkPatch: (ids: string[], patch: { metadataLocked?: boolean; tags?: string[] }) =>
    apiFetch<{ success: boolean; updated: number }>(`/movies/bulk`, { method: "PATCH", body: JSON.stringify({ ids, patch }) }),
};

// ─── Artwork ──────────────────────────────────────────────────────────────────

export const artworkApi = {
  movieList: (movieId: string, type?: ArtworkType) =>
    apiFetch<ArtworkItem[]>(`/movies/${movieId}/artwork${type ? `?type=${type}` : ""}`),
  movieRefresh: (movieId: string) =>
    apiFetch<{ message: string }>(`/movies/${movieId}/artwork/refresh`, { method: "POST" }),
  movieActivate: (movieId: string, artworkId: string) =>
    apiFetch<{ success: boolean }>(`/movies/${movieId}/artwork/${artworkId}/activate`, { method: "PUT" }),
  movieDelete: (movieId: string, artworkId: string) =>
    apiFetch<void>(`/movies/${movieId}/artwork/${artworkId}`, { method: "DELETE" }),
  movieAddUrl: (movieId: string, url: string, type: string) =>
    apiFetch<ArtworkItem>(`/movies/${movieId}/artwork`, { method: "POST", body: JSON.stringify({ url, type }) }),
  movieUploadFile: async (movieId: string, file: File, type: string): Promise<ArtworkItem> => {
    const form = new FormData();
    form.append("file", file);
    form.append("mediaId", movieId);
    form.append("mediaType", "movie");
    form.append("type", type);
    const res = await fetch("/api/upload/artwork", { method: "POST", body: form });
    if (!res.ok) throw new Error(await res.text());
    return res.json() as Promise<ArtworkItem>;
  },

  showList: (showId: string, type?: ArtworkType) =>
    apiFetch<ArtworkItem[]>(`/shows/${showId}/artwork${type ? `?type=${type}` : ""}`),
  showRefresh: (showId: string) =>
    apiFetch<{ message: string }>(`/shows/${showId}/artwork/refresh`, { method: "POST" }),
  showActivate: (showId: string, artworkId: string) =>
    apiFetch<{ success: boolean }>(`/shows/${showId}/artwork/${artworkId}/activate`, { method: "PUT" }),
  showAddUrl: (showId: string, url: string, type: string) =>
    apiFetch<ArtworkItem>(`/shows/${showId}/artwork`, { method: "POST", body: JSON.stringify({ url, type }) }),
  showUploadFile: async (showId: string, file: File, type: string): Promise<ArtworkItem> => {
    const form = new FormData();
    form.append("file", file);
    form.append("mediaId", showId);
    form.append("mediaType", "show");
    form.append("type", type);
    const res = await fetch("/api/upload/artwork", { method: "POST", body: form });
    if (!res.ok) throw new Error(await res.text());
    return res.json() as Promise<ArtworkItem>;
  },

  // Season artwork
  seasonList: (seasonId: string) =>
    apiFetch<ArtworkItem[]>(`/seasons/${seasonId}/artwork`),
  seasonAddUrl: (seasonId: string, showId: string, url: string, type: string) =>
    apiFetch<ArtworkItem>(`/seasons/${seasonId}/artwork`, { method: "POST", body: JSON.stringify({ url, type, showId }) }),
  seasonUploadFile: async (seasonId: string, showId: string, file: File, type: string): Promise<ArtworkItem> => {
    const form = new FormData();
    form.append("file", file);
    form.append("mediaId", seasonId);
    form.append("mediaType", "season");
    form.append("showId", showId);
    form.append("type", type);
    const res = await fetch("/api/upload/artwork", { method: "POST", body: form });
    if (!res.ok) throw new Error(await res.text());
    return res.json() as Promise<ArtworkItem>;
  },

  // Episode artwork
  episodeList: (episodeId: string) =>
    apiFetch<ArtworkItem[]>(`/episodes/${episodeId}/artwork`),
  episodeAddUrl: (episodeId: string, url: string, type: string) =>
    apiFetch<ArtworkItem>(`/episodes/${episodeId}/artwork`, { method: "POST", body: JSON.stringify({ url, type }) }),
  episodeUploadFile: async (episodeId: string, file: File, type: string): Promise<ArtworkItem> => {
    const form = new FormData();
    form.append("file", file);
    form.append("mediaId", episodeId);
    form.append("mediaType", "episode");
    form.append("type", type);
    const res = await fetch("/api/upload/artwork", { method: "POST", body: form });
    if (!res.ok) throw new Error(await res.text());
    return res.json() as Promise<ArtworkItem>;
  },
};

// ─── TV Shows ─────────────────────────────────────────────────────────────────

export interface ShowSummary {
  id: string;
  title: string;
  firstAirDate?: string;
  status?: string;
  tvdbId?: number;
  tmdbId?: number;
  folderPath: string;
  metadataLocked: boolean;
  updatedAt: string;
  posterFilePath?: string | null;
  posterSourceUrl?: string | null;
}

export interface SeasonSummary {
  id: string;
  showId: string;
  seasonNumber: number;
  title?: string;
  plot?: string;
  airDate?: string;
  artwork: ArtworkItem[];
  posterFilePath?: string | null;
  posterSourceUrl?: string | null;
}

export interface EpisodeSummary {
  id: string;
  seasonId: string;
  showId: string;
  seasonNumber?: number | null;
  episodeNumber: number;
  title?: string;
  plot?: string;
  airDate?: string;
  filePath?: string;
  runtime?: number;
  tvdbId?: number;
  tmdbId?: number;
  metadataLocked: boolean;
}

export interface ShowDetail extends ShowSummary {
  originalTitle?: string;
  sortTitle?: string;
  plot?: string;
  certification?: string;
  imdbId?: string;
  genres: string[];
  networks: string[];
  tags: string[];
  cast: CastMember[];
  ratings: Rating[];
  artwork: ArtworkItem[];
  seasons: SeasonSummary[];
}

export const showApi = {
  list: (filters?: ShowFilters) => {
    const params = new URLSearchParams();
    if (filters?.search) params.set("search", filters.search);
    if (filters?.page) params.set("page", String(filters.page));
    return apiFetch<PaginatedResponse<ShowSummary>>(`/shows?${params}`);
  },
  get: (id: string) => apiFetch<ShowDetail>(`/shows/${id}`),
  scrape: (id: string) => apiFetch<{ message: string }>(`/shows/${id}/scrape`, { method: "POST" }),
  getSeason: (showId: string, seasonNumber: number) =>
    apiFetch<SeasonSummary & { episodes: EpisodeSummary[] }>(`/shows/${showId}/seasons/${seasonNumber}`),
  patchMetadata: (id: string, patch: object) =>
    apiFetch<{ success: boolean }>(`/shows/${id}/metadata`, { method: "PATCH", body: JSON.stringify(patch) }),
  stats: () => apiFetch<{ total: number; unmatched: number; missingArtwork: number }>("/shows/stats"),
  scanMissing: () => apiFetch<{ message: string }>("/shows/scan-missing", { method: "POST" }),
};

export interface EpisodeDetail extends EpisodeSummary {
  mediaInfo?: MediaInfoItem;
  artwork: ArtworkItem[];
  subtitles: SubtitleItem[];
}

export const episodeApi = {
  get: (id: string) => apiFetch<EpisodeDetail>(`/episodes/${id}`),
  scrape: (id: string) => apiFetch<{ message: string }>(`/episodes/${id}/scrape`, { method: "POST" }),
  patchMetadata: (id: string, patch: object) =>
    apiFetch<{ success: boolean }>(`/episodes/${id}/metadata`, { method: "PATCH", body: JSON.stringify(patch) }),
  scanMediaInfo: (id: string) =>
    apiFetch<{ message: string }>(`/episodes/${id}/mediainfo`, { method: "POST" }),
  getArtwork: (id: string) => apiFetch<ArtworkItem[]>(`/episodes/${id}/artwork`),
};

// ─── Subtitles ────────────────────────────────────────────────────────────────

export interface SubtitleItem {
  id: string;
  language: string;
  forced: boolean;
  sdh: boolean;
  filePath?: string;
  source?: string;
  matchScore?: number | null;
}

export const subtitleApi = {
  movieList: (movieId: string) => apiFetch<SubtitleItem[]>(`/movies/${movieId}/subtitles`),
  movieSearch: (movieId: string, language = "en") =>
    apiFetch<{ found: number; inserted: number }>(`/movies/${movieId}/subtitles/search`, {
      method: "POST",
      body: JSON.stringify({ language }),
    }),
  movieDownload: (movieId: string, subtitleId: string) =>
    apiFetch<{ message: string }>(`/movies/${movieId}/subtitles/${subtitleId}/download`, { method: "POST" }),
  movieDelete: (movieId: string, subtitleId: string) =>
    apiFetch<void>(`/movies/${movieId}/subtitles/${subtitleId}`, { method: "DELETE" }),

  episodeList: (episodeId: string) => apiFetch<SubtitleItem[]>(`/episodes/${episodeId}/subtitles`),
  episodeSearch: (episodeId: string, language = "en") =>
    apiFetch<{ found: number }>(`/episodes/${episodeId}/subtitles/search`, {
      method: "POST",
      body: JSON.stringify({ language }),
    }),
  episodeDownload: (episodeId: string, subtitleId: string) =>
    apiFetch<{ message: string }>(`/episodes/${episodeId}/subtitles/${subtitleId}/download`, { method: "POST" }),

  status: () => apiFetch<{ available: boolean; note: string }>("/subtitles/status"),
};

// ─── Trailers ─────────────────────────────────────────────────────────────────

export interface TrailerItem {
  id: string;
  movieId: string;
  name: string;
  url: string;
  source: string;
  localPath?: string;
}

export const trailerApi = {
  list: (movieId: string) => apiFetch<TrailerItem[]>(`/movies/${movieId}/trailers`),
  add: (movieId: string, body: { name: string; url: string; source?: string }) =>
    apiFetch<TrailerItem>(`/movies/${movieId}/trailers`, { method: "POST", body: JSON.stringify(body) }),
  delete: (movieId: string, trailerId: string) =>
    apiFetch<void>(`/movies/${movieId}/trailers/${trailerId}`, { method: "DELETE" }),
  fetchFromTmdb: (movieId: string) =>
    apiFetch<{ added: number; total: number }>(`/movies/${movieId}/trailers/fetch`, { method: "POST" }),
};

// ─── Rename ───────────────────────────────────────────────────────────────────

export interface RenamePreviewItem {
  mediaId: string;
  mediaType: "movie" | "episode";
  oldPath: string;
  newPath: string;
  conflict: boolean;
  error?: string;
}

export const renameApi = {
  validate: (template: string, mediaType: "movie" | "episode") =>
    apiFetch<{ valid: boolean; errors: string[] }>("/rename/validate", {
      method: "POST",
      body: JSON.stringify({ template, mediaType }),
    }),
  preview: (mediaIds: string[], template: string, mediaType: "movie" | "episode") =>
    apiFetch<{ items: RenamePreviewItem[]; hasConflicts: boolean }>("/rename/preview", {
      method: "POST",
      body: JSON.stringify({ mediaIds, template, mediaType }),
    }),
  execute: (mediaIds: string[], template: string, mediaType: "movie" | "episode", dryRun = false) =>
    apiFetch<{ message: string; dryRun: boolean }>("/rename/execute", {
      method: "POST",
      body: JSON.stringify({ mediaIds, template, mediaType, dryRun }),
    }),
  undo: (batchId: string) =>
    apiFetch<{ undone: number; errors: string[] }>(`/rename/undo/${batchId}`, { method: "POST" }),
  journal: () => apiFetch<Array<{ batchId: string; executedAt: string; undoneAt?: string }>>("/rename/journal"),
  defaults: () => apiFetch<{ movie: string; episode: string }>("/rename/templates/defaults"),
  tokens: () => apiFetch<{ movie: string[]; episode: string[] }>("/rename/tokens"),
};

// ─── Tasks ────────────────────────────────────────────────────────────────────

export interface QueueStats {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
}

export const taskApi = {
  queues: () => apiFetch<QueueStats[]>("/tasks/queues"),
  list: (limit = 50) => apiFetch<unknown[]>(`/tasks?limit=${String(limit)}`),
};
