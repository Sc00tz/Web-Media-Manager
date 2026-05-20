import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getDb } from "../../db/index.js";
import {
  movies, movieGenres, movieCast, movieCrew, movieRatings,
  movieStudios, movieTags, movieArtwork, movieMediaInfo, movieSubtitles,
  movieWriters, movieCountries,
} from "../../db/schema.js";
// Re-export type needed for filter conditions
type ArtworkTypeFilter = typeof movieArtwork.type.dataType;
import { eq, and, ilike, notExists, exists, sql, gte, lte, asc, desc, isNotNull } from "drizzle-orm";
import { enqueueTask } from "../../workers/queue.js";

const movieFiltersSchema = z.object({
  search: z.string().optional(),
  status: z.enum(["unmatched", "matched", "locked"]).optional(),
  genre: z.string().optional(),
  yearMin: z.coerce.number().int().optional(),
  yearMax: z.coerce.number().int().optional(),
  resolution: z.string().optional(),
  videoCodec: z.string().optional(),
  // Missing-field filters (artwork by type)
  missingArtwork: z.coerce.boolean().optional(),       // any active artwork
  missingPoster: z.coerce.boolean().optional(),
  missingBackdrop: z.coerce.boolean().optional(),
  missingLogo: z.coerce.boolean().optional(),
  missingClearart: z.coerce.boolean().optional(),
  // Missing metadata fields
  missingMetadata: z.coerce.boolean().optional(),      // unmatched status
  missingPlot: z.coerce.boolean().optional(),
  missingDirector: z.coerce.boolean().optional(),
  missingSubtitles: z.coerce.boolean().optional(),
  missingMediaInfo: z.coerce.boolean().optional(),
  // Sort
  sortBy: z.enum(["title", "year", "updatedAt", "runtime"]).default("title"),
  sortDir: z.enum(["asc", "desc"]).default("asc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

// Maps a resolution bucket label to an inclusive [minHeight, maxHeight] range
function resolutionBucket(label: string): [number, number] | null {
  switch (label) {
    case "SD":   return [1, 719];
    case "720p":  return [720, 1079];
    case "1080p": return [1080, 2159];
    case "4K":    return [2160, 99999];
    default:      return null;
  }
}

function heightToBucketLabel(height: number | null | undefined): string | null {
  if (!height) return null;
  if (height < 720)  return "SD";
  if (height < 1080) return "720p";
  if (height < 2160) return "1080p";
  return "4K";
}

export async function movieRoutes(app: FastifyInstance): Promise<void> {
  app.get("/movies", async (req) => {
    const query = movieFiltersSchema.parse(req.query);
    const db = getDb();
    const offset = (query.page - 1) * query.pageSize;

    const conditions: ReturnType<typeof eq>[] = [];

    if (query.search) conditions.push(ilike(movies.title, `%${query.search}%`));
    if (query.status) conditions.push(eq(movies.status, query.status));
    if (query.yearMin) conditions.push(gte(movies.year, query.yearMin));
    if (query.yearMax) conditions.push(lte(movies.year, query.yearMax));

    // Genre subquery filter
    if (query.genre) {
      conditions.push(
        exists(
          db.select({ one: sql`1` }).from(movieGenres)
            .where(and(eq(movieGenres.movieId, movies.id), ilike(movieGenres.genre, `%${query.genre}%`)))
        )
      );
    }

    // Resolution filter — bucket label mapped to height range
    if (query.resolution) {
      const heightRange = resolutionBucket(query.resolution);
      if (heightRange) {
        conditions.push(
          exists(
            db.select({ one: sql`1` }).from(movieMediaInfo)
              .where(and(
                eq(movieMediaInfo.movieId, movies.id),
                gte(movieMediaInfo.height, heightRange[0]),
                lte(movieMediaInfo.height, heightRange[1]),
              ))
          )
        );
      }
    }

    if (query.videoCodec) {
      conditions.push(
        query.videoCodec === "__unknown__"
          ? exists(
              db.select({ one: sql`1` }).from(movieMediaInfo)
                .where(and(eq(movieMediaInfo.movieId, movies.id), sql`${movieMediaInfo.videoCodec} is null`))
            )
          : exists(
              db.select({ one: sql`1` }).from(movieMediaInfo)
                .where(and(eq(movieMediaInfo.movieId, movies.id), eq(movieMediaInfo.videoCodec, query.videoCodec)))
            )
      );
    }

    // Missing artwork filters
    const missingArtworkType = (type: string) =>
      notExists(
        db.select({ one: sql`1` }).from(movieArtwork)
          .where(and(
            eq(movieArtwork.movieId, movies.id),
            eq(movieArtwork.active, true),
            eq(movieArtwork.type, type as "poster")
          ))
      );

    if (query.missingArtwork) conditions.push(missingArtworkType("poster")); // any == poster as proxy
    if (query.missingPoster) conditions.push(missingArtworkType("poster"));
    if (query.missingBackdrop) conditions.push(missingArtworkType("backdrop"));
    if (query.missingLogo) conditions.push(missingArtworkType("logo"));
    if (query.missingClearart) conditions.push(missingArtworkType("clearart"));

    // Missing metadata
    if (query.missingMetadata) conditions.push(eq(movies.status, "unmatched"));
    if (query.missingPlot) conditions.push(sql`(${movies.plot} IS NULL OR ${movies.plot} = '')`);
    if (query.missingDirector) conditions.push(
      notExists(
        db.select({ one: sql`1` }).from(movieCrew)
          .where(and(eq(movieCrew.movieId, movies.id), eq(movieCrew.job, "Director")))
      )
    );

    // Missing subtitles: no downloaded/searched subtitle records AND no embedded tracks from MediaInfo
    if (query.missingSubtitles) conditions.push(
      and(
        notExists(
          db.select({ one: sql`1` }).from(movieSubtitles)
            .where(eq(movieSubtitles.movieId, movies.id))
        ),
        notExists(
          db.select({ one: sql`1` }).from(movieMediaInfo)
            .where(and(
              eq(movieMediaInfo.movieId, movies.id),
              sql`array_length(${movieMediaInfo.subtitleTracks}, 1) > 0`
            ))
        )
      )!
    );

    // Missing MediaInfo
    if (query.missingMediaInfo) conditions.push(
      notExists(
        db.select({ one: sql`1` }).from(movieMediaInfo)
          .where(eq(movieMediaInfo.movieId, movies.id))
      )
    );

    const sortCol = {
      title: movies.sortTitle,
      year: movies.year,
      updatedAt: movies.updatedAt,
      runtime: movies.runtime,
    }[query.sortBy] ?? movies.sortTitle;

    const order = query.sortDir === "desc" ? desc(sortCol) : asc(sortCol);
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    // Include active poster path/url in list for grid display
    const [items, countResult] = await Promise.all([
      db
        .select({
          id: movies.id, libraryId: movies.libraryId, filePath: movies.filePath,
          title: movies.title, originalTitle: movies.originalTitle, sortTitle: movies.sortTitle,
          year: movies.year, status: movies.status, metadataLocked: movies.metadataLocked,
          tmdbId: movies.tmdbId, imdbId: movies.imdbId, updatedAt: movies.updatedAt,
          runtime: movies.runtime, certification: movies.certification,
          posterFilePath: sql<string | null>`(
            SELECT file_path FROM movie_artwork
            WHERE movie_id = movies.id AND type = 'poster' AND active = true
            LIMIT 1)`,
          posterSourceUrl: sql<string | null>`(
            SELECT source_url FROM movie_artwork
            WHERE movie_id = movies.id AND type = 'poster' AND active = true
            LIMIT 1)`,
        })
        .from(movies)
        .where(where)
        .orderBy(order)
        .limit(query.pageSize)
        .offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(movies).where(where),
    ]);

    return {
      items,
      total: Number(countResult[0]?.count ?? 0),
      page: query.page,
      pageSize: query.pageSize,
    };
  });

  // Distinct filter values — drives the codec/resolution dropdowns in the UI
  app.get("/movies/filter-options", async () => {
    const db = getDb();
    const [codecs, heights, noCodec] = await Promise.all([
      db.selectDistinct({ value: movieMediaInfo.videoCodec })
        .from(movieMediaInfo)
        .where(sql`${movieMediaInfo.videoCodec} is not null`)
        .orderBy(movieMediaInfo.videoCodec),
      db.selectDistinct({ value: movieMediaInfo.height })
        .from(movieMediaInfo)
        .where(sql`${movieMediaInfo.height} is not null`),
      db.select({ count: sql<number>`count(*)` })
        .from(movieMediaInfo)
        .where(sql`${movieMediaInfo.videoCodec} is null`),
    ]);

    // Collapse raw heights into standard bucket labels, dedup, and sort
    const bucketOrder = ["SD", "720p", "1080p", "4K"];
    const bucketSet = new Set(
      heights.map((r) => heightToBucketLabel(r.value)).filter(Boolean) as string[]
    );
    const resolutions = bucketOrder.filter((b) => bucketSet.has(b));

    return {
      codecs: codecs.map((r) => r.value).filter(Boolean) as string[],
      resolutions,
      noCodecCount: Number(noCodec[0]?.count ?? 0),
    };
  });

  // Stats endpoint — count by status, missing artwork, etc.
  app.get("/movies/stats", async () => {
    const db = getDb();
    const [total, unmatched, missingArtwork, missingSubtitles] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(movies),
      db.select({ count: sql<number>`count(*)` }).from(movies).where(eq(movies.status, "unmatched")),
      db.select({ count: sql<number>`count(*)` }).from(movies).where(
        notExists(
          db.select({ one: sql`1` }).from(movieArtwork)
            .where(and(eq(movieArtwork.movieId, movies.id), eq(movieArtwork.active, true)))
        )
      ),
      db.select({ count: sql<number>`count(*)` }).from(movies).where(
        and(
          notExists(
            db.select({ one: sql`1` }).from(movieSubtitles)
              .where(eq(movieSubtitles.movieId, movies.id))
          ),
          notExists(
            db.select({ one: sql`1` }).from(movieMediaInfo)
              .where(and(
                eq(movieMediaInfo.movieId, movies.id),
                sql`array_length(${movieMediaInfo.subtitleTracks}, 1) > 0`
              ))
          )
        )!
      ),
    ]);

    return {
      total: Number(total[0]?.count ?? 0),
      unmatched: Number(unmatched[0]?.count ?? 0),
      missingArtwork: Number(missingArtwork[0]?.count ?? 0),
      missingSubtitles: Number(missingSubtitles[0]?.count ?? 0),
    };
  });

  app.get("/movies/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const db = getDb();

    const [movie] = await db.select().from(movies).where(eq(movies.id, id));
    if (!movie) return reply.status(404).send({ error: "Not found" });

    const [genres, cast, crew, ratings, studios, writers, countries, tags, artwork, mediaInfo] = await Promise.all([
      db.select().from(movieGenres).where(eq(movieGenres.movieId, id)),
      db.select().from(movieCast).where(eq(movieCast.movieId, id)),
      db.select().from(movieCrew).where(eq(movieCrew.movieId, id)),
      db.select().from(movieRatings).where(eq(movieRatings.movieId, id)),
      db.select().from(movieStudios).where(eq(movieStudios.movieId, id)),
      db.select().from(movieWriters).where(eq(movieWriters.movieId, id)),
      db.select().from(movieCountries).where(eq(movieCountries.movieId, id)),
      db.select().from(movieTags).where(eq(movieTags.movieId, id)),
      db.select().from(movieArtwork).where(eq(movieArtwork.movieId, id)),
      db.select().from(movieMediaInfo).where(eq(movieMediaInfo.movieId, id)),
    ]);

    return {
      ...movie,
      genres: genres.map((g) => g.genre),
      cast,
      crew,
      ratings,
      studios: studios.map((s) => s.studio),
      writers: writers.map((w) => w.name),
      countries: countries.map((c) => c.country),
      tags: tags.map((t) => t.tag),
      artwork,
      mediaInfo: mediaInfo[0] ?? null,
    };
  });

  app.post("/movies/:id/scrape", async (req, reply) => {
    const { id } = req.params as { id: string };
    await enqueueTask("scrape_movie", { movieId: id });
    return reply.status(202).send({ message: "Scrape queued" });
  });

  app.post("/movies/:id/mediainfo", { config: { rawBody: false } }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const db = getDb();
    const [movie] = await db.select({ filePath: movies.filePath }).from(movies).where(eq(movies.id, id));
    if (!movie) return reply.status(404).send({ error: "Not found" });
    await enqueueTask("extract_mediainfo", { filePath: movie.filePath, mediaId: id, mediaType: "movie" });
    return reply.status(202).send({ message: "MediaInfo extraction queued" });
  });

  // Queue MediaInfo for all movies that don't have it yet
  app.post("/movies/scan-mediainfo", async (req, reply) => {
    const db = getDb();
    const pending = await db
      .select({ id: movies.id, filePath: movies.filePath })
      .from(movies)
      .where(notExists(
        db.select({ one: sql`1` }).from(movieMediaInfo).where(eq(movieMediaInfo.movieId, movies.id))
      ));

    for (const m of pending) {
      await enqueueTask("extract_mediainfo", { filePath: m.filePath, mediaId: m.id, mediaType: "movie" });
    }

    return reply.status(202).send({ message: `Queued MediaInfo for ${pending.length} movies` });
  });

  // Scan all unmatched movies in a library for missing metadata/artwork
  app.post("/movies/scan-missing", async (req, reply) => {
    const db = getDb();
    const unmatched = await db
      .select({ id: movies.id })
      .from(movies)
      .where(eq(movies.status, "unmatched"))
      .limit(100);

    for (const m of unmatched) {
      await enqueueTask("scrape_movie", { movieId: m.id });
    }

    return reply.status(202).send({ message: `Queued scrape for ${unmatched.length} unmatched movies` });
  });
}
