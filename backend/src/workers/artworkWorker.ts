import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { getDb } from "../db/index.js";
import { movies, shows, movieArtwork, showArtwork, seasonArtwork } from "../db/schema.js";
import { eq, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import { tmdbScraper } from "../scrapers/tmdb.js";
import { fanartScraper } from "../scrapers/fanart.js";
import { tvdbScraper } from "../scrapers/tvdb.js";
import { config } from "../config/index.js";
import type { ArtworkResult } from "@mediamanager/types";
import type { JobPayload } from "./queue.js";

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

function artworkCachePath(sourceUrl: string, ext = ".jpg"): string {
  const hash = crypto.createHash("sha256").update(sourceUrl).digest("hex").slice(0, 16);
  return path.join(config.CACHE_DIR, "artwork", `${hash}${ext}`);
}

async function downloadToCache(url: string): Promise<string> {
  const ext = path.extname(new URL(url).pathname) || ".jpg";
  const dest = artworkCachePath(url, ext);

  // Already cached — never overwrite
  try {
    await fs.access(dest);
    return dest;
  } catch {}

  await ensureDir(path.dirname(dest));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download artwork: HTTP ${res.status}`);

  const buf = Buffer.from(await res.arrayBuffer());
  // Write-if-missing: double-check in case of concurrent download
  try {
    await fs.access(dest);
    return dest;
  } catch {}
  await fs.writeFile(dest, buf);
  return dest;
}

export async function downloadArtworkHandler(payload: JobPayload["download_artwork"]): Promise<void> {
  const db = getDb();

  if (payload.mediaType === "movie") {
    const [artwork] = await db
      .select()
      .from(movieArtwork)
      .where(eq(movieArtwork.id, payload.artworkId));

    if (!artwork?.sourceUrl) return;

    const filePath = await downloadToCache(artwork.sourceUrl);
    await db.update(movieArtwork).set({ filePath }).where(eq(movieArtwork.id, artwork.id));
  } else if (payload.mediaType === "show") {
    const [artwork] = await db
      .select()
      .from(showArtwork)
      .where(eq(showArtwork.id, payload.artworkId));

    if (!artwork?.sourceUrl) return;
    const filePath = await downloadToCache(artwork.sourceUrl);
    await db.update(showArtwork).set({ filePath }).where(eq(showArtwork.id, artwork.id));
  }
}

// Fetch all artwork from all configured providers for a movie and store references (not downloaded yet)
export async function fetchMovieArtworkRefs(movieId: string): Promise<ArtworkResult[]> {
  const db = getDb();
  const [movie] = await db
    .select({ tmdbId: movies.tmdbId })
    .from(movies)
    .where(eq(movies.id, movieId));

  if (!movie?.tmdbId) return [];

  const results: ArtworkResult[] = [];

  if (tmdbScraper.isAvailable()) {
    const tmdbArt = await tmdbScraper.getMovieArtwork(String(movie.tmdbId));
    results.push(...tmdbArt);
  }

  if (fanartScraper.isAvailable()) {
    const fanartArt = await fanartScraper.getMovieArtwork(String(movie.tmdbId));
    results.push(...fanartArt);
  }

  if (results.length === 0) return results;

  // Fetch all already-known source URLs for this movie in one query, then filter in memory
  const allUrls = results.map((r) => r.url);
  const existing = await db
    .select({ sourceUrl: movieArtwork.sourceUrl })
    .from(movieArtwork)
    .where(inArray(movieArtwork.sourceUrl, allUrls));
  const knownUrls = new Set(existing.map((e) => e.sourceUrl));

  const toInsert = results.filter((r) => !knownUrls.has(r.url));
  if (toInsert.length) {
    await db.insert(movieArtwork).values(
      toInsert.map((art) => ({
        id: randomUUID(),
        movieId,
        type: art.type,
        sourceUrl: art.url,
        width: art.width ?? null,
        height: art.height ?? null,
        language: art.language ?? null,
        active: false,
        source: art.source,
      }))
    );
  }

  return results;
}

export async function fetchShowArtworkRefs(showId: string): Promise<ArtworkResult[]> {
  const db = getDb();
  const [show] = await db
    .select({ tvdbId: shows.tvdbId, tmdbId: shows.tmdbId })
    .from(shows)
    .where(eq(shows.id, showId));

  if (!show) return [];

  const results: ArtworkResult[] = [];

  if (show.tvdbId && tvdbScraper.isAvailable()) {
    const art = await tvdbScraper.getShowArtwork(String(show.tvdbId));
    results.push(...art);
  }

  if (show.tvdbId && fanartScraper.isAvailable()) {
    const art = await fanartScraper.getTvArtwork(String(show.tvdbId));
    results.push(...art);
  }

  if (results.length === 0) return results;

  const allUrls = results.map((r) => r.url);
  const existing = await db
    .select({ sourceUrl: showArtwork.sourceUrl })
    .from(showArtwork)
    .where(inArray(showArtwork.sourceUrl, allUrls));
  const knownUrls = new Set(existing.map((e) => e.sourceUrl));

  const toInsert = results.filter((r) => !knownUrls.has(r.url));
  if (toInsert.length) {
    await db.insert(showArtwork).values(
      toInsert.map((art) => ({
        id: randomUUID(),
        showId,
        type: art.type,
        sourceUrl: art.url,
        width: art.width ?? null,
        height: art.height ?? null,
        language: art.language ?? null,
        active: false,
        source: art.source,
      }))
    );
  }

  return results;
}
