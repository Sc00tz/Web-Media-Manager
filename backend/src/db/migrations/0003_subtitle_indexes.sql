CREATE INDEX IF NOT EXISTS "movie_subtitles_movie_id_idx" ON "movie_subtitles" ("movie_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "movie_subtitles_source_idx" ON "movie_subtitles" ("source");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "episode_subtitles_episode_id_idx" ON "episode_subtitles" ("episode_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "episode_subtitles_source_idx" ON "episode_subtitles" ("source");
