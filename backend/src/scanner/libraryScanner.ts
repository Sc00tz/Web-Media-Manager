import fs from "fs/promises";
import { Dirent } from "fs";
import path from "path";
import { getDb } from "../db/index.js";
import {
  libraries, movies, shows, seasons, episodes,
  movieArtwork, showArtwork, seasonArtwork, episodeArtwork,
  movieGenres, movieCast, movieCrew, movieRatings, movieStudios,
  movieWriters, movieCountries,
  showGenres, showCast, showNetworks, showRatings,
} from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  categorizeFile,
  extractEpisodeInfo,
  extractTitle,
  extractYear,
  extractEmbeddedIds,
  stripEmbeddedIds,
  isSeasonFolder,
  isSystemFile,
  toSortTitle,
  VIDEO_EXTENSIONS,
} from "./fileDetector.js";
import { enqueueTask } from "../workers/queue.js";
import {
  findMovieNfo, findShowNfo, findEpisodeNfo, readNfo,
  parseMovieNfo, parseShowNfo, parseEpisodeNfo,
} from "./nfoParser.js";
import { detectMovieArtwork, detectShowArtwork, detectSeasonPosters, detectEpisodeArtwork } from "./localArtwork.js";

export interface ScanProgress {
  scanned: number;
  added: number;
  updated: number;
  errors: string[];
}

async function walkDir(dir: string): Promise<string[]> {
  const results: string[] = [];
  let entries: Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true }) as Dirent[];
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const fullPath = path.join(dir, String(entry.name));
    if (entry.isDirectory()) {
      const sub = await walkDir(fullPath);
      results.push(...sub);
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }

  return results;
}

export async function scanMovieLibrary(
  libraryId: string,
  libraryPath: string,
  progress: ScanProgress
): Promise<void> {
  const db = getDb();
  const allFiles = await walkDir(libraryPath);

  const videoFiles = allFiles.filter((f) => {
    const ext = path.extname(f).toLowerCase();
    return VIDEO_EXTENSIONS.has(ext) && !isSystemFile(f);
  });

  for (const filePath of videoFiles) {
    progress.scanned++;
    const detected = categorizeFile(filePath);
    if (detected.isExtra) continue;

    try {
      // Check if movie already tracked
      const existing = await db
        .select({ id: movies.id })
        .from(movies)
        .where(eq(movies.filePath, filePath));

      if (existing.length > 0) {
        progress.updated++;
        continue;
      }

      const folderName = path.basename(path.dirname(filePath));
      const embeddedIds = extractEmbeddedIds(folderName);
      const cleanFolderName = stripEmbeddedIds(folderName);

      // Try reading existing NFO first
      const nfoPath = await findMovieNfo(filePath);
      const nfoXml = nfoPath ? await readNfo(nfoPath) : null;
      const nfo = nfoXml ? parseMovieNfo(nfoXml) : null;

      const title = nfo?.title || extractTitle(cleanFolderName) || extractTitle(path.basename(filePath));
      const year = nfo?.year ?? extractYear(cleanFolderName) ?? extractYear(path.basename(filePath));
      const tmdbId = nfo?.tmdbId ?? embeddedIds.tmdbId ?? null;
      const imdbId = nfo?.imdbId ?? embeddedIds.imdbId ?? null;

      const movieId = randomUUID();
      await db.insert(movies).values({
        id: movieId,
        libraryId,
        filePath,
        title: title || cleanFolderName,
        originalTitle: nfo?.originalTitle ?? null,
        sortTitle: nfo?.sortTitle ?? toSortTitle(title || cleanFolderName),
        year: year ?? null,
        releaseDate: nfo?.releaseDate ?? null,
        plot: nfo?.plot ?? null,
        tagline: nfo?.tagline ?? null,
        runtime: nfo?.runtime ?? null,
        certification: nfo?.certification ?? null,
        tmdbId,
        imdbId,
        collectionName: nfo?.collectionName ?? null,
        edition: nfo?.edition ?? null,
        country: nfo?.country ?? null,
        originalLanguage: nfo?.originalLanguage ?? null,
        criticRating: nfo?.criticRating ?? null,
        status: nfo ? "matched" : "unmatched",
        metadataLocked: false,
      });

      // Import NFO genres, studios, directors, cast
      if (nfo) {
        if (nfo.genres.length) {
          await db.insert(movieGenres).values(nfo.genres.map((g) => ({ movieId, genre: g }))).onConflictDoNothing();
        }
        if (nfo.studios.length) {
          await db.insert(movieStudios).values(nfo.studios.map((s) => ({ movieId, studio: s }))).onConflictDoNothing();
        }
        if (nfo.rating !== undefined) {
          await db.insert(movieRatings).values({ movieId, source: "nfo", value: String(nfo.rating), votes: nfo.ratingVotes ?? null }).onConflictDoNothing();
        }
        if (nfo.cast.length) {
          await db.insert(movieCast).values(nfo.cast.map((c, i) => ({
            id: randomUUID(), movieId, name: c.name,
            character: c.character ?? null, order: c.order ?? i,
            profilePath: c.thumb ?? null, tmdbPersonId: null,
          })));
        }
        if (nfo.directors.length) {
          await db.insert(movieCrew).values(nfo.directors.map((d) => ({
            id: randomUUID(), movieId, name: d, job: "Director",
            department: "Directing", tmdbPersonId: null,
          })));
        }
        if (nfo.writers?.length) {
          await db.insert(movieWriters).values(nfo.writers.map((w) => ({ movieId, name: w }))).onConflictDoNothing();
        }
        if (nfo.countries?.length) {
          await db.insert(movieCountries).values(nfo.countries.map((c) => ({ movieId, country: c }))).onConflictDoNothing();
        }
      }

      // Import local artwork files — each type is already deduplicated, so all are active
      const artworkFiles = await detectMovieArtwork(path.dirname(filePath));
      if (artworkFiles.length) {
        await db.insert(movieArtwork).values(
          artworkFiles.map((a) => ({
            id: randomUUID(),
            movieId,
            type: a.type,
            filePath: a.filePath,
            sourceUrl: null,
            active: true,
            source: "local",
          }))
        ).onConflictDoNothing();
      }

      // Queue MediaInfo; only run CLI if no XML exists (handled inside extractMediaInfo)
      await enqueueTask("extract_mediainfo", { filePath, mediaId: movieId, mediaType: "movie" });

      // Only scrape if no NFO data was found
      if (!nfo && tmdbId) {
        await enqueueTask("scrape_movie", { movieId, tmdbId });
      } else if (!nfo) {
        await enqueueTask("scrape_movie", { movieId });
      }

      progress.added++;
    } catch (err) {
      progress.errors.push(`Failed to process ${filePath}: ${String(err)}`);
    }
  }
}

