import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  serial,
  unique,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ─── Enums ───────────────────────────────────────────────────────────────────

export const libraryTypeEnum = pgEnum("library_type", ["movie", "tv"]);
export const metadataStatusEnum = pgEnum("metadata_status", ["unmatched", "matched", "locked"]);
export const artworkTypeEnum = pgEnum("artwork_type", [
  "poster", "backdrop", "logo", "clearart", "disc",
  "season_poster", "episode_thumb", "banner", "thumb",
]);
export const taskTypeEnum = pgEnum("task_type", [
  "scan_library", "scan_path", "scrape_movie", "scrape_show", "scrape_episode",
  "download_artwork", "search_subtitles", "download_subtitle",
  "rename_file", "generate_nfo", "extract_mediainfo",
]);
export const taskStatusEnum = pgEnum("task_status", [
  "pending", "active", "completed", "failed", "delayed",
]);

// ─── Libraries ───────────────────────────────────────────────────────────────

export const libraries = pgTable("libraries", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  path: text("path").notNull().unique(),
  type: libraryTypeEnum("type").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Movies ───────────────────────────────────────────────────────────────────

export const movies = pgTable("movies", {
  id: text("id").primaryKey(),
  libraryId: text("library_id").notNull().references(() => libraries.id, { onDelete: "cascade" }),
  filePath: text("file_path").notNull().unique(),
  title: text("title").notNull(),
  originalTitle: text("original_title"),
  sortTitle: text("sort_title"),
  year: integer("year"),
  releaseDate: text("release_date"),
  plot: text("plot"),
  runtime: integer("runtime"),
  certification: text("certification"),
  tmdbId: integer("tmdb_id").unique(),
  imdbId: text("imdb_id").unique(),
  collectionName: text("collection_name"),
  tmdbCollectionId: integer("tmdb_collection_id"),
  collectionPart: integer("collection_part"),
  tagline: text("tagline"),
  edition: text("edition"),
  country: text("country"),
  originalLanguage: text("original_language"),
  criticRating: integer("critic_rating"),
  status: metadataStatusEnum("status").notNull().default("unmatched"),
  metadataLocked: boolean("metadata_locked").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  libraryIdx: index("movies_library_id_idx").on(t.libraryId),
  titleIdx: index("movies_title_idx").on(t.title),
  sortTitleIdx: index("movies_sort_title_idx").on(t.sortTitle),
  yearIdx: index("movies_year_idx").on(t.year),
  statusIdx: index("movies_status_idx").on(t.status),
  updatedAtIdx: index("movies_updated_at_idx").on(t.updatedAt),
  tmdbIdIdx: index("movies_tmdb_id_idx").on(t.tmdbId),
}));

export const movieGenres = pgTable("movie_genres", {
  id: serial("id").primaryKey(),
  movieId: text("movie_id").notNull().references(() => movies.id, { onDelete: "cascade" }),
  genre: text("genre").notNull(),
}, (t) => ({
  uniq: unique().on(t.movieId, t.genre),
  genreIdx: index("movie_genres_genre_idx").on(t.genre),
  movieIdIdx: index("movie_genres_movie_id_idx").on(t.movieId),
}));

