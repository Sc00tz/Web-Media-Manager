import fs from "fs/promises";
import path from "path";
import { getDb } from "../db/index.js";
import { movies, episodes, movieSubtitles, episodeSubtitles } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { openSubtitlesScraper } from "../scrapers/opensubtitles.js";
import { subDlScraper } from "../scrapers/subdl.js";
import type { SubtitleResult } from "@mediamanager/types";
import { config } from "../config/index.js";
import type { JobPayload } from "./queue.js";

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

// Subtitle cache path: next to the media file, named {basename}.{lang}.srt
function subtitleSavePath(mediaFilePath: string, language: string, filename?: string): string {
  const dir = path.dirname(mediaFilePath);
  const base = path.basename(mediaFilePath, path.extname(mediaFilePath));
  const ext = filename ? path.extname(filename) || ".srt" : ".srt";
  return path.join(dir, `${base}.${language}${ext}`);
}

export async function searchSubtitlesHandler(payload: JobPayload["search_subtitles"]): Promise<void> {
  const scraper = subDlScraper.isAvailable() ? subDlScraper
    : openSubtitlesScraper.isAvailable() ? openSubtitlesScraper
    : null;

  if (!scraper) {
    console.warn("No subtitle scraper configured — skipping subtitle search");
    return;
  }

  const db = getDb();

  if (payload.mediaType === "movie") {
    const [movie] = await db.select().from(movies).where(eq(movies.id, payload.mediaId));
    if (!movie) return;

    const results = await scraper.searchSubtitles({
      title: movie.title,
      year: movie.year ?? undefined,
      imdbId: movie.imdbId ?? undefined,
      language: payload.language,
    });

    const top = results.slice(0, 5);
    for (const r of top) {
      await db.insert(movieSubtitles).values({
        id: randomUUID(),
        movieId: payload.mediaId,
        language: r.language,
        forced: r.forced,
        sdh: r.sdh,
        filePath: null,
        source: `${scraper.provider}:${r.id}`,
        matchScore: r.matchScore,
      });
    }

    console.log(`Found ${results.length} subtitle results via ${scraper.provider} for: ${movie.title} [${payload.language}]`);
  } else {
    const [episode] = await db.select().from(episodes).where(eq(episodes.id, payload.mediaId));
    if (!episode) return;

    const { shows } = await import("../db/schema.js");
    const [show] = await db.select({ title: shows.title, imdbId: shows.imdbId }).from(shows).where(eq(shows.id, episode.showId));
    const { seasons } = await import("../db/schema.js");
    const [season] = await db.select({ seasonNumber: seasons.seasonNumber }).from(seasons).where(eq(seasons.id, episode.seasonId));

    if (!show) return;

    const results = await scraper.searchSubtitles({
      title: show.title,
      imdbId: show.imdbId ?? undefined,
      language: payload.language,
      season: season?.seasonNumber,
      episode: episode.episodeNumber,
    });

    const top = results.slice(0, 5);
    for (const r of top) {
      await db.insert(episodeSubtitles).values({
        id: randomUUID(),
        episodeId: payload.mediaId,
        language: r.language,
        forced: r.forced,
        sdh: r.sdh,
        filePath: null,
        source: `${scraper.provider}:${r.id}`,
        matchScore: r.matchScore,
      });
    }
  }
}

export async function downloadSubtitleHandler(payload: JobPayload["download_subtitle"]): Promise<void> {
  const db = getDb();
  // Source format: "provider:id" or "provider:id|release_name"
  // Strip the release name suffix first, then split on ":"
  const sourceBase = payload.subtitleResultId.split("|")[0] ?? payload.subtitleResultId;
  const parts = sourceBase.split(":");
  const provider = parts.length > 1 ? parts[0] : "opensubtitles";
  const fileId = parts.slice(1).join(":") ?? ""; // rejoin in case id contains ":"

  const scraper = provider === "subdl" ? subDlScraper : openSubtitlesScraper;
  if (!scraper.isAvailable()) {
    console.warn(`Subtitle provider "${provider}" not configured — skipping download`);
    return;
  }

  const subtitleResult: SubtitleResult = {
    id: fileId,
    language: payload.language,
    forced: false,
    sdh: false,
    matchScore: 0,
    source: provider as "opensubtitles" | "subdl",
  };

  const content = await scraper.downloadSubtitle(subtitleResult);

  if (payload.mediaType === "movie") {
    const [movie] = await db.select({ filePath: movies.filePath }).from(movies).where(eq(movies.id, payload.mediaId));
    if (!movie) return;

    const savePath = subtitleSavePath(movie.filePath, payload.language, `${fileId}.srt`);
    await ensureDir(path.dirname(savePath));
    await fs.writeFile(savePath, content);

    await db
      .update(movieSubtitles)
      .set({ filePath: savePath })
      .where(eq(movieSubtitles.source, payload.subtitleResultId));

    console.log(`Subtitle downloaded: ${savePath}`);
  } else {
    const [episode] = await db.select({ filePath: episodes.filePath }).from(episodes).where(eq(episodes.id, payload.mediaId));
    if (!episode?.filePath) return;

    const savePath = subtitleSavePath(episode.filePath, payload.language, `${fileId}.srt`);
    await ensureDir(path.dirname(savePath));
    await fs.writeFile(savePath, content);

    await db
      .update(episodeSubtitles)
      .set({ filePath: savePath })
      .where(eq(episodeSubtitles.source, payload.subtitleResultId));
  }
}
