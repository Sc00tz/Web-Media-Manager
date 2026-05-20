DO $$ BEGIN
 CREATE TYPE "public"."artwork_type" AS ENUM('poster', 'backdrop', 'logo', 'clearart', 'disc', 'season_poster', 'episode_thumb', 'banner', 'thumb');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."library_type" AS ENUM('movie', 'tv');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."metadata_status" AS ENUM('unmatched', 'matched', 'locked');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."task_status" AS ENUM('pending', 'active', 'completed', 'failed', 'delayed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."task_type" AS ENUM('scan_library', 'scan_path', 'scrape_movie', 'scrape_show', 'scrape_episode', 'download_artwork', 'search_subtitles', 'download_subtitle', 'rename_file', 'generate_nfo', 'extract_mediainfo');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "episode_artwork" (
	"id" text PRIMARY KEY NOT NULL,
	"episode_id" text NOT NULL,
	"type" "artwork_type" NOT NULL,
	"file_path" text,
	"source_url" text,
	"width" integer,
	"height" integer,
	"active" boolean DEFAULT false NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "episode_media_info" (
	"id" serial PRIMARY KEY NOT NULL,
	"episode_id" text NOT NULL,
	"video_codec" text,
	"audio_codec" text,
	"audio_channels" integer,
	"hdr_format" text,
	"resolution" text,
	"width" integer,
	"height" integer,
	"bitrate" integer,
	"container" text,
	"duration_seconds" integer,
	"subtitle_tracks" text[],
	"raw_json" jsonb,
	CONSTRAINT "episode_media_info_episode_id_unique" UNIQUE("episode_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "episode_subtitles" (
	"id" text PRIMARY KEY NOT NULL,
	"episode_id" text NOT NULL,
	"language" text NOT NULL,
	"forced" boolean DEFAULT false NOT NULL,
	"sdh" boolean DEFAULT false NOT NULL,
	"file_path" text,
	"source" text,
	"match_score" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "episodes" (
	"id" text PRIMARY KEY NOT NULL,
	"season_id" text NOT NULL,
	"show_id" text NOT NULL,
	"episode_number" integer NOT NULL,
	"title" text,
	"plot" text,
	"air_date" text,
	"file_path" text,
	"runtime" integer,
	"tvdb_id" integer,
	"tmdb_id" integer,
	"metadata_locked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "libraries" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"path" text NOT NULL,
	"type" "library_type" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "libraries_path_unique" UNIQUE("path")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "movie_artwork" (
	"id" text PRIMARY KEY NOT NULL,
	"movie_id" text NOT NULL,
	"type" "artwork_type" NOT NULL,
	"file_path" text,
	"source_url" text,
	"width" integer,
	"height" integer,
	"language" text,
	"active" boolean DEFAULT false NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "movie_cast" (
	"id" text PRIMARY KEY NOT NULL,
	"movie_id" text NOT NULL,
	"name" text NOT NULL,
	"character" text,
	"order" integer,
	"profile_path" text,
	"tmdb_person_id" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "movie_crew" (
	"id" text PRIMARY KEY NOT NULL,
	"movie_id" text NOT NULL,
	"name" text NOT NULL,
	"job" text NOT NULL,
	"department" text NOT NULL,
	"tmdb_person_id" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "movie_genres" (
	"id" serial PRIMARY KEY NOT NULL,
	"movie_id" text NOT NULL,
	"genre" text NOT NULL,
	CONSTRAINT "movie_genres_movie_id_genre_unique" UNIQUE("movie_id","genre")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "movie_media_info" (
	"id" serial PRIMARY KEY NOT NULL,
	"movie_id" text NOT NULL,
	"video_codec" text,
	"audio_codec" text,
	"audio_channels" integer,
	"hdr_format" text,
	"resolution" text,
	"width" integer,
	"height" integer,
	"bitrate" integer,
	"container" text,
	"duration_seconds" integer,
	"subtitle_tracks" text[],
	"raw_json" jsonb,
	CONSTRAINT "movie_media_info_movie_id_unique" UNIQUE("movie_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "movie_ratings" (
	"id" serial PRIMARY KEY NOT NULL,
	"movie_id" text NOT NULL,
	"source" text NOT NULL,
	"value" text NOT NULL,
	"votes" integer,
	CONSTRAINT "movie_ratings_movie_id_source_unique" UNIQUE("movie_id","source")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "movie_studios" (
	"id" serial PRIMARY KEY NOT NULL,
	"movie_id" text NOT NULL,
	"studio" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "movie_subtitles" (
	"id" text PRIMARY KEY NOT NULL,
	"movie_id" text NOT NULL,
	"language" text NOT NULL,
	"forced" boolean DEFAULT false NOT NULL,
	"sdh" boolean DEFAULT false NOT NULL,
	"file_path" text,
	"source" text,
	"match_score" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "movie_tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"movie_id" text NOT NULL,
	"tag" text NOT NULL,
	CONSTRAINT "movie_tags_movie_id_tag_unique" UNIQUE("movie_id","tag")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "movie_trailers" (
	"id" text PRIMARY KEY NOT NULL,
	"movie_id" text NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"source" text NOT NULL,
	"local_path" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "movies" (
	"id" text PRIMARY KEY NOT NULL,
	"library_id" text NOT NULL,
	"file_path" text NOT NULL,
	"title" text NOT NULL,
	"original_title" text,
	"sort_title" text,
	"year" integer,
	"release_date" text,
	"plot" text,
	"runtime" integer,
	"certification" text,
	"tmdb_id" integer,
	"imdb_id" text,
	"collection_name" text,
	"tmdb_collection_id" integer,
	"collection_part" integer,
	"status" "metadata_status" DEFAULT 'unmatched' NOT NULL,
	"metadata_locked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "movies_file_path_unique" UNIQUE("file_path"),
	CONSTRAINT "movies_tmdb_id_unique" UNIQUE("tmdb_id"),
	CONSTRAINT "movies_imdb_id_unique" UNIQUE("imdb_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scraper_config" (
	"provider" text PRIMARY KEY NOT NULL,
	"api_key" text,
	"enabled" boolean DEFAULT false NOT NULL,
	"priority" integer DEFAULT 10 NOT NULL,
	"options" jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "season_artwork" (
	"id" text PRIMARY KEY NOT NULL,
	"season_id" text NOT NULL,
	"show_id" text NOT NULL,
	"type" "artwork_type" NOT NULL,
	"file_path" text,
	"source_url" text,
	"width" integer,
	"height" integer,
	"language" text,
	"active" boolean DEFAULT false NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "seasons" (
	"id" text PRIMARY KEY NOT NULL,
	"show_id" text NOT NULL,
	"season_number" integer NOT NULL,
	"title" text,
	"plot" text,
	"air_date" text,
	"tvdb_id" integer,
	"tmdb_id" integer,
	CONSTRAINT "seasons_show_id_season_number_unique" UNIQUE("show_id","season_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "show_artwork" (
	"id" text PRIMARY KEY NOT NULL,
	"show_id" text NOT NULL,
	"type" "artwork_type" NOT NULL,
	"file_path" text,
	"source_url" text,
	"width" integer,
	"height" integer,
	"language" text,
	"active" boolean DEFAULT false NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "show_cast" (
	"id" text PRIMARY KEY NOT NULL,
	"show_id" text NOT NULL,
	"name" text NOT NULL,
	"character" text,
	"order" integer,
	"profile_path" text,
	"tmdb_person_id" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "show_crew" (
	"id" text PRIMARY KEY NOT NULL,
	"show_id" text NOT NULL,
	"name" text NOT NULL,
	"job" text NOT NULL,
	"department" text NOT NULL,
	"tmdb_person_id" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "show_genres" (
	"id" serial PRIMARY KEY NOT NULL,
	"show_id" text NOT NULL,
	"genre" text NOT NULL,
	CONSTRAINT "show_genres_show_id_genre_unique" UNIQUE("show_id","genre")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "show_networks" (
	"id" serial PRIMARY KEY NOT NULL,
	"show_id" text NOT NULL,
	"network" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "show_ratings" (
	"id" serial PRIMARY KEY NOT NULL,
	"show_id" text NOT NULL,
	"source" text NOT NULL,
	"value" text NOT NULL,
	"votes" integer,
	CONSTRAINT "show_ratings_show_id_source_unique" UNIQUE("show_id","source")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "show_tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"show_id" text NOT NULL,
	"tag" text NOT NULL,
	CONSTRAINT "show_tags_show_id_tag_unique" UNIQUE("show_id","tag")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shows" (
	"id" text PRIMARY KEY NOT NULL,
	"library_id" text NOT NULL,
	"folder_path" text NOT NULL,
	"title" text NOT NULL,
	"original_title" text,
	"sort_title" text,
	"first_air_date" text,
	"plot" text,
	"status" text,
	"certification" text,
	"tvdb_id" integer,
	"tmdb_id" integer,
	"imdb_id" text,
	"metadata_locked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "shows_folder_path_unique" UNIQUE("folder_path"),
	CONSTRAINT "shows_tvdb_id_unique" UNIQUE("tvdb_id"),
	CONSTRAINT "shows_tmdb_id_unique" UNIQUE("tmdb_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_log" (
	"id" text PRIMARY KEY NOT NULL,
	"type" "task_type" NOT NULL,
	"status" "task_status" DEFAULT 'pending' NOT NULL,
	"payload" jsonb,
	"progress" jsonb,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "episode_artwork" ADD CONSTRAINT "episode_artwork_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "episode_media_info" ADD CONSTRAINT "episode_media_info_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "episode_subtitles" ADD CONSTRAINT "episode_subtitles_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "episodes" ADD CONSTRAINT "episodes_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "episodes" ADD CONSTRAINT "episodes_show_id_shows_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."shows"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "movie_artwork" ADD CONSTRAINT "movie_artwork_movie_id_movies_id_fk" FOREIGN KEY ("movie_id") REFERENCES "public"."movies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "movie_cast" ADD CONSTRAINT "movie_cast_movie_id_movies_id_fk" FOREIGN KEY ("movie_id") REFERENCES "public"."movies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "movie_crew" ADD CONSTRAINT "movie_crew_movie_id_movies_id_fk" FOREIGN KEY ("movie_id") REFERENCES "public"."movies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "movie_genres" ADD CONSTRAINT "movie_genres_movie_id_movies_id_fk" FOREIGN KEY ("movie_id") REFERENCES "public"."movies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "movie_media_info" ADD CONSTRAINT "movie_media_info_movie_id_movies_id_fk" FOREIGN KEY ("movie_id") REFERENCES "public"."movies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "movie_ratings" ADD CONSTRAINT "movie_ratings_movie_id_movies_id_fk" FOREIGN KEY ("movie_id") REFERENCES "public"."movies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "movie_studios" ADD CONSTRAINT "movie_studios_movie_id_movies_id_fk" FOREIGN KEY ("movie_id") REFERENCES "public"."movies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "movie_subtitles" ADD CONSTRAINT "movie_subtitles_movie_id_movies_id_fk" FOREIGN KEY ("movie_id") REFERENCES "public"."movies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "movie_tags" ADD CONSTRAINT "movie_tags_movie_id_movies_id_fk" FOREIGN KEY ("movie_id") REFERENCES "public"."movies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "movie_trailers" ADD CONSTRAINT "movie_trailers_movie_id_movies_id_fk" FOREIGN KEY ("movie_id") REFERENCES "public"."movies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "movies" ADD CONSTRAINT "movies_library_id_libraries_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."libraries"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "season_artwork" ADD CONSTRAINT "season_artwork_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "season_artwork" ADD CONSTRAINT "season_artwork_show_id_shows_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."shows"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "seasons" ADD CONSTRAINT "seasons_show_id_shows_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."shows"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "show_artwork" ADD CONSTRAINT "show_artwork_show_id_shows_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."shows"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "show_cast" ADD CONSTRAINT "show_cast_show_id_shows_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."shows"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "show_crew" ADD CONSTRAINT "show_crew_show_id_shows_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."shows"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "show_genres" ADD CONSTRAINT "show_genres_show_id_shows_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."shows"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "show_networks" ADD CONSTRAINT "show_networks_show_id_shows_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."shows"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "show_ratings" ADD CONSTRAINT "show_ratings_show_id_shows_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."shows"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "show_tags" ADD CONSTRAINT "show_tags_show_id_shows_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."shows"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shows" ADD CONSTRAINT "shows_library_id_libraries_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."libraries"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "episodes_season_id_idx" ON "episodes" ("season_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "episodes_show_id_idx" ON "episodes" ("show_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "episodes_file_path_idx" ON "episodes" ("file_path");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "movie_artwork_movie_id_idx" ON "movie_artwork" ("movie_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "movie_artwork_active_idx" ON "movie_artwork" ("movie_id","active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "movie_artwork_type_idx" ON "movie_artwork" ("type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "movie_genres_genre_idx" ON "movie_genres" ("genre");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "movie_genres_movie_id_idx" ON "movie_genres" ("movie_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "movies_library_id_idx" ON "movies" ("library_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "movies_title_idx" ON "movies" ("title");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "movies_sort_title_idx" ON "movies" ("sort_title");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "movies_year_idx" ON "movies" ("year");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "movies_status_idx" ON "movies" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "movies_updated_at_idx" ON "movies" ("updated_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "movies_tmdb_id_idx" ON "movies" ("tmdb_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "seasons_show_id_idx" ON "seasons" ("show_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shows_library_id_idx" ON "shows" ("library_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shows_title_idx" ON "shows" ("title");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_log_status_idx" ON "task_log" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_log_type_idx" ON "task_log" ("type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_log_created_at_idx" ON "task_log" ("created_at");