export const movieCast = pgTable("movie_cast", {
  id: text("id").primaryKey(),
  movieId: text("movie_id").notNull().references(() => movies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  character: text("character"),
  order: integer("order"),
  profilePath: text("profile_path"),
  tmdbPersonId: integer("tmdb_person_id"),
});

export const movieCrew = pgTable("movie_crew", {
  id: text("id").primaryKey(),
  movieId: text("movie_id").notNull().references(() => movies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  job: text("job").notNull(),
  department: text("department").notNull(),
  tmdbPersonId: integer("tmdb_person_id"),
});

export const movieRatings = pgTable("movie_ratings", {
  id: serial("id").primaryKey(),
  movieId: text("movie_id").notNull().references(() => movies.id, { onDelete: "cascade" }),
  source: text("source").notNull(),
  value: text("value").notNull(),
  votes: integer("votes"),
}, (t) => ({
  uniq: unique().on(t.movieId, t.source),
}));

export const movieStudios = pgTable("movie_studios", {
  id: serial("id").primaryKey(),
  movieId: text("movie_id").notNull().references(() => movies.id, { onDelete: "cascade" }),
  studio: text("studio").notNull(),
});

export const movieWriters = pgTable("movie_writers", {
  id: serial("id").primaryKey(),
  movieId: text("movie_id").notNull().references(() => movies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
});

export const movieCountries = pgTable("movie_countries", {
  id: serial("id").primaryKey(),
  movieId: text("movie_id").notNull().references(() => movies.id, { onDelete: "cascade" }),
  country: text("country").notNull(),
}, (t) => ({
  uniq: unique().on(t.movieId, t.country),
}));

export const movieTags = pgTable("movie_tags", {
  id: serial("id").primaryKey(),
  movieId: text("movie_id").notNull().references(() => movies.id, { onDelete: "cascade" }),
  tag: text("tag").notNull(),
}, (t) => ({
  uniq: unique().on(t.movieId, t.tag),
}));

export const movieArtwork = pgTable("movie_artwork", {
  id: text("id").primaryKey(),
  movieId: text("movie_id").notNull().references(() => movies.id, { onDelete: "cascade" }),
  type: artworkTypeEnum("type").notNull(),
  filePath: text("file_path"),
  sourceUrl: text("source_url"),
  width: integer("width"),
  height: integer("height"),
  language: text("language"),
  active: boolean("active").notNull().default(false),
  source: text("source").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  movieIdIdx: index("movie_artwork_movie_id_idx").on(t.movieId),
  activeIdx: index("movie_artwork_active_idx").on(t.movieId, t.active),
  typeIdx: index("movie_artwork_type_idx").on(t.type),
}));

export const movieTrailers = pgTable("movie_trailers", {
  id: text("id").primaryKey(),
  movieId: text("movie_id").notNull().references(() => movies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  url: text("url").notNull(),
  source: text("source").notNull(),
  localPath: text("local_path"),
});

export const movieSubtitles = pgTable("movie_subtitles", {
  id: text("id").primaryKey(),
  movieId: text("movie_id").notNull().references(() => movies.id, { onDelete: "cascade" }),
  language: text("language").notNull(),
  forced: boolean("forced").notNull().default(false),
  sdh: boolean("sdh").notNull().default(false),
  filePath: text("file_path"),
  source: text("source"),
  matchScore: integer("match_score"),
}, (t) => ({
  movieIdIdx: index("movie_subtitles_movie_id_idx").on(t.movieId),
  sourceIdx: index("movie_subtitles_source_idx").on(t.source),
}));

export const movieMediaInfo = pgTable("movie_media_info", {
  id: serial("id").primaryKey(),
  movieId: text("movie_id").notNull().references(() => movies.id, { onDelete: "cascade" }).unique(),
  videoCodec: text("video_codec"),
  audioCodec: text("audio_codec"),
  audioChannels: integer("audio_channels"),
  hdrFormat: text("hdr_format"),
  resolution: text("resolution"),
  width: integer("width"),
  height: integer("height"),
  bitrate: integer("bitrate"),
  container: text("container"),
  durationSeconds: integer("duration_seconds"),
  subtitleTracks: text("subtitle_tracks").array(),
  streamsJson: jsonb("streams_json"),  // full per-stream detail
  rawJson: jsonb("raw_json"),
});

// ─── TV Shows ─────────────────────────────────────────────────────────────────

export const shows = pgTable("shows", {
  id: text("id").primaryKey(),
  libraryId: text("library_id").notNull().references(() => libraries.id, { onDelete: "cascade" }),
  folderPath: text("folder_path").notNull().unique(),
  title: text("title").notNull(),
  originalTitle: text("original_title"),
  sortTitle: text("sort_title"),
  firstAirDate: text("first_air_date"),
  plot: text("plot"),
  status: text("status"),
  certification: text("certification"),
  tvdbId: integer("tvdb_id").unique(),
  tmdbId: integer("tmdb_id").unique(),
  imdbId: text("imdb_id"),
  metadataLocked: boolean("metadata_locked").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  libraryIdx: index("shows_library_id_idx").on(t.libraryId),
  titleIdx: index("shows_title_idx").on(t.title),
}));

export const showGenres = pgTable("show_genres", {
  id: serial("id").primaryKey(),
  showId: text("show_id").notNull().references(() => shows.id, { onDelete: "cascade" }),
  genre: text("genre").notNull(),
}, (t) => ({
  uniq: unique().on(t.showId, t.genre),
}));

export const showCast = pgTable("show_cast", {
  id: text("id").primaryKey(),
  showId: text("show_id").notNull().references(() => shows.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  character: text("character"),
  order: integer("order"),
  profilePath: text("profile_path"),
  tmdbPersonId: integer("tmdb_person_id"),
});

export const showCrew = pgTable("show_crew", {
  id: text("id").primaryKey(),
  showId: text("show_id").notNull().references(() => shows.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  job: text("job").notNull(),
  department: text("department").notNull(),
  tmdbPersonId: integer("tmdb_person_id"),
});

export const showRatings = pgTable("show_ratings", {
  id: serial("id").primaryKey(),
  showId: text("show_id").notNull().references(() => shows.id, { onDelete: "cascade" }),
  source: text("source").notNull(),
  value: text("value").notNull(),
  votes: integer("votes"),
}, (t) => ({
  uniq: unique().on(t.showId, t.source),
}));

export const showNetworks = pgTable("show_networks", {
  id: serial("id").primaryKey(),
  showId: text("show_id").notNull().references(() => shows.id, { onDelete: "cascade" }),
  network: text("network").notNull(),
});

export const showTags = pgTable("show_tags", {
  id: serial("id").primaryKey(),
  showId: text("show_id").notNull().references(() => shows.id, { onDelete: "cascade" }),
  tag: text("tag").notNull(),
}, (t) => ({
  uniq: unique().on(t.showId, t.tag),
}));

export const showArtwork = pgTable("show_artwork", {
  id: text("id").primaryKey(),
  showId: text("show_id").notNull().references(() => shows.id, { onDelete: "cascade" }),
  type: artworkTypeEnum("type").notNull(),
  filePath: text("file_path"),
  sourceUrl: text("source_url"),
  width: integer("width"),
  height: integer("height"),
  language: text("language"),
  active: boolean("active").notNull().default(false),
  source: text("source").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Seasons ─────────────────────────────────────────────────────────────────

export const seasons = pgTable("seasons", {
  id: text("id").primaryKey(),
  showId: text("show_id").notNull().references(() => shows.id, { onDelete: "cascade" }),
  seasonNumber: integer("season_number").notNull(),
  title: text("title"),
  plot: text("plot"),
  airDate: text("air_date"),
  tvdbId: integer("tvdb_id"),
  tmdbId: integer("tmdb_id"),
}, (t) => ({
  showSeasonUniq: unique().on(t.showId, t.seasonNumber),
  showIdx: index("seasons_show_id_idx").on(t.showId),
}));

export const seasonArtwork = pgTable("season_artwork", {
  id: text("id").primaryKey(),
  seasonId: text("season_id").notNull().references(() => seasons.id, { onDelete: "cascade" }),
  showId: text("show_id").notNull().references(() => shows.id, { onDelete: "cascade" }),
  type: artworkTypeEnum("type").notNull(),
  filePath: text("file_path"),
  sourceUrl: text("source_url"),
  width: integer("width"),
  height: integer("height"),
  language: text("language"),
  active: boolean("active").notNull().default(false),
  source: text("source").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Episodes ─────────────────────────────────────────────────────────────────

export const episodes = pgTable("episodes", {
  id: text("id").primaryKey(),
  seasonId: text("season_id").notNull().references(() => seasons.id, { onDelete: "cascade" }),
  showId: text("show_id").notNull().references(() => shows.id, { onDelete: "cascade" }),
  episodeNumber: integer("episode_number").notNull(),
  title: text("title"),
  plot: text("plot"),
  airDate: text("air_date"),
  filePath: text("file_path"),
  runtime: integer("runtime"),
  tvdbId: integer("tvdb_id"),
  tmdbId: integer("tmdb_id"),
  metadataLocked: boolean("metadata_locked").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  seasonIdx: index("episodes_season_id_idx").on(t.seasonId),
  showIdx: index("episodes_show_id_idx").on(t.showId),
  filePathIdx: index("episodes_file_path_idx").on(t.filePath),
}));

export const episodeArtwork = pgTable("episode_artwork", {
  id: text("id").primaryKey(),
  episodeId: text("episode_id").notNull().references(() => episodes.id, { onDelete: "cascade" }),
  type: artworkTypeEnum("type").notNull(),
  filePath: text("file_path"),
  sourceUrl: text("source_url"),
  width: integer("width"),
  height: integer("height"),
  active: boolean("active").notNull().default(false),
  source: text("source").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const episodeSubtitles = pgTable("episode_subtitles", {
  id: text("id").primaryKey(),
  episodeId: text("episode_id").notNull().references(() => episodes.id, { onDelete: "cascade" }),
  language: text("language").notNull(),
  forced: boolean("forced").notNull().default(false),
  sdh: boolean("sdh").notNull().default(false),
  filePath: text("file_path"),
  source: text("source"),
  matchScore: integer("match_score"),
}, (t) => ({
  episodeIdIdx: index("episode_subtitles_episode_id_idx").on(t.episodeId),
  sourceIdx: index("episode_subtitles_source_idx").on(t.source),
}));

export const episodeMediaInfo = pgTable("episode_media_info", {
  id: serial("id").primaryKey(),
  episodeId: text("episode_id").notNull().references(() => episodes.id, { onDelete: "cascade" }).unique(),
  videoCodec: text("video_codec"),
  audioCodec: text("audio_codec"),
  audioChannels: integer("audio_channels"),
  hdrFormat: text("hdr_format"),
  resolution: text("resolution"),
  width: integer("width"),
  height: integer("height"),
  bitrate: integer("bitrate"),
  container: text("container"),
  durationSeconds: integer("duration_seconds"),
  subtitleTracks: text("subtitle_tracks").array(),
  streamsJson: jsonb("streams_json"),
  rawJson: jsonb("raw_json"),
});

// ─── Settings & Config ────────────────────────────────────────────────────────

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const scraperConfig = pgTable("scraper_config", {
  provider: text("provider").primaryKey(),
  apiKey: text("api_key"),
  enabled: boolean("enabled").notNull().default(false),
  priority: integer("priority").notNull().default(10),
  options: jsonb("options"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Task Log ─────────────────────────────────────────────────────────────────

export const taskLog = pgTable("task_log", {
  id: text("id").primaryKey(),
  type: taskTypeEnum("type").notNull(),
  status: taskStatusEnum("status").notNull().default("pending"),
  payload: jsonb("payload"),
  progress: jsonb("progress"),
  error: text("error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
}, (t) => ({
  statusIdx: index("task_log_status_idx").on(t.status),
  typeIdx: index("task_log_type_idx").on(t.type),
  createdAtIdx: index("task_log_created_at_idx").on(t.createdAt),
}));

// ─── Relations ────────────────────────────────────────────────────────────────

export const librariesRelations = relations(libraries, ({ many }) => ({
  movies: many(movies),
  shows: many(shows),
}));

export const moviesRelations = relations(movies, ({ one, many }) => ({
  library: one(libraries, { fields: [movies.libraryId], references: [libraries.id] }),
  genres: many(movieGenres),
  cast: many(movieCast),
  crew: many(movieCrew),
  ratings: many(movieRatings),
  studios: many(movieStudios),
  writers: many(movieWriters),
  countries: many(movieCountries),
  tags: many(movieTags),
  artwork: many(movieArtwork),
  trailers: many(movieTrailers),
  subtitles: many(movieSubtitles),
  mediaInfo: one(movieMediaInfo),
}));

export const showsRelations = relations(shows, ({ one, many }) => ({
  library: one(libraries, { fields: [shows.libraryId], references: [libraries.id] }),
  genres: many(showGenres),
  cast: many(showCast),
  crew: many(showCrew),
  ratings: many(showRatings),
  networks: many(showNetworks),
  tags: many(showTags),
  artwork: many(showArtwork),
  seasons: many(seasons),
}));

export const seasonsRelations = relations(seasons, ({ one, many }) => ({
  show: one(shows, { fields: [seasons.showId], references: [shows.id] }),
  artwork: many(seasonArtwork),
  episodes: many(episodes),
}));

export const episodesRelations = relations(episodes, ({ one, many }) => ({
  season: one(seasons, { fields: [episodes.seasonId], references: [seasons.id] }),
  show: one(shows, { fields: [episodes.showId], references: [shows.id] }),
  artwork: many(episodeArtwork),
  subtitles: many(episodeSubtitles),
  mediaInfo: one(episodeMediaInfo),
}));