// Determine whether a directory looks like a show folder (has seasons or video files inside)
// vs. a category folder (contains only subdirectories that look like shows).
async function looksLikeShowFolder(dir: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true }) as Dirent[];
    for (const e of entries) {
      if (e.isDirectory() && isSeasonFolder(String(e.name)) !== null) return true;
      if (e.isFile() && VIDEO_EXTENSIONS.has(path.extname(String(e.name)).toLowerCase())) return true;
    }
    // Has subdirectories but none are season folders — check one level deeper
    return false;
  } catch {
    return false;
  }
}

export async function scanTvLibrary(
  libraryId: string,
  libraryPath: string,
  progress: ScanProgress
): Promise<void> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(libraryPath, { withFileTypes: true }) as Dirent[];
  } catch {
    return;
  }

  const subdirs = entries.filter((e) => e.isDirectory()).map((e) => path.join(libraryPath, String(e.name)));

  for (const dir of subdirs) {
    const isShow = await looksLikeShowFolder(dir);
    if (isShow) {
      await processTvShowDir(libraryId, dir, progress);
    } else {
      // Category folder (e.g. Active/, Completed/) — recurse one level
      await scanTvLibrary(libraryId, dir, progress);
    }
  }
}

async function processTvShowDir(
  libraryId: string,
  showDir: string,
  progress: ScanProgress
): Promise<void> {
  const db = getDb();
  const rawName = path.basename(showDir);
  const embeddedIds = extractEmbeddedIds(rawName);
  const cleanName = stripEmbeddedIds(rawName);

  // Read existing tvshow.nfo if present
  const nfoPath = await findShowNfo(showDir);
  const nfoXml = nfoPath ? await readNfo(nfoPath) : null;
  const nfo = nfoXml ? parseShowNfo(nfoXml) : null;

  const title = nfo?.title || extractTitle(cleanName) || cleanName;
  const tvdbId = nfo?.tvdbId ?? embeddedIds.tvdbId ?? null;
  const imdbId = nfo?.imdbId ?? embeddedIds.imdbId ?? null;
  const tmdbId = nfo?.tmdbId ?? null;

  progress.scanned++;
  try {
    let [show] = await db
      .select({ id: shows.id })
      .from(shows)
      .where(eq(shows.folderPath, showDir));

    if (!show) {
      const showId = randomUUID();
      const [inserted] = await db.insert(shows).values({
        id: showId,
        libraryId,
        folderPath: showDir,
        title,
        originalTitle: nfo?.originalTitle ?? null,
        sortTitle: nfo?.sortTitle ?? toSortTitle(title),
        firstAirDate: nfo?.firstAirDate ?? null,
        plot: nfo?.plot ?? null,
        status: nfo?.status ?? null,
        certification: nfo?.certification ?? null,
        tvdbId,
        tmdbId,
        imdbId,
        metadataLocked: false,
      }).returning({ id: shows.id });
      show = inserted!;

      // Import NFO metadata
      if (nfo) {
        if (nfo.genres.length) await db.insert(showGenres).values(nfo.genres.map((g) => ({ showId: show!.id, genre: g }))).onConflictDoNothing();
        if (nfo.networks.length) await db.insert(showNetworks).values(nfo.networks.map((n) => ({ showId: show!.id, network: n }))).onConflictDoNothing();
        if (nfo.rating !== undefined) await db.insert(showRatings).values({ showId: show!.id, source: "nfo", value: String(nfo.rating) }).onConflictDoNothing();
        if (nfo.cast.length) await db.insert(showCast).values(nfo.cast.map((c, i) => ({
          id: randomUUID(), showId: show!.id, name: c.name,
          character: c.character ?? null, order: c.order ?? i,
          profilePath: c.thumb ?? null, tmdbPersonId: null,
        })));
      }

      // Import local show-level artwork (poster, fanart, logo, etc.)
      const allArtworkFiles = await detectShowArtwork(showDir);
      const showLevelArtwork = allArtworkFiles.filter((a) => a.type !== "season_poster");

      if (showLevelArtwork.length) {
        await db.insert(showArtwork).values(
          showLevelArtwork.map((a) => ({
            id: randomUUID(), showId: show!.id,
            type: a.type, filePath: a.filePath,
            sourceUrl: null, active: true, source: "local",
          }))
        ).onConflictDoNothing();
      }

      // Store season poster images in season_artwork
      let allFiles: string[];
      try { allFiles = await fs.readdir(showDir); } catch { allFiles = []; }
      const seasonPosters = detectSeasonPosters(showDir, allFiles);

      for (const sp of seasonPosters) {
        // Find or create the season row
        let [season] = await db
          .select({ id: seasons.id })
          .from(seasons)
          .where(and(eq(seasons.showId, show!.id), eq(seasons.seasonNumber, sp.seasonNumber)));

        if (!season) {
          const [inserted] = await db.insert(seasons).values({
            id: randomUUID(), showId: show!.id, seasonNumber: sp.seasonNumber,
            title: sp.seasonNumber === 0 ? "Specials" : null,
          }).returning({ id: seasons.id });
          season = inserted!;
        }

        await db.insert(seasonArtwork).values({
          id: randomUUID(),
          seasonId: season.id,
          showId: show!.id,
          type: "season_poster",
          filePath: sp.filePath,
          sourceUrl: null,
          active: true,
          source: "local",
        }).onConflictDoNothing();
      }

      // Only queue scrape if no NFO found
      if (!nfo) {
        await enqueueTask("scrape_show", {
          showId: show.id,
          ...(tvdbId ? { tvdbId } : {}),
        });
      }

      progress.added++;
    } else {
      progress.updated++;
    }

    await scanShowDirectory(show.id, showDir, progress);
  } catch (err) {
    progress.errors.push(`Failed to process show ${showDir}: ${String(err)}`);
  }
}

