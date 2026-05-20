CREATE TABLE IF NOT EXISTS "movie_countries" (
	"id" serial PRIMARY KEY NOT NULL,
	"movie_id" text NOT NULL,
	"country" text NOT NULL,
	CONSTRAINT "movie_countries_movie_id_country_unique" UNIQUE("movie_id","country")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "movie_writers" (
	"id" serial PRIMARY KEY NOT NULL,
	"movie_id" text NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "movies" ADD COLUMN "tagline" text;--> statement-breakpoint
ALTER TABLE "movies" ADD COLUMN "edition" text;--> statement-breakpoint
ALTER TABLE "movies" ADD COLUMN "country" text;--> statement-breakpoint
ALTER TABLE "movies" ADD COLUMN "original_language" text;--> statement-breakpoint
ALTER TABLE "movies" ADD COLUMN "critic_rating" integer;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "movie_countries" ADD CONSTRAINT "movie_countries_movie_id_movies_id_fk" FOREIGN KEY ("movie_id") REFERENCES "public"."movies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "movie_writers" ADD CONSTRAINT "movie_writers_movie_id_movies_id_fk" FOREIGN KEY ("movie_id") REFERENCES "public"."movies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
