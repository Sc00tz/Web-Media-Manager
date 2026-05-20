import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getDb } from "../../db/index.js";
import { movieArtwork, showArtwork, seasonArtwork, artworkTypeEnum } from "../../db/schema.js";
import { randomUUID } from "crypto";

type ArtworkTypeValue = typeof artworkTypeEnum.enumValues[number];
import { eq, and } from "drizzle-orm";
import { enqueueTask } from "../../workers/queue.js";
import { fetchMovieArtworkRefs, fetchShowArtworkRefs } from "../../workers/artworkWorker.js";

export async function artworkRoutes(app: FastifyInstance): Promise<void> {
  // Get all artwork for a movie (with filter by type)
  app.get("/movies/:id/artwork", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { type } = req.query as { type?: string };
    const db = getDb();

    const conditions = [eq(movieArtwork.movieId, id)];
    if (type) conditions.push(eq(movieArtwork.type, type as ArtworkTypeValue));

    return db.select().from(movieArtwork).where(and(...conditions)).orderBy(movieArtwork.active);
  });

  // Refresh artwork from all providers
  app.post("/movies/:id/artwork/refresh", async (req, reply) => {
    const { id } = req.params as { id: string };
    await fetchMovieArtworkRefs(id);
    return reply.status(200).send({ message: "Artwork refs refreshed" });
  });

  // Set active artwork (marks one as active, others of same type as inactive)
  app.put("/movies/:id/artwork/:artworkId/activate", async (req, reply) => {
    const { id, artworkId } = req.params as { id: string; artworkId: string };
    const db = getDb();

    const [art] = await db
      .select({ type: movieArtwork.type })
      .from(movieArtwork)
      .where(and(eq(movieArtwork.id, artworkId), eq(movieArtwork.movieId, id)));

    if (!art) return reply.status(404).send({ error: "Artwork not found" });

    // Deactivate all of same type
    await db
      .update(movieArtwork)
      .set({ active: false })
      .where(and(eq(movieArtwork.movieId, id), eq(movieArtwork.type, art.type)));

    // Activate the selected one, and queue download if not cached
    await db.update(movieArtwork).set({ active: true }).where(eq(movieArtwork.id, artworkId));

    await enqueueTask("download_artwork", {
      mediaId: id,
      mediaType: "movie",
      artworkId,
    });

    return { success: true };
  });

  // ── Season artwork ────────────────────────────────────────────────────────

  app.get("/seasons/:id/artwork", async (req) => {
    const { id } = req.params as { id: string };
    const db = getDb();
    return db.select().from(seasonArtwork).where(eq(seasonArtwork.seasonId, id));
  });

  app.post("/seasons/:id/artwork", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { url, type, showId } = req.body as { url?: string; type?: string; showId?: string };
    if (!url || !type || !showId) return reply.status(400).send({ error: "url, type, and showId required" });

    const db = getDb();
    const [inserted] = await db.insert(seasonArtwork).values({
      id: randomUUID(),
      seasonId: id,
      showId,
      type: type as ArtworkTypeValue,
      sourceUrl: url,
      active: false,
      source: "manual",
    }).returning();

    return reply.status(201).send(inserted);
  });

  app.put("/seasons/:id/artwork/:artworkId/activate", async (req, reply) => {
    const { id, artworkId } = req.params as { id: string; artworkId: string };
    const db = getDb();
    const [art] = await db.select({ type: seasonArtwork.type, showId: seasonArtwork.showId })
      .from(seasonArtwork).where(and(eq(seasonArtwork.id, artworkId), eq(seasonArtwork.seasonId, id)));
    if (!art) return reply.status(404).send({ error: "Not found" });

    await db.update(seasonArtwork).set({ active: false })
      .where(and(eq(seasonArtwork.seasonId, id), eq(seasonArtwork.type, art.type)));
    await db.update(seasonArtwork).set({ active: true }).where(eq(seasonArtwork.id, artworkId));
    return { success: true };
  });

  // ── Episode artwork ───────────────────────────────────────────────────────

  app.get("/episodes/:id/artwork", async (req) => {
    const { id } = req.params as { id: string };
    const db = getDb();
    const { episodeArtwork } = await import("../../db/schema.js");
    return db.select().from(episodeArtwork).where(eq(episodeArtwork.episodeId, id));
  });

  app.post("/episodes/:id/artwork", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { url, type } = req.body as { url?: string; type?: string };
    if (!url || !type) return reply.status(400).send({ error: "url and type required" });
    const db = getDb();
    const { episodeArtwork } = await import("../../db/schema.js");
    const [inserted] = await db.insert(episodeArtwork).values({
      id: randomUUID(),
      episodeId: id,
      type: type as ArtworkTypeValue,
      sourceUrl: url,
      active: false,
      source: "manual",
    }).returning();
    return reply.status(201).send(inserted);
  });

  // ── Add artwork by URL (manual entry) ────────────────────────────────────
  app.post("/movies/:id/artwork", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { url, type } = req.body as { url?: string; type?: string };
    if (!url || !type) return reply.status(400).send({ error: "url and type required" });

    const db = getDb();
    const [inserted] = await db.insert(movieArtwork).values({
      id: randomUUID(),
      movieId: id,
      type: type as ArtworkTypeValue,
      sourceUrl: url,
      active: false,
      source: "manual",
    }).returning();

    return reply.status(201).send(inserted);
  });

  // Delete a specific artwork entry
  app.delete("/movies/:id/artwork/:artworkId", async (req, reply) => {
    const { id, artworkId } = req.params as { id: string; artworkId: string };
    const db = getDb();
    await db.delete(movieArtwork).where(and(eq(movieArtwork.id, artworkId), eq(movieArtwork.movieId, id)));
    return reply.status(204).send();
  });

  // ── Show artwork ──────────────────────────────────────────────────────────

  app.get("/shows/:id/artwork", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { type } = req.query as { type?: string };
    const db = getDb();

    const conditions = [eq(showArtwork.showId, id)];
    if (type) conditions.push(eq(showArtwork.type, type as ArtworkTypeValue));

    return db.select().from(showArtwork).where(and(...conditions)).orderBy(showArtwork.active);
  });

  app.post("/shows/:id/artwork/refresh", async (req, reply) => {
    const { id } = req.params as { id: string };
    await fetchShowArtworkRefs(id);
    return reply.status(200).send({ message: "Artwork refs refreshed" });
  });

  // Add show artwork by URL
  app.post("/shows/:id/artwork", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { url, type } = req.body as { url?: string; type?: string };
    if (!url || !type) return reply.status(400).send({ error: "url and type required" });

    const db = getDb();
    const [inserted] = await db.insert(showArtwork).values({
      id: randomUUID(),
      showId: id,
      type: type as ArtworkTypeValue,
      sourceUrl: url,
      active: false,
      source: "manual",
    }).returning();

    return reply.status(201).send(inserted);
  });

  app.put("/shows/:id/artwork/:artworkId/activate", async (req, reply) => {
    const { id, artworkId } = req.params as { id: string; artworkId: string };
    const db = getDb();

    const [art] = await db
      .select({ type: showArtwork.type })
      .from(showArtwork)
      .where(and(eq(showArtwork.id, artworkId), eq(showArtwork.showId, id)));

    if (!art) return reply.status(404).send({ error: "Artwork not found" });

    await db
      .update(showArtwork)
      .set({ active: false })
      .where(and(eq(showArtwork.showId, id), eq(showArtwork.type, art.type)));

    await db.update(showArtwork).set({ active: true }).where(eq(showArtwork.id, artworkId));

    await enqueueTask("download_artwork", {
      mediaId: id,
      mediaType: "show",
      artworkId,
    });

    return { success: true };
  });
}