async function scanShowDirectory(
  showId: string,
  showDir: string,
  progress: ScanProgress
): Promise<void> {
  const db = getDb();
  let entries: Dirent[];
  try {
    entries = await fs.readdir(showDir, { withFileTypes: true }) as Dirent[];
  } catch {
    return;
  }

  for (const entry of entries) {
    const entryPath = path.join(showDir, String(entry.name));
    const entryName = String(entry.name);

    if (entry.isDirectory()) {
      // Standard season folder (Season 01, S02, etc.)
      let seasonNum = isSeasonFolder(entryName);
      // "Specials" folder = season 0
      if (seasonNum === null && /^specials$/i.test(entryName)) seasonNum = 0;

      if (seasonNum !== null) {
        // FIXED: query by both showId AND seasonNumber to avoid collapsing all seasons into one
        let [season] = await db
          .select({ id: seasons.id })
          .from(seasons)
          .where(and(eq(seasons.showId, showId), eq(seasons.seasonNumber, seasonNum)));

        if (!season) {
          const [inserted] = await db.insert(seasons).values({
            id: randomUUID(),
            showId,
            seasonNumber: seasonNum,
            title: seasonNum === 0 ? "Specials" : null,
          }).returning({ id: seasons.id });
          season = inserted!;
        }

        await scanSeasonDirectory(season.id, showId, seasonNum, entryPath, progress);
      }
    } else if (entry.isFile()) {
      if (isSystemFile(entryName)) continue;
      const ext = path.extname(entryName).toLowerCase();
      if (VIDEO_EXTENSIONS.has(ext)) {
        const epInfo = extractEpisodeInfo(entryName);
        if (epInfo) {
          await upsertEpisodeFile(showId, epInfo.season, epInfo.episode, entryPath, progress);
        }
      }
    }
  }
}

