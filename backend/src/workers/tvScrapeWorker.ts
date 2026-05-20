import { getDb } from "../db/index.js";
import {
  shows, showGenres, showCast, showCrew, showRatings, showNetworks, seasons, episodes,
} from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import { tvdbScraper } from "../scrapers/tvdb.js";
import { tmdbScraper } from "../scrapers/tmdb.js";
import { extractTitle, extractYear } from "../scanner/fileDetector.js";
import path from "path";
import type { JobPayload } from "./queue.js";

export async function scrapeShowHandler(payload: JobPayload["scrape_show"]): Promise<void> {
  const db = getDb();
  const [show] = await db.select().from(shows).where(eq(shows.id, payload.showId));
  if (!show) throw new Error(`Show not found: ${payload.showId}`);
  if (show.metadataLocked) return;

  const scraperAvailable = tvdbScraper.isAvailable();
  if (!scraperAvailable) {
    console.warn("TVDB scraper not configured — skipping show scrape");
    return;
  }

  let tvdbId = payload.tvdbId ?? show.tvdbId ?? undefined;
  let scraped: Awaited<ReturnType<typeof tvdbScraper.getShow>>;

  if (tvdbId) {
    scraped = await tvdbScraper.getShow(String(tvdbId));
  } else {
    const title = show.title || extractTitle(path.basename(show.folderPath));
    const year = extractYear(path.basename(show.folderPath));
    const results = await tvdbScraper.searchShows({ title, year });
    if (results.length === 0) return;

    const top = results[0]!;
    if (top.confidence < 0.4) {
      console.log(`Low confidence (${top.confidence}) for show: ${title}`);
      return;
    }

    tvdbId = parseInt(top.id, 10);
    scraped = await tvdbScraper.getShow(top.id);
  }

  if (!scraped.title) return;

  await db.update(shows).set({
    title: scraped.title ?? show.title,
    originalTitle: scraped.originalTitle ?? null,
    sortTitle: scraped.sortTitle ?? null,
    firstAirDate: scraped.firstAirDate ?? null,
    plot: scraped.plot ?? null,
    status: scraped.status ?? null,
    tvdbId: scraped.tvdbId ?? tvdbId ?? null,
    imdbId: scraped.imdbId ?? show.imdbId ?? null,
    updatedAt: new Date(),
  }).where(eq(shows.id, show.id));

  // Genres
  await db.delete(showGenres).where(eq(showGenres.showId, show.id));
  if (scraped.genres?.length) {
    await db.insert(showGenres).values(
      scraped.genres.map((g) => ({ showId: show.id, genre: g }))
    );
  }

  // Networks
  await db.delete(showNetworks).where(eq(showNetworks.showId, show.id));
  if (scraped.networks?.length) {
    await db.insert(showNetworks).values(
      scraped.networks.map((n) => ({ showId: show.id, network: n }))
    );
  }

  // Cast
  await db.delete(showCast).where(eq(showCast.showId, show.id));
  if (scraped.cast?.length) {
    await db.insert(showCast).values(
      scraped.cast.map((c) => ({
        id: randomUUID(),
        showId: show.id,
        name: c.name,
        character: c.character ?? null,
        order: c.order ?? null,
        profilePath: c.profilePath ?? null,
        tmdbPersonId: c.tmdbPersonId ?? null,
      }))
    );
  }

  // Ratings
  await db.delete(showRatings).where(eq(showRatings.showId, show.id));
  if (scraped.ratings?.length) {
    await db.insert(showRatings).values(
      scraped.ratings.map((r) => ({
        showId: show.id,
        source: r.source,
        value: String(r.value),
        votes: r.votes ?? null,
      }))
    );
  }

  // Upsert seasons discovered during scraping
  if (scraped.seasons?.length) {
    for (const s of scraped.seasons) {
      const sn = s.seasonNumber ?? 0;
      const existing = await db
        .select({ id: seasons.id })
        .from(seasons)
        .where(and(eq(seasons.showId, show.id), eq(seasons.seasonNumber, sn)));

      if (!existing.length) {
        await db.insert(seasons).values({
          id: randomUUID(),
          showId: show.id,
          seasonNumber: sn,
          title: s.title ?? null,
          plot: s.plot ?? null,
          airDate: s.airDate ?? null,
          tvdbId: s.tvdbId ?? null,
        });
      }
    }
  }

  console.log(`Scraped show: ${scraped.title} (TVDB ${tvdbId})`);
}

export async function scrapeEpisodeHandler(payload: JobPayload["scrape_episode"]): Promise<void> {
  const db = getDb();
  const [episode] = await db
    .select()
    .from(episodes)
    .where(eq(episodes.id, payload.episodeId));

  if (!episode || episode.metadataLocked) return;

  const [season] = await db
    .select({ seasonNumber: seasons.seasonNumber })
    .from(seasons)
    .where(eq(seasons.id, episode.seasonId));

  const [show] = await db
    .select({ tvdbId: shows.tvdbId })
    .from(shows)
    .where(eq(shows.id, episode.showId));

  if (!show?.tvdbId || !season) return;

  const scraped = await tvdbScraper.getEpisode(
    String(show.tvdbId),
    season.seasonNumber,
    episode.episodeNumber
  );

  if (!scraped.title && !scraped.tvdbId) return;

  await db.update(episodes).set({
    title: scraped.title ?? null,
    plot: scraped.plot ?? null,
    airDate: scraped.airDate ?? null,
    runtime: scraped.runtime ?? null,
    tvdbId: scraped.tvdbId ?? null,
    updatedAt: new Date(),
  }).where(eq(episodes.id, episode.id));
}
