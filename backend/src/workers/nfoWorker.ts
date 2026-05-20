import { getDb } from "../db/index.js";
import {
  movies, movieGenres, movieCast, movieCrew, movieRatings, movieStudios, movieTags,
  shows, showGenres, showCast, showNetworks, showRatings,
  episodes, seasons,
} from "../db/schema.js";
import { eq } from "drizzle-orm";
import {
  writeMovieNfo, writeShowNfo, writeEpisodeNfo,
  type MovieNfoData, type ShowNfoData, type EpisodeNfoData,
} from "../nfo/nfoWriter.js";
import type { JobPayload } from "./queue.js";

export async function generateNfoHandler(payload: JobPayload["generate_nfo"]): Promise<void> {
  const db = getDb();

  if (payload.mediaType === "movie") {
    const [movie] = await db.select().from(movies).where(eq(movies.id, payload.mediaId));
    if (!movie) return;

    const [genres, cast, crew, ratings, studios, tags] = await Promise.all([
      db.select().from(movieGenres).where(eq(movieGenres.movieId, movie.id)),
      db.select().from(movieCast).where(eq(movieCast.movieId, movie.id)),
      db.select().from(movieCrew).where(eq(movieCrew.movieId, movie.id)),
      db.select().from(movieRatings).where(eq(movieRatings.movieId, movie.id)),
      db.select().from(movieStudios).where(eq(movieStudios.movieId, movie.id)),
      db.select().from(movieTags).where(eq(movieTags.movieId, movie.id)),
    ]);

    const directors = crew.filter((c) => c.job === "Director").map((c) => c.name);

    const nfoData: MovieNfoData = {
      title: movie.title,
      originalTitle: movie.originalTitle ?? undefined,
      sortTitle: movie.sortTitle ?? undefined,
      year: movie.year ?? undefined,
      releaseDate: movie.releaseDate ?? undefined,
      plot: movie.plot ?? undefined,
      runtime: movie.runtime ?? undefined,
      certification: movie.certification ?? undefined,
      tmdbId: movie.tmdbId ?? undefined,
      imdbId: movie.imdbId ?? undefined,
      collectionName: movie.collectionName ?? undefined,
      genres: genres.map((g) => g.genre),
      studios: studios.map((s) => s.studio),
      tags: tags.map((t) => t.tag),
      ratings: ratings.map((r) => ({
        source: r.source,
        value: parseFloat(r.value),
        votes: r.votes ?? undefined,
      })),
      cast: cast.map((c) => ({
        name: c.name,
        character: c.character ?? undefined,
        order: c.order ?? undefined,
        profilePath: c.profilePath ?? undefined,
      })),
      directors,
    };

    await writeMovieNfo(movie.filePath, nfoData);
    console.log(`NFO written for movie: ${movie.title}`);
  } else if (payload.mediaType === "show") {
    const [show] = await db.select().from(shows).where(eq(shows.id, payload.mediaId));
    if (!show) return;

    const [genres, cast, networks, ratings] = await Promise.all([
      db.select().from(showGenres).where(eq(showGenres.showId, show.id)),
      db.select().from(showCast).where(eq(showCast.showId, show.id)),
      db.select().from(showNetworks).where(eq(showNetworks.showId, show.id)),
      db.select().from(showRatings).where(eq(showRatings.showId, show.id)),
    ]);

    const nfoData: ShowNfoData = {
      title: show.title,
      originalTitle: show.originalTitle ?? undefined,
      sortTitle: show.sortTitle ?? undefined,
      firstAirDate: show.firstAirDate ?? undefined,
      plot: show.plot ?? undefined,
      status: show.status ?? undefined,
      certification: show.certification ?? undefined,
      tvdbId: show.tvdbId ?? undefined,
      tmdbId: show.tmdbId ?? undefined,
      imdbId: show.imdbId ?? undefined,
      genres: genres.map((g) => g.genre),
      networks: networks.map((n) => n.network),
      ratings: ratings.map((r) => ({
        source: r.source,
        value: parseFloat(r.value),
        votes: r.votes ?? undefined,
      })),
      cast: cast.map((c) => ({
        name: c.name,
        character: c.character ?? undefined,
        order: c.order ?? undefined,
      })),
    };

    await writeShowNfo(show.folderPath, nfoData);
    console.log(`NFO written for show: ${show.title}`);
  } else if (payload.mediaType === "episode") {
    const [episode] = await db.select().from(episodes).where(eq(episodes.id, payload.mediaId));
    if (!episode?.filePath) return;

    const [season] = await db.select().from(seasons).where(eq(seasons.id, episode.seasonId));
    const [show] = await db.select({ title: shows.title }).from(shows).where(eq(shows.id, episode.showId));

    const nfoData: EpisodeNfoData = {
      title: episode.title ?? undefined,
      plot: episode.plot ?? undefined,
      season: season?.seasonNumber ?? 1,
      episode: episode.episodeNumber,
      airDate: episode.airDate ?? undefined,
      runtime: episode.runtime ?? undefined,
      tvdbId: episode.tvdbId ?? undefined,
      tmdbId: episode.tmdbId ?? undefined,
      showTitle: show?.title,
      ratings: [],
    };

    await writeEpisodeNfo(episode.filePath, nfoData);
    console.log(`NFO written for episode: S${String(season?.seasonNumber).padStart(2, "0")}E${String(episode.episodeNumber).padStart(2, "0")}`);
  }
}
