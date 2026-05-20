import fs from "fs/promises";
import path from "path";
import { getDb } from "../db/index.js";
import { movies, episodes, seasons, shows, movieMediaInfo, episodeMediaInfo } from "../db/schema.js";
import { eq } from "drizzle-orm";
import {
  computeNewPath, buildMovieVars, buildEpisodeVars,
  type MovieRenameContext, type EpisodeRenameContext,
} from "../rename/renameEngine.js";

export interface RenamePreviewItem {
  mediaId: string;
  mediaType: "movie" | "episode";
  oldPath: string;
  newPath: string;
  conflict: boolean;
  error?: string;
}
import { recordBatch } from "../rename/renameJournal.js";
import type { JobPayload } from "./queue.js";

async function getMovieContext(movieId: string): Promise<MovieRenameContext | null> {
  const db = getDb();
  const [movie] = await db.select().from(movies).where(eq(movies.id, movieId));
  if (!movie) return null;
  const [mi] = await db.select().from(movieMediaInfo).where(eq(movieMediaInfo.movieId, movieId));
  return {
    title: movie.title,
    originalTitle: movie.originalTitle,
    sortTitle: movie.sortTitle,
    year: movie.year,
    certification: movie.certification,
    tmdbId: movie.tmdbId,
    imdbId: movie.imdbId,
    collectionName: movie.collectionName,
    filePath: movie.filePath,
    mediaInfo: mi ? {
      videoCodec: mi.videoCodec ?? undefined,
      audioCodec: mi.audioCodec ?? undefined,
      audioChannels: mi.audioChannels ?? undefined,
      hdrFormat: mi.hdrFormat ?? undefined,
      streamsJson: mi.streamsJson as Record<string, unknown> | null,
    } : null,
  };
}

async function getEpisodeContext(episodeId: string): Promise<EpisodeRenameContext | null> {
  const db = getDb();
  const [episode] = await db.select().from(episodes).where(eq(episodes.id, episodeId));
  if (!episode?.filePath) return null;
  const [season] = await db.select().from(seasons).where(eq(seasons.id, episode.seasonId));
  const [show] = await db.select().from(shows).where(eq(shows.id, episode.showId));
  if (!season || !show) return null;
  const [mi] = await db.select().from(episodeMediaInfo).where(eq(episodeMediaInfo.episodeId, episodeId));

  return {
    showTitle: show.title,
    showYear: show.firstAirDate ? parseInt(show.firstAirDate.slice(0, 4), 10) : null,
    showTvdbId: show.tvdbId,
    showTmdbId: show.tmdbId,
    showImdbId: show.imdbId,
    episodeTitle: episode.title,
    seasonNumber: season.seasonNumber,
    episodeNumber: episode.episodeNumber,
    airDate: episode.airDate,
    filePath: episode.filePath,
    mediaInfo: mi ? {
      videoCodec: mi.videoCodec ?? undefined,
      audioCodec: mi.audioCodec ?? undefined,
      audioChannels: mi.audioChannels ?? undefined,
      hdrFormat: mi.hdrFormat ?? undefined,
      streamsJson: mi.streamsJson as Record<string, unknown> | null,
    } : null,
  };
}

export async function renameFileHandler(payload: JobPayload["rename_file"]): Promise<void> {
  const db = getDb();

  if (payload.mediaType === "movie") {
    const ctx = await getMovieContext(payload.mediaId);
    if (!ctx) throw new Error(`Movie not found: ${payload.mediaId}`);

    const vars = buildMovieVars(ctx);
    const baseDir = path.dirname(path.dirname(ctx.filePath));
    const newPath = computeNewPath(baseDir, payload.template, vars);

    if (newPath === ctx.filePath) return;
    if (payload.dryRun) { console.log(`[DRY RUN] ${ctx.filePath} → ${newPath}`); return; }

    const destExists = await fs.access(newPath).then(() => true).catch(() => false);
    if (destExists) throw new Error(`Destination already exists: ${newPath}`);

    await fs.mkdir(path.dirname(newPath), { recursive: true });
    await fs.rename(ctx.filePath, newPath);
    await db.update(movies).set({ filePath: newPath, updatedAt: new Date() }).where(eq(movies.id, payload.mediaId));
    await recordBatch([{ oldPath: ctx.filePath, newPath, mediaId: payload.mediaId, mediaType: "movie" }]);
    console.log(`Renamed: ${ctx.filePath} → ${newPath}`);
  } else {
    const ctx = await getEpisodeContext(payload.mediaId);
    if (!ctx) throw new Error(`Episode not found or has no file: ${payload.mediaId}`);

    const vars = buildEpisodeVars(ctx);
    const baseDir = path.dirname(path.dirname(path.dirname(ctx.filePath)));
    const newPath = computeNewPath(baseDir, payload.template, vars);

    if (newPath === ctx.filePath) return;
    if (payload.dryRun) { console.log(`[DRY RUN] ${ctx.filePath} → ${newPath}`); return; }

    const destExists = await fs.access(newPath).then(() => true).catch(() => false);
    if (destExists) throw new Error(`Destination already exists: ${newPath}`);

    await fs.mkdir(path.dirname(newPath), { recursive: true });
    await fs.rename(ctx.filePath, newPath);
    await db.update(episodes).set({ filePath: newPath, updatedAt: new Date() }).where(eq(episodes.id, payload.mediaId));
    await recordBatch([{ oldPath: ctx.filePath, newPath, mediaId: payload.mediaId, mediaType: "episode" }]);
  }
}

export async function previewMovieRenames(movieIds: string[], template: string): Promise<RenamePreviewItem[]> {
  const contexts = await Promise.all(movieIds.map((id) => getMovieContext(id)));
  const seenNewPaths = new Set<string>();

  return contexts.flatMap((ctx, i) => {
    if (!ctx) return [];
    const id = movieIds[i]!;
    try {
      const vars = buildMovieVars(ctx);
      const baseDir = path.dirname(path.dirname(ctx.filePath));
      const newPath = computeNewPath(baseDir, template, vars);
      const conflict = seenNewPaths.has(newPath);
      seenNewPaths.add(newPath);
      return [{ mediaId: id, mediaType: "movie" as const, oldPath: ctx.filePath, newPath, conflict }];
    } catch (err) {
      return [{ mediaId: id, mediaType: "movie" as const, oldPath: ctx.filePath, newPath: "", conflict: false, error: String(err) }];
    }
  });
}

export async function previewEpisodeRenames(episodeIds: string[], template: string): Promise<RenamePreviewItem[]> {
  const contexts = await Promise.all(episodeIds.map((id) => getEpisodeContext(id)));
  const seenNewPaths = new Set<string>();

  return contexts.flatMap((ctx, i) => {
    if (!ctx) return [];
    const id = episodeIds[i]!;
    try {
      const vars = buildEpisodeVars(ctx);
      const baseDir = path.dirname(path.dirname(path.dirname(ctx.filePath)));
      const newPath = computeNewPath(baseDir, template, vars);
      const conflict = seenNewPaths.has(newPath);
      seenNewPaths.add(newPath);
      return [{ mediaId: id, mediaType: "episode" as const, oldPath: ctx.filePath, newPath, conflict }];
    } catch (err) {
      return [{ mediaId: id, mediaType: "episode" as const, oldPath: ctx.filePath, newPath: "", conflict: false, error: String(err) }];
    }
  });
}