async function scanSeasonDirectory(
  seasonId: string,
  showId: string,
  seasonNumber: number,
  dir: string,
  progress: ScanProgress
): Promise<void> {
  const db = getDb();
  let entries: Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true }) as Dirent[];
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const entryName = String(entry.name);
    if (isSystemFile(entryName)) continue;
    const ext = path.extname(entryName).toLowerCase();
    if (!VIDEO_EXTENSIONS.has(ext)) continue;

    const detected = categorizeFile(entryName);
    if (detected.isExtra) continue;

    const epInfo = extractEpisodeInfo(entryName);
    if (!epInfo) continue;

    const filePath = path.join(dir, entryName);
    await upsertEpisodeFile(showId, seasonNumber, epInfo.episode, filePath, progress);
  }
}

async function upsertEpisodeFile(
  showId: string,
  seasonNumber: number,
  episodeNumber: number,
  filePath: string,
  progress: ScanProgress
): Promise<void> {
  const db = getDb();

  // Find or create season — MUST include seasonNumber to avoid collapsing all seasons into one
  let [season] = await db
    .select({ id: seasons.id })
    .from(seasons)
    .where(and(eq(seasons.showId, showId), eq(seasons.seasonNumber, seasonNumber)));

  if (!season) {
    const [inserted] = await db.insert(seasons).values({
      id: randomUUID(),
      showId,
      seasonNumber,
    }).returning({ id: seasons.id });
    season = inserted!;
  }

  // Skip if already tracked
  const existing = await db
    .select({ id: episodes.id })
    .from(episodes)
    .where(eq(episodes.filePath, filePath));

  if (existing.length > 0) return;

  // Read episode NFO if present
  const nfoPath = await findEpisodeNfo(filePath);
  const nfoXml = nfoPath ? await readNfo(nfoPath) : null;
  const nfo = nfoXml ? parseEpisodeNfo(nfoXml) : null;

  const episodeId = randomUUID();
  await db.insert(episodes).values({
    id: episodeId,
    seasonId: season.id,
    showId,
    episodeNumber,
    title: nfo?.title ?? null,
    plot: nfo?.plot ?? null,
    airDate: nfo?.airDate ?? null,
    runtime: nfo?.runtime ?? null,
    tvdbId: nfo?.tvdbId ?? null,
    tmdbId: nfo?.tmdbId ?? null,
    filePath,
    metadataLocked: false,
  });

  // Import local episode artwork (thumbnail)
  const artworkFiles = await detectEpisodeArtwork(filePath);
  if (artworkFiles.length) {
    await db.insert(episodeArtwork).values(
      artworkFiles.map((a) => ({
        id: randomUUID(), episodeId,
        type: a.type, filePath: a.filePath,
        sourceUrl: null, active: true, source: "local",
      }))
    ).onConflictDoNothing();
  }

  // Queue MediaInfo — will use existing XML if present
  await enqueueTask("extract_mediainfo", { filePath, mediaId: episodeId, mediaType: "episode" });

  progress.added++;
}
