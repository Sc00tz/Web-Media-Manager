import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getDb } from "../../db/index.js";
import { movies, shows, seasons, episodes, movieSubtitles, episodeSubtitles } from "../../db/schema.js";
import { eq, and } from "drizzle-orm";
import { enqueueTask } from "../../workers/queue.js";
import { openSubtitlesScraper } from "../../scrapers/opensubtitles.js";
import { subDlScraper } from "../../scrapers/subdl.js";
import type { ISubtitleScraper } from "@mediamanager/types";
import { randomUUID } from "crypto";

// Pick the best available subtitle scraper — SubDL first (30/day free), then OpenSubtitles (5/day free)
function getBestSubtitleScraper(): ISubtitleScraper | null {
  if (subDlScraper.isAvailable()) return subDlScraper;
  if (openSubtitlesScraper.isAvailable()) return openSubtitlesScraper;
  return null;
}

function noScraperError() {
  return "No subtitle provider configured. Add a SubDL or OpenSubtitles API key in Settings → Scrapers.";
}

const searchSchema = z.object({
  language: z.string().default("en"),
});

export async function subtitleRoutes(app: FastifyInstance): Promise<void> {
  // ── Movie subtitles ───────────────────────────────────────────────────────

  app.get("/movies/:id/subtitles", async (req) => {
    const { id } = req.params as { id: string };
    const db = getDb();
    return db.select().from(movieSubtitles).where(eq(movieSubtitles.movieId, id))
      .orderBy(movieSubtitles.language, movieSubtitles.matchScore);
  });

  // Synchronous search — runs inline, returns results immediately
  app.post("/movies/:id/subtitles/search", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = searchSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.message });

    const scraper = getBestSubtitleScraper();
    if (!scraper) {
      return reply.status(422).send({ error: noScraperError() });
    }

    const db = getDb();
    const [movie] = await db
      .select({ title: movies.title, year: movies.year, imdbId: movies.imdbId })
      .from(movies).where(eq(movies.id, id));
    if (!movie) return reply.status(404).send({ error: "Movie not found" });

    let results;
    try {
      results = await scraper.searchSubtitles({
        title: movie.title,
        year: movie.year ?? undefined,
        imdbId: movie.imdbId ?? undefined,
        language: body.data.language,
      });
    } catch (err) {
      return reply.status(502).send({ error: `Search failed: ${String(err)}` });
    }

    // Clear old non-downloaded results for this language, replace with fresh
    const existing = await db.select({ id: movieSubtitles.id, filePath: movieSubtitles.filePath })
      .from(movieSubtitles)
      .where(and(eq(movieSubtitles.movieId, id), eq(movieSubtitles.language, body.data.language)));

    for (const s of existing.filter((s) => !s.filePath)) {
      await db.delete(movieSubtitles).where(eq(movieSubtitles.id, s.id));
    }

    let inserted = 0;
    for (const r of results.slice(0, 10)) {
      const score = typeof r.matchScore === "number" && isFinite(r.matchScore)
        ? Math.round(r.matchScore) : null;
      // "provider:id|filename" — filename suffix lets the UI show a human-readable release name
      const source = r.filename
        ? `${scraper.provider}:${r.id}|${r.filename}`
        : `${scraper.provider}:${r.id}`;
      await db.insert(movieSubtitles).values({
        id: randomUUID(),
        movieId: id,
        language: r.language,
        forced: r.forced,
        sdh: r.sdh,
        filePath: null,
        source,
        matchScore: score,
      });
      inserted++;
    }

    return { found: results.length, inserted };
  });

  app.post("/movies/:id/subtitles/:subtitleId/download", async (req, reply) => {
    const { id, subtitleId } = req.params as { id: string; subtitleId: string };
    const db = getDb();
    const [sub] = await db
      .select({ source: movieSubtitles.source, language: movieSubtitles.language })
      .from(movieSubtitles)
      .where(and(eq(movieSubtitles.id, subtitleId), eq(movieSubtitles.movieId, id)));

    if (!sub) return reply.status(404).send({ error: "Subtitle not found" });

    // source may be "provider:id|release_name" — pass the full string; worker strips |release_name
    await enqueueTask("download_subtitle", {
      mediaId: id,
      mediaType: "movie",
      subtitleResultId: sub.source ?? subtitleId,
      language: sub.language,
    });

    return reply.status(202).send({ message: "Download queued" });
  });

  app.delete("/movies/:id/subtitles/:subtitleId", async (req, reply) => {
    const { id, subtitleId } = req.params as { id: string; subtitleId: string };
    const db = getDb();
    await db.delete(movieSubtitles).where(
      and(eq(movieSubtitles.id, subtitleId), eq(movieSubtitles.movieId, id))
    );
    return reply.status(204).send();
  });

  // ── Episode subtitles ─────────────────────────────────────────────────────

  app.get("/episodes/:id/subtitles", async (req) => {
    const { id } = req.params as { id: string };
    const db = getDb();
    return db.select().from(episodeSubtitles).where(eq(episodeSubtitles.episodeId, id))
      .orderBy(episodeSubtitles.language);
  });

  app.post("/episodes/:id/subtitles/search", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = searchSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.message });

    const scraper = getBestSubtitleScraper();
    if (!scraper) {
      return reply.status(422).send({ error: noScraperError() });
    }

    const db = getDb();
    const [episode] = await db.select().from(episodes).where(eq(episodes.id, id));
    if (!episode) return reply.status(404).send({ error: "Episode not found" });

    const [season] = await db.select({ seasonNumber: seasons.seasonNumber })
      .from(seasons).where(eq(seasons.id, episode.seasonId));
    const [show] = await db.select({ title: shows.title, imdbId: shows.imdbId })
      .from(shows).where(eq(shows.id, episode.showId));
    if (!show) return reply.status(404).send({ error: "Show not found" });

    let results;
    try {
      results = await scraper.searchSubtitles({
        title: show.title,
        imdbId: show.imdbId ?? undefined,
        language: body.data.language,
        season: season?.seasonNumber,
        episode: episode.episodeNumber,
      });
    } catch (err) {
      return reply.status(502).send({ error: `Search failed: ${String(err)}` });
    }

    const toDelete = await db.select({ id: episodeSubtitles.id, filePath: episodeSubtitles.filePath })
      .from(episodeSubtitles)
      .where(and(eq(episodeSubtitles.episodeId, id), eq(episodeSubtitles.language, body.data.language)));

    for (const s of toDelete.filter((s) => !s.filePath)) {
      await db.delete(episodeSubtitles).where(eq(episodeSubtitles.id, s.id));
    }

    for (const r of results.slice(0, 10)) {
      const score = typeof r.matchScore === "number" && isFinite(r.matchScore)
        ? Math.round(r.matchScore) : null;
      const source = r.filename
        ? `${scraper.provider}:${r.id}|${r.filename}`
        : `${scraper.provider}:${r.id}`;
      await db.insert(episodeSubtitles).values({
        id: randomUUID(),
        episodeId: id,
        language: r.language,
        forced: r.forced,
        sdh: r.sdh,
        filePath: null,
        source,
        matchScore: score,
      });
    }

    return { found: results.length };
  });

  app.post("/episodes/:id/subtitles/:subtitleId/download", async (req, reply) => {
    const { id, subtitleId } = req.params as { id: string; subtitleId: string };
    const db = getDb();
    const [sub] = await db
      .select({ source: episodeSubtitles.source, language: episodeSubtitles.language })
      .from(episodeSubtitles)
      .where(and(eq(episodeSubtitles.id, subtitleId), eq(episodeSubtitles.episodeId, id)));

    if (!sub) return reply.status(404).send({ error: "Subtitle not found" });

    await enqueueTask("download_subtitle", {
      mediaId: id,
      mediaType: "episode",
      subtitleResultId: sub.source ?? subtitleId,
      language: sub.language,
    });

    return reply.status(202).send({ message: "Download queued" });
  });

  app.get("/subtitles/status", async () => {
    const scraper = getBestSubtitleScraper();
    return {
      available: scraper !== null,
      provider: scraper?.provider ?? null,
      providers: {
        subdl: { available: subDlScraper.isAvailable(), note: "30 downloads/day free — register at subdl.com" },
        opensubtitles: { available: openSubtitlesScraper.isAvailable(), note: "5 downloads/day free — register at opensubtitles.org" },
      },
    };
  });
}
