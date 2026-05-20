import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getDb } from "../../db/index.js";
import {
  shows, showGenres, showCast, showCrew, showRatings, showNetworks, showTags, showArtwork,
  seasons, seasonArtwork, episodes, episodeArtwork, episodeMediaInfo, episodeSubtitles,
} from "../../db/schema.js";
import { eq, and, ilike, sql, asc, notExists, exists } from "drizzle-orm";
import { enqueueTask } from "../../workers/queue.js";

const showFiltersSchema = z.object({
  search: z.string().optional(),
  status: z.string().optional(),
  missingMetadata: z.coerce.boolean().optional(),
  missingArtwork: z.coerce.boolean().optional(),
  missingPoster: z.coerce.boolean().optional(),
  missingSubtitles: z.coerce.boolean().optional(),
  page: z.coerce.number().default(1),
  pageSize: z.coerce.number().default(50),
});

export async function showRoutes(app: FastifyInstance): Promise<void> {
  // List shows
  app.get("/shows", async (req) => {
    const query = showFiltersSchema.parse(req.query);
    const db = getDb();
    const offset = (query.page - 1) * query.pageSize;
    const conditions: ReturnType<typeof eq>[] = [];

    if (query.search) conditions.push(ilike(shows.title, `%${query.search}%`));
    if (query.status) conditions.push(ilike(shows.status, `%${query.status}%`));
    if (query.missingMetadata) conditions.push(sql`(tvdb_id IS NULL AND tmdb_id IS NULL)`);
    if (query.missingArtwork) conditions.push(
      notExists(
        db.select({ one: sql`1` }).from(showArtwork)
          .where(and(eq(showArtwork.showId, shows.id), eq(showArtwork.active, true)))
      )
    );
    if (query.missingPoster) conditions.push(
      notExists(
        db.select({ one: sql`1` }).from(showArtwork)
          .where(and(eq(showArtwork.showId, shows.id), eq(showArtwork.active, true), eq(showArtwork.type, "poster")))
      )
    );
    // Missing subtitles: show has episodes with no subtitle records and no embedded subtitle tracks
    if (query.missingSubtitles) conditions.push(
      exists(
        db.select({ one: sql`1` }).from(episodes)
          .where(and(
            eq(episodes.showId, shows.id),
            notExists(
              db.select({ one: sql`1` }).from(episodeSubtitles)
                .where(eq(episodeSubtitles.episodeId, episodes.id))
            ),
            notExists(
              db.select({ one: sql`1` }).from(episodeMediaInfo)
                .where(and(
                  eq(episodeMediaInfo.episodeId, episodes.id),
                  sql`array_length(${episodeMediaInfo.subtitleTracks}, 1) > 0`
                ))
            )
          ))
      )!
    );

    const [items, countResult] = await Promise.all([
      db
        .select({
          id: shows.id, libraryId: shows.libraryId, folderPath: shows.folderPath,
          title: shows.title, originalTitle: shows.originalTitle, sortTitle: shows.sortTitle,
          firstAirDate: shows.firstAirDate, status: shows.status, metadataLocked: shows.metadataLocked,
          tvdbId: shows.tvdbId, tmdbId: shows.tmdbId, updatedAt: shows.updatedAt,
          posterFilePath: sql<string | null>`(
            SELECT file_path FROM show_artwork
            WHERE show_id = shows.id AND type = 'poster' AND active = true
            LIMIT 1)`,
          posterSourceUrl: sql<string | null>`(
            SELECT source_url FROM show_artwork
            WHERE show_id = shows.id AND type = 'poster' AND active = true
            LIMIT 1)`,
        })
        .from(shows)
        .where(conditions.length ? and(...conditions) : undefined)
        .limit(query.pageSize)
        .offset(offset)
        .orderBy(shows.sortTitle),
      db
        .select({ count: sql<number>`count(*)` })
        .from(shows)
        .where(conditions.length ? and(...conditions) : undefined),
    ]);

    return {
      items,
      total: Number(countResult[0]?.count ?? 0),
      page: query.page,
      pageSize: query.pageSize,
    };
  });

  // Stats — counts for dashboard chips
  app.get("/shows/stats", async () => {
    const db = getDb();
    const [total, unmatched, missingArtwork, missingSubtitles] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(shows),
      db.select({ count: sql<number>`count(*)` }).from(shows).where(sql`(tvdb_id IS NULL AND tmdb_id IS NULL)`),
      db.select({ count: sql<number>`count(*)` }).from(shows).where(
        notExists(
          db.select({ one: sql`1` }).from(showArtwork)
            .where(and(eq(showArtwork.showId, shows.id), eq(showArtwork.active, true)))
        )
      ),
      db.select({ count: sql<number>`count(*)` }).from(shows).where(
        exists(
          db.select({ one: sql`1` }).from(episodes)
            .where(and(
              eq(episodes.showId, shows.id),
              notExists(
                db.select({ one: sql`1` }).from(episodeSubtitles)
                  .where(eq(episodeSubtitles.episodeId, episodes.id))
              ),
              notExists(
                db.select({ one: sql`1` }).from(episodeMediaInfo)
                  .where(and(
                    eq(episodeMediaInfo.episodeId, episodes.id),
                    sql`array_length(${episodeMediaInfo.subtitleTracks}, 1) > 0`
                  ))
              )
            ))
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

  // Queue scrape for all shows with no TVDB/TMDB id
  app.post("/shows/scan-missing", async (req, reply) => {
    const db = getDb();
    const unmatched = await db
      .select({ id: shows.id })
      .from(shows)
      .where(sql`(tvdb_id IS NULL AND tmdb_id IS NULL)`)
      .limit(100);
    for (const s of unmatched) {
      await enqueueTask("scrape_show", { showId: s.id });
    }
    return reply.status(202).send({ message: `Queued scrape for ${unmatched.length} unmatched shows` });
  });

  // Show detail
  app.get("/shows/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const db = getDb();
    const [show] = await db.select().from(shows).where(eq(shows.id, id));
    if (!show) return reply.status(404).send({ error: "Not found" });

    const [genres, cast, networks, ratings, tags, artwork, showSeasons] = await Promise.all([
      db.select().from(showGenres).where(eq(showGenres.showId, id)),
      db.select().from(showCast).where(eq(showCast.showId, id)),
      db.select().from(showNetworks).where(eq(showNetworks.showId, id)),
      db.select().from(showRatings).where(eq(showRatings.showId, id)),
      db.select().from(showTags).where(eq(showTags.showId, id)),
      db.select().from(showArtwork).where(eq(showArtwork.showId, id)),
      db.select().from(seasons).where(eq(seasons.showId, id)).orderBy(seasons.seasonNumber),
    ]);

    return {
      ...show,
      genres: genres.map((g) => g.genre),
      cast,
      networks: networks.map((n) => n.network),
      ratings,
      tags: tags.map((t) => t.tag),
      artwork,
      seasons: showSeasons,
    };
  });

  // Season detail with episodes
  app.get("/shows/:showId/seasons/:seasonNumber", async (req, reply) => {
    const { showId, seasonNumber } = req.params as { showId: string; seasonNumber: string };
    const seasonNum = parseInt(seasonNumber, 10);
    if (isNaN(seasonNum)) return reply.status(400).send({ error: "Invalid season number" });
    const db = getDb();

    const [season] = await db
      .select()
      .from(seasons)
      .where(and(eq(seasons.showId, showId), eq(seasons.seasonNumber, seasonNum)));

    if (!season) return reply.status(404).send({ error: "Season not found" });

    const [artwork, episodeList] = await Promise.all([
      db.select().from(seasonArtwork).where(eq(seasonArtwork.seasonId, season.id)),
      db
        .select()
        .from(episodes)
        .where(eq(episodes.seasonId, season.id))
        .orderBy(episodes.episodeNumber),
    ]);

    return { ...season, artwork, episodes: episodeList };
  });

  // Episode detail
  app.get("/episodes/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const db = getDb();
    const [episode] = await db.select().from(episodes).where(eq(episodes.id, id));
    if (!episode) return reply.status(404).send({ error: "Not found" });

    const [artwork, mediaInfo, season] = await Promise.all([
      db.select().from(episodeArtwork).where(eq(episodeArtwork.episodeId, id)),
      db.select().from(episodeMediaInfo).where(eq(episodeMediaInfo.episodeId, id)),
      db.select({ seasonNumber: seasons.seasonNumber }).from(seasons).where(eq(seasons.id, episode.seasonId)),
    ]);

    return { ...episode, seasonNumber: season[0]?.seasonNumber ?? null, artwork, mediaInfo: mediaInfo[0] ?? null };
  });

  // Trigger show scrape
  app.post("/shows/:id/scrape", async (req, reply) => {
    const { id } = req.params as { id: string };
    await enqueueTask("scrape_show", { showId: id });
    return reply.status(202).send({ message: "Scrape queued" });
  });

  // Trigger episode scrape
  app.post("/episodes/:id/scrape", async (req, reply) => {
    const { id } = req.params as { id: string };
    await enqueueTask("scrape_episode", { episodeId: id });
    return reply.status(202).send({ message: "Scrape queued" });
  });

  // Trigger episode MediaInfo scan
  app.post("/episodes/:id/mediainfo", async (req, reply) => {
    const { id } = req.params as { id: string };
    const db = getDb();
    const [ep] = await db.select({ filePath: episodes.filePath }).from(episodes).where(eq(episodes.id, id));
    if (!ep?.filePath) return reply.status(404).send({ error: "Episode not found or has no file" });
    await enqueueTask("extract_mediainfo", { filePath: ep.filePath, mediaId: id, mediaType: "episode" });
    return reply.status(202).send({ message: "MediaInfo scan queued" });
  });
}
