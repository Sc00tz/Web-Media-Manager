/**
 * Detect and import local artwork files that follow Kodi/Jellyfin naming conventions.
 * Never downloads or overwrites — only registers files that already exist on disk.
 */
import fs from "fs/promises";
import path from "path";
import type { ArtworkType } from "@mediamanager/types";

export interface LocalArtworkFile {
  type: ArtworkType;
  filePath: string;
}

// Kodi/Jellyfin standard artwork filename patterns → artwork type
const MOVIE_ARTWORK_PATTERNS: Array<{ pattern: RegExp | string; type: ArtworkType }> = [
  { pattern: "poster.jpg",      type: "poster" },
  { pattern: "poster.png",      type: "poster" },
  { pattern: "poster.webp",     type: "poster" },
  { pattern: "folder.jpg",      type: "poster" },
  { pattern: "folder.png",      type: "poster" },
  { pattern: "fanart.jpg",      type: "backdrop" },
  { pattern: "fanart.png",      type: "backdrop" },
  { pattern: "backdrop.jpg",    type: "backdrop" },
  { pattern: "backdrop.png",    type: "backdrop" },
  { pattern: "background.jpg",  type: "backdrop" },
  { pattern: "landscape.jpg",   type: "banner" },
  { pattern: "landscape.png",   type: "banner" },
  { pattern: "banner.jpg",      type: "banner" },
  { pattern: "banner.png",      type: "banner" },
  { pattern: "logo.png",        type: "logo" },
  { pattern: "logo.jpg",        type: "logo" },
  { pattern: "clearlogo.png",   type: "logo" },
  { pattern: "clearart.png",    type: "clearart" },
  { pattern: "clearart.jpg",    type: "clearart" },
  { pattern: "disc.png",        type: "disc" },
  { pattern: "disc.jpg",        type: "disc" },
  { pattern: "discart.png",     type: "disc" },
  { pattern: "thumb.jpg",       type: "thumb" },
  { pattern: "thumb.png",       type: "thumb" },
  // <title>-poster.jpg etc (files that share the movie filename prefix)
  { pattern: /-poster\.(jpg|png|webp)$/i, type: "poster" },
  { pattern: /-fanart\d*\.(jpg|png)$/i,   type: "backdrop" },
  { pattern: /-landscape\.(jpg|png)$/i,   type: "banner" },
  { pattern: /-logo\.(png|jpg)$/i,        type: "logo" },
  { pattern: /-clearart\.(png|jpg)$/i,    type: "clearart" },
  { pattern: /-disc\.(png|jpg)$/i,        type: "disc" },
  { pattern: /-thumb\.(jpg|png)$/i,       type: "thumb" },
];

const SHOW_ARTWORK_PATTERNS = MOVIE_ARTWORK_PATTERNS;

// Season poster patterns: season01-poster.jpg, season-specials-poster.jpg
const SEASON_POSTER_RE = /^season(\d{2}|specials)-poster\.(jpg|png|webp)$/i;

export interface SeasonPosterFile {
  seasonNumber: number;
  filePath: string;
}

export function detectSeasonPosters(showFolderPath: string, files: string[]): SeasonPosterFile[] {
  const results: SeasonPosterFile[] = [];
  for (const filename of files) {
    if (filename.startsWith("._") || filename.startsWith(".")) continue;
    const m = filename.match(SEASON_POSTER_RE);
    if (!m) continue;
    const seasonNumber = m[1]!.toLowerCase() === "specials" ? 0 : parseInt(m[1]!, 10);
    results.push({ seasonNumber, filePath: path.join(showFolderPath, filename) });
  }
  return results;
}

function matches(filename: string, pattern: RegExp | string): boolean {
  if (typeof pattern === "string") return filename.toLowerCase() === pattern.toLowerCase();
  return pattern.test(filename);
}

async function exists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

export async function detectMovieArtwork(movieFolderPath: string): Promise<LocalArtworkFile[]> {
  const results: LocalArtworkFile[] = [];
  let files: string[];
  try {
    files = await fs.readdir(movieFolderPath);
  } catch {
    return results;
  }

  // Filter out macOS resource forks and system files before matching
  const cleaned = files.filter((f) => !f.startsWith("._") && !f.startsWith("."));

  const seen = new Set<ArtworkType>();

  for (const filename of cleaned) {
    for (const { pattern, type } of MOVIE_ARTWORK_PATTERNS) {
      if (seen.has(type)) continue;
      if (matches(filename, pattern)) {
        results.push({ type, filePath: path.join(movieFolderPath, filename) });
        seen.add(type);
        break;
      }
    }
  }

  return results;
}

export async function detectShowArtwork(showFolderPath: string): Promise<LocalArtworkFile[]> {
  const results: LocalArtworkFile[] = [];
  let files: string[];
  try {
    files = await fs.readdir(showFolderPath);
  } catch {
    return results;
  }

  const cleaned = files.filter((f) => !f.startsWith("._") && !f.startsWith("."));
  const seen = new Set<ArtworkType>();

  for (const filename of cleaned) {
    // Season posters
    const seasonMatch = filename.match(SEASON_POSTER_RE);
    if (seasonMatch) {
      // Store these separately — the caller handles them per-season
      results.push({ type: "season_poster", filePath: path.join(showFolderPath, filename) });
      continue;
    }

    for (const { pattern, type } of SHOW_ARTWORK_PATTERNS) {
      if (seen.has(type)) continue;
      if (matches(filename, pattern)) {
        results.push({ type, filePath: path.join(showFolderPath, filename) });
        seen.add(type);
        break;
      }
    }
  }

  return results;
}

// Detect episode-level artwork: <episode-filename>-thumb.jpg
export async function detectEpisodeArtwork(episodeFilePath: string): Promise<LocalArtworkFile[]> {
  const dir = path.dirname(episodeFilePath);
  const base = path.basename(episodeFilePath, path.extname(episodeFilePath));
  const results: LocalArtworkFile[] = [];

  for (const ext of [".jpg", ".png", ".webp"]) {
    const thumbPath = path.join(dir, `${base}-thumb${ext}`);
    if (await exists(thumbPath)) {
      results.push({ type: "episode_thumb", filePath: thumbPath });
      break;
    }
    // Some tools use just the base name + ext
    const simplePath = path.join(dir, `${base}${ext}`);
    if (await exists(simplePath)) {
      results.push({ type: "episode_thumb", filePath: simplePath });
      break;
    }
  }

  return results;
}
