import { getDb } from "../db/index.js";
import {
  movies, movieGenres, movieCast, movieCrew, movieRatings,
  movieStudios, movieTags,
} from "../db/schema.js";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { tmdbScraper } from "../scrapers/tmdb.js";
import { extractTitle, extractYear } from "../scanner/fileDetector.js";
import path from "path";
import type { JobPayload } from "./queue.js";

export async function scrapMovieHandler(payload: JobPayload["scrape_movie"]): Promise<void> {
  const db = getDb();
  const [movie] = await db.select().from(movies).where(eq(movies.id, payload.movieId));
  if (!movie) throw new Error(`Movie not found: ${payload.movieId}`);

  if (movie.metadataLocked) {
    console.log(`Skipping locked movie: ${movie.title}`);
    return;
  }

  if (!tmdbScraper.isAvailable()) {
    console.warn("TMDB scraper not configured — skipping scrape");
    return;
  }

  // If we have an explicit TMDB ID, use it directly
  let tmdbId = payload.tmdbId ?? movie.tmdbId ?? undefined;
  let scraped: Awaited<ReturnType<typeof tmdbScraper.getMovie>>;

  if (tmdbId) {
    scraped = await tmdbScraper.getMovie(String(tmdbId));
  } else {
    // Search by title extracted from filename
    const title = movie.title || extractTitle(path.basename(movie.filePath));
    const year = movie.year ?? extractYear(path.basename(movie.filePath));
    const results = await tmdbScraper.searchMovies({ title, year });

    if (results.length === 0) {
      console.log(`No TMDB results for: ${title} (${year})`);
      return;
    }

    // Use top result if confidence is reasonable
    const top = results[0]!;
    if (top.confidence < 0.4) {
      console.log(`Low confidence (${top.confidence}) for: ${title}, skipping auto-match`);
      return;
    }

    tmdbId = parseInt(top.id, 10);
    scraped = await tmdbScraper.getMovie(top.id);
  }

  if (!scraped.title) return;

  // Upsert the movie core fields
  await db
    .update(movies)
    .set({
      title: scraped.title ?? movie.title,
      originalTitle: scraped.originalTitle,
      sortTitle: scraped.sortTitle,
      year: scraped.year ?? movie.year,
      releaseDate: scraped.releaseDate,
      plot: scraped.plot,
      runtime: scraped.runtime,
      tmdbId: scraped.tmdbId ?? tmdbId,
      imdbId: scraped.imdbId ?? movie.imdbId,
      certification: scraped.certification,
      collectionName: scraped.collectionName,
      tmdbCollectionId: scraped.tmdbCollectionId,
      status: "matched",
      updatedAt: new Date(),
    })
    .where(eq(movies.id, movie.id));

  // Replace genres
  await db.delete(movieGenres).where(eq(movieGenres.movieId, movie.id));
  if (scraped.genres?.length) {
    await db.insert(movieGenres).values(
      scraped.genres.map((g) => ({ movieId: movie.id, genre: g }))
    );
  }

  // Replace studios
  await db.delete(movieStudios).where(eq(movieStudios.movieId, movie.id));
  if (scraped.studios?.length) {
    await db.insert(movieStudios).values(
      scraped.studios.map((s) => ({ movieId: movie.id, studio: s }))
    );
  }

  // Replace cast
  await db.delete(movieCast).where(eq(movieCast.movieId, movie.id));
  if (scraped.cast?.length) {
    await db.insert(movieCast).values(
      scraped.cast.map((c) => ({
        id: randomUUID(),
        movieId: movie.id,
        name: c.name,
        character: c.character ?? null,
        order: c.order ?? null,
        profilePath: c.profilePath ?? null,
        tmdbPersonId: c.tmdbPersonId ?? null,
      }))
    );
  }

  // Replace crew (directors + key crew only to limit size)
  await db.delete(movieCrew).where(eq(movieCrew.movieId, movie.id));
  const keyCrew = (scraped.crew ?? []).filter((c) =>
    ["Director", "Producer", "Screenplay", "Writer", "Story", "Original Music Composer"].includes(c.job)
  );
  if (keyCrew.length) {
    await db.insert(movieCrew).values(
      keyCrew.map((c) => ({
        id: randomUUID(),
        movieId: movie.id,
        name: c.name,
        job: c.job,
        department: c.department,
        tmdbPersonId: c.tmdbPersonId ?? null,
      }))
    );
  }

  // Upsert ratings
  await db.delete(movieRatings).where(eq(movieRatings.movieId, movie.id));
  if (scraped.ratings?.length) {
    await db.insert(movieRatings).values(
      scraped.ratings.map((r) => ({
        movieId: movie.id,
        source: r.source,
        value: String(r.value),
        votes: r.votes,
      }))
    );
  }

  console.log(`Scraped movie: ${scraped.title} (TMDB ${tmdbId})`);
}
