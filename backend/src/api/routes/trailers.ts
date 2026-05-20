import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getDb } from "../../db/index.js";
import { movieTrailers } from "../../db/schema.js";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";

const addTrailerSchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  source: z.string().default("manual"),
});

export async function trailerRoutes(app: FastifyInstance): Promise<void> {
  app.get("/movies/:id/trailers", async (req) => {
    const { id } = req.params as { id: string };
    const db = getDb();
    return db.select().from(movieTrailers).where(eq(movieTrailers.movieId, id));
  });

  app.post("/movies/:id/trailers", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = addTrailerSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.message });

    const db = getDb();
    const [trailer] = await db
      .insert(movieTrailers)
      .values({ id: randomUUID(), movieId: id, ...body.data })
      .returning();

    return reply.status(201).send(trailer);
  });

  app.delete("/movies/:id/trailers/:trailerId", async (req, reply) => {
    const { id, trailerId } = req.params as { id: string; trailerId: string };
    const db = getDb();
    await db.delete(movieTrailers).where(
      and(eq(movieTrailers.id, trailerId), eq(movieTrailers.movieId, id))
    );
    return reply.status(204).send();
  });

  // Fetch TMDB trailer URLs for a movie and store them
  app.post("/movies/:id/trailers/fetch", async (req, reply) => {
    const { id } = req.params as { id: string };
    const db = getDb();
    const { movies } = await import("../../db/schema.js");
    const { eq: drizzleEq } = await import("drizzle-orm");
    const [movie] = await db.select({ tmdbId: movies.tmdbId }).from(movies).where(drizzleEq(movies.id, id));

    if (!movie?.tmdbId) return reply.status(422).send({ error: "Movie has no TMDB ID" });

    const { getApiKey } = await import("../../config/index.js");
    const tmdbKey = getApiKey("tmdb");
    if (!tmdbKey) return reply.status(422).send({ error: "TMDB API key not configured — add it in Settings → Scrapers" });

    const res = await fetch(
      `https://api.themoviedb.org/3/movie/${movie.tmdbId}/videos?api_key=${tmdbKey}&language=en-US`
    );
    if (!res.ok) return reply.status(502).send({ error: "TMDB request failed" });

    const data = await res.json() as {
      results: Array<{ name: string; key: string; site: string; type: string; official: boolean }>;
    };

    const trailers = data.results.filter(
      (v) => v.site === "YouTube" && (v.type === "Trailer" || v.type === "Teaser")
    );

    let added = 0;
    for (const t of trailers) {
      const url = `https://www.youtube.com/watch?v=${t.key}`;
      const exists = await db
        .select({ id: movieTrailers.id })
        .from(movieTrailers)
        .where(and(eq(movieTrailers.movieId, id), eq(movieTrailers.url, url)));

      if (exists.length) continue;

      await db.insert(movieTrailers).values({
        id: randomUUID(),
        movieId: id,
        name: t.name,
        url,
        source: "tmdb",
      });
      added++;
    }

    return { added, total: trailers.length };
  });
}
