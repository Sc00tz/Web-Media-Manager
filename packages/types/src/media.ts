export type MediaType = "movie" | "show" | "season" | "episode";
export type LibraryType = "movie" | "tv";
export type MetadataStatus = "unmatched" | "matched" | "locked";
export type ArtworkType =
  | "poster"
  | "backdrop"
  | "logo"
  | "clearart"
  | "disc"
  | "season_poster"
  | "episode_thumb"
  | "banner"
  | "thumb";

export interface Library {
  id: string;
  name: string;
  path: string;
  type: LibraryType;
  createdAt: Date;
  updatedAt: Date;
}

export interface Rating {
  source: string;
  value: number;
  votes?: number;
}

export interface CastMember {
  id?: string;
  name: string;
  character?: string;
  order?: number;
  profilePath?: string;
  tmdbPersonId?: number;
}

export interface CrewMember {
  id?: string;
  name: string;
  job: string;
  department: string;
  tmdbPersonId?: number;
}

export interface Artwork {
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

export interface Trailer {
  id: string;
  name: string;
  url: string;
  source: string;
  localPath?: string;
}

export interface Subtitle {
  id: string;
  language: string;
  forced: boolean;
  sdh: boolean;
  filePath?: string;
  source?: string;
  matchScore?: number;
}

export interface MediaInfo {
  videoCodec?: string;
  audioCodec?: string;
  audioChannels?: number;
  hdrFormat?: string;
  resolution?: string;
  width?: number;
  height?: number;
  bitrate?: number;
  container?: string;
  durationSeconds?: number;
  subtitleTracks?: string[];
  rawJson?: unknown;
}

export interface Movie {
  id: string;
  libraryId: string;
  filePath: string;
  title: string;
  originalTitle?: string;
  sortTitle?: string;
  year?: number;
  releaseDate?: string;
  plot?: string;
  runtime?: number;
  certification?: string;
  tmdbId?: number;
  imdbId?: string;
  status: MetadataStatus;
  metadataLocked: boolean;
  genres: string[];
  cast: CastMember[];
  crew: CrewMember[];
  ratings: Rating[];
  studios: string[];
  tags: string[];
  artwork: Artwork[];
  trailers: Trailer[];
  subtitles: Subtitle[];
  mediaInfo?: MediaInfo;
  collectionName?: string;
  tmdbCollectionId?: number;
  collectionPart?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Show {
  id: string;
  libraryId: string;
  folderPath: string;
  title: string;
  originalTitle?: string;
  sortTitle?: string;
  firstAirDate?: string;
  plot?: string;
  status?: string;
  certification?: string;
  tvdbId?: number;
  tmdbId?: number;
  imdbId?: string;
  metadataLocked: boolean;
  genres: string[];
  cast: CastMember[];
  crew: CrewMember[];
  ratings: Rating[];
  networks: string[];
  tags: string[];
  artwork: Artwork[];
  seasons: Season[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Season {
  id: string;
  showId: string;
  seasonNumber: number;
  title?: string;
  plot?: string;
  airDate?: string;
  tvdbId?: number;
  tmdbId?: number;
  artwork: Artwork[];
  episodes: Episode[];
}

export interface Episode {
  id: string;
  seasonId: string;
  showId: string;
  episodeNumber: number;
  title?: string;
  plot?: string;
  airDate?: string;
  filePath?: string;
  runtime?: number;
  tvdbId?: number;
  tmdbId?: number;
  metadataLocked: boolean;
  artwork: Artwork[];
  subtitles: Subtitle[];
  mediaInfo?: MediaInfo;
  createdAt: Date;
  updatedAt: Date;
}
