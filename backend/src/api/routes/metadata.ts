import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getDb } from "../../db/index.js";
import {
  movies, shows, episodes,
  movieGenres, movieCast, movieCrew, movieRatings, movieStudios, movieTags,
  movieWriters, movieCountries,
  showGenres, showCast, showNetworks, showTags, showRatings,
} from "../../db/schema.js";
import { eq, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import { enqueueTask } from "../../workers/queue.js";

const safeInt = z.number().int().finite().safe().optional().nullable();

const editMovieSchema = z.object({
  title: z.string().optional(),
  originalTitle: z.string().optional(),
  sortTitle: z.string().optional(),
  year: safeInt,
  releaseDate: z.string().optional(),
  plot: z.string().optional(),
  tagline: z.string().optional(),
  runtime: safeInt,
  certification: z.string().optional(),
  edition: z.string().optional(),
  country: z.string().optional(),
  originalLanguage: z.string().optional(),
  criticRating: safeInt,
  tmdbId: safeInt,
  imdbId: z.string().optional(),
  collectionName: z.string().optional(),
  metadataLocked: z.boolean().optional(),
  genres: z.array(z.string()).optional(),
  studios: z.array(z.string()).optional(),
  writers: z.array(z.string()).optional(),
  countries: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
});

const editShowSchema = z.object({
  title: z.string().optional(),
  originalTitle: z.string().optional(),
  sortTitle: z.string().optional(),
  firstAirDate: z.string().optional(),
  plot: z.string().optional(),
  status: z.string().optional(),
  certification: z.string().optional(),
  tvdbId: z.number().int().optional(),
  tmdbId: z.number().int().optional(),
  imdbId: z.string().optional(),
  metadataLocked: z.boolean().optional(),
  genres: z.array(z.string()).optional(),
  networks: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
});

const editEpisodeSchema = z.object({
  title: z.string().optional(),
  plot: z.string().optional(),
  airDate: z.string().optional(),
  runtime: z.number().int().optional(),
  metadataLocked: z.boolean().optional(),
});

const bulkMovieSchema = z.object({
  ids: z.array(z.string()),
  patch: z.object({
    metadataLocked: z.boolean().optional(),
    genres: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
  }),
});

export async function metadataRoutes(app: FastifyInstance): Promise<void> {
  // ── Movie metadata ────────────────────────────────────────────────────────

  app.patch("/movies/:id/metadata", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = editMovieSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.message });

    const db = getDb();
    const patch = body.data;

    const coreUpdate: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.title !== undefined) coreUpdate["title"] = patch.title;
    if (patch.originalTitle !== undefined) coreUpdate["originalTitle"] = patch.originalTitle ?? null;
    if (patch.sortTitle !== undefined) coreUpdate["sortTitle"] = patch.sortTitle ?? null;
    if (patch.year !== undefined) coreUpdate["year"] = patch.year ?? null;
    if (patch.releaseDate !== undefined) coreUpdate["releaseDate"] = patch.releaseDate ?? null;
    if (patch.plot !== undefined) coreUpdate["plot"] = patch.plot ?? null;
    if (patch.runtime !== undefined) coreUpdate["runtime"] = patch.runtime ?? null;
    if (patch.certification !== undefined) coreUpdate["certification"] = patch.certification ?? null;
    if (patch.tmdbId !== undefined) coreUpdate["tmdbId"] = patch.tmdbId ?? null;
    if (patch.imdbId !== undefined) coreUpdate["imdbId"] = patch.imdbId ?? null;
    if (patch.collectionName !== undefined) coreUpdate["collectionName"] = patch.collectionName ?? null;
    if (patch.tagline !== undefined) coreUpdate["tagline"] = patch.tagline ?? null;
    if (patch.edition !== undefined) coreUpdate["edition"] = patch.edition ?? null;
    if (patch.country !== undefined) coreUpdate["country"] = patch.country ?? null;
    if (patch.originalLanguage !== undefined) coreUpdate["originalLanguage"] = patch.originalLanguage ?? null;
    if (patch.criticRating !== undefined) coreUpdate["criticRating"] = patch.criticRating ?? null;
    if (patch.metadataLocked !== undefined) coreUpdate["metadataLocked"] = patch.metadataLocked;

    if (Object.keys(coreUpdate).length > 1) {
      await db.update(movies).set(coreUpdate).where(eq(movies.id, id));
    }

    if (patch.genres !== undefined) {
      await db.delete(movieGenres).where(eq(movieGenres.movieId, id));
      if (patch.genres.length) {
        await db.insert(movieGenres).values(patch.genres.map((g) => ({ movieId: id, genre: g })));
      }
    }

    if (patch.studios !== undefined) {
      await db.delete(movieStudios).where(eq(movieStudios.movieId, id));
      if (patch.studios.length) {
        await db.insert(movieStudios).values(patch.studios.map((s) => ({ movieId: id, studio: s })));
      }
    }

    if (patch.writers !== undefined) {
      await db.delete(movieWriters).where(eq(movieWriters.movieId, id));
      if (patch.writers.length) {
        await db.insert(movieWriters).values(patch.writers.map((w) => ({ movieId: id, name: w })));
      }
    }

    if (patch.countries !== undefined) {
      await db.delete(movieCountries).where(eq(movieCountries.movieId, id));
      if (patch.countries.length) {
        await db.insert(movieCountries).values(patch.countries.map((c) => ({ movieId: id, country: c })));
      }
    }

    if (patch.tags !== undefined) {
      await db.delete(movieTags).where(eq(movieTags.movieId, id));
      if (patch.tags.length) {
        await db.insert(movieTags).values(patch.tags.map((t) => ({ movieId: id, tag: t })));
      }
    }

    await enqueueTask("generate_nfo", { mediaId: id, mediaType: "movie" });

    return { success: true };
  });

  // Bulk movie edit
  app.patch("/movies/bulk", async (req, reply) => {
    const body = bulkMovieSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.message });

    const { ids, patch } = body.data;
    const db = getDb();

    if (patch.metadataLocked !== undefined) {
      await db.update(movies).set({ metadataLocked: patch.metadataLocked, updatedAt: new Date() })
        .where(inArray(movies.id, ids));
    }

    if (patch.tags !== undefined) {
      await db.delete(movieTags).where(inArray(movieTags.movieId, ids));
      if (patch.tags.length) {
        await db.insert(movieTags).values(
          ids.flatMap((id) => patch.tags!.map((t) => ({ movieId: id, tag: t })))
        );
      }
    }

    return { success: true, updated: ids.length };
  });

  // ── Show metadata ─────────────────────────────────────────────────────────

  app.patch("/shows/:id/metadata", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = editShowSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.message });

    const db = getDb();
    const patch = body.data;

    const coreUpdate: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.title !== undefined) coreUpdate["title"] = patch.title;
    if (patch.originalTitle !== undefined) coreUpdate["originalTitle"] = patch.originalTitle ?? null;
    if (patch.sortTitle !== undefined) coreUpdate["sortTitle"] = patch.sortTitle ?? null;
    if (patch.firstAirDate !== undefined) coreUpdate["firstAirDate"] = patch.firstAirDate ?? null;
    if (patch.plot !== undefined) coreUpdate["plot"] = patch.plot ?? null;
    if (patch.status !== undefined) coreUpdate["status"] = patch.status ?? null;
    if (patch.certification !== undefined) coreUpdate["certification"] = patch.certification ?? null;
    if (patch.tvdbId !== undefined) coreUpdate["tvdbId"] = patch.tvdbId ?? null;
    if (patch.tmdbId !== undefined) coreUpdate["tmdbId"] = patch.tmdbId ?? null;
    if (patch.imdbId !== undefined) coreUpdate["imdbId"] = patch.imdbId ?? null;
    if (patch.metadataLocked !== undefined) coreUpdate["metadataLocked"] = patch.metadataLocked;

    if (Object.keys(coreUpdate).length > 1) {
      await db.update(shows).set(coreUpdate).where(eq(shows.id, id));
    }

    if (patch.genres !== undefined) {
      await db.delete(showGenres).where(eq(showGenres.showId, id));
      if (patch.genres.length) {
        await db.insert(showGenres).values(patch.genres.map((g) => ({ showId: id, genre: g })));
      }
    }

    if (patch.networks !== undefined) {
      await db.delete(showNetworks).where(eq(showNetworks.showId, id));
      if (patch.networks.length) {
        await db.insert(showNetworks).values(patch.networks.map((n) => ({ showId: id, network: n })));
      }
    }

    if (patch.tags !== undefined) {
      await db.delete(showTags).where(eq(showTags.showId, id));
      if (patch.tags.length) {
        await db.insert(showTags).values(patch.tags.map((t) => ({ showId: id, tag: t })));
      }
    }

    await enqueueTask("generate_nfo", { mediaId: id, mediaType: "show" });
    return { success: true };
  });

  // ── Episode metadata ──────────────────────────────────────────────────────

  app.patch("/episodes/:id/metadata", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = editEpisodeSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.message });

    const db = getDb();
    const patch = body.data;
    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.title !== undefined) update["title"] = patch.title ?? null;
    if (patch.plot !== undefined) update["plot"] = patch.plot ?? null;
    if (patch.airDate !== undefined) update["airDate"] = patch.airDate ?? null;
    if (patch.runtime !== undefined) update["runtime"] = patch.runtime ?? null;
    if (patch.metadataLocked !== undefined) update["metadataLocked"] = patch.metadataLocked;

    await db.update(episodes).set(update).where(eq(episodes.id, id));
    await enqueueTask("generate_nfo", { mediaId: id, mediaType: "episode" });
    return { success: true };
  });
}
