import path from "path";

// Video container extensions that MediaInfo can process
export const VIDEO_EXTENSIONS = new Set([
  ".mkv", ".mp4", ".avi", ".mov", ".wmv", ".m4v", ".ts", ".m2ts",
  ".mpg", ".mpeg", ".flv", ".webm", ".iso", ".img",
]);

// Subtitle extensions
export const SUBTITLE_EXTENSIONS = new Set([
  ".srt", ".ass", ".ssa", ".sub", ".vtt", ".sup",
]);

// Extras keywords — files/folders matching these are classified as extras
const EXTRAS_KEYWORDS = [
  "trailer", "trailers", "sample", "extras", "bonus",
  "behindthescenes", "featurette", "interview", "scene", "short", "deleted",
];

export type FileCategory = "video" | "subtitle" | "image" | "nfo" | "other";

export interface DetectedFile {
  path: string;
  ext: string;
  category: FileCategory;
  isExtra: boolean;
}

export function categorizeFile(filePath: string): DetectedFile {
  const ext = path.extname(filePath).toLowerCase();
  const basename = path.basename(filePath, ext).toLowerCase();
  const dirParts = filePath.toLowerCase().split(path.sep);

  const isExtra = EXTRAS_KEYWORDS.some(
    (kw) => basename.includes(kw) || dirParts.some((p) => p === kw || p.startsWith(kw))
  );

  let category: FileCategory = "other";
  if (VIDEO_EXTENSIONS.has(ext)) category = "video";
  else if (SUBTITLE_EXTENSIONS.has(ext)) category = "subtitle";
  else if ([".jpg", ".jpeg", ".png", ".webp", ".tbn"].includes(ext)) category = "image";
  else if (ext === ".nfo") category = "nfo";

  return { path: filePath, ext, category, isExtra };
}

// Episode filename patterns ordered by specificity
const EPISODE_PATTERNS = [
  /[Ss](\d{1,2})[Ee](\d{1,3})/,          // S01E01
  /(\d{1,2})x(\d{1,2})/,                   // 1x01
  /[Ee]pisode[\s._-]?(\d{1,3})/i,          // Episode 01
  /[\s._-][Ee](\d{1,3})[\s._-]/,           // .E01.
  /[\s._-](\d{1,2})(\d{2})[\s._-]/,        // 101 (season+episode packed)
];

export interface EpisodeInfo {
  season: number;
  episode: number;
}

export function extractEpisodeInfo(filename: string): EpisodeInfo | null {
  const name = path.basename(filename, path.extname(filename));

  for (const pattern of EPISODE_PATTERNS) {
    const match = name.match(pattern);
    if (match) {
      if (match[1] !== undefined && match[2] !== undefined) {
        return { season: parseInt(match[1]!, 10), episode: parseInt(match[2]!, 10) };
      }
      if (match[1] !== undefined) {
        return { season: 1, episode: parseInt(match[1]!, 10) };
      }
    }
  }

  return null;
}

// Extract embedded provider IDs from folder/file names.
// Supports: [tmdbid-12345], [tvdbid-12345], [imdbid-tt1234567]
export interface EmbeddedIds {
  tmdbId?: number;
  tvdbId?: number;
  imdbId?: string;
}

export function extractEmbeddedIds(text: string): EmbeddedIds {
  const result: EmbeddedIds = {};
  const tmdb = text.match(/\[tmdbid-(\d+)\]/i);
  if (tmdb?.[1]) result.tmdbId = parseInt(tmdb[1], 10);
  const tvdb = text.match(/\[tvdbid-(\d+)\]/i);
  if (tvdb?.[1]) result.tvdbId = parseInt(tvdb[1], 10);
  const imdb = text.match(/\[imdbid-(tt\d+)\]/i);
  if (imdb?.[1]) result.imdbId = imdb[1];
  return result;
}

// Strip embedded ID tags from a name before using it as a display title
export function stripEmbeddedIds(text: string): string {
  return text.replace(/\s*\[\w+id-[^\]]+\]/gi, "").trim();
}

// Parse year from folder or filename: "Movie Title (2023)" or "Movie Title 2023"
export function extractYear(text: string): number | undefined {
  const match = text.match(/[(\s](\d{4})[)\s]?/);
  if (match?.[1]) {
    const year = parseInt(match[1], 10);
    if (year >= 1888 && year <= new Date().getFullYear() + 2) return year;
  }
  return undefined;
}

// Normalize a filename or folder name into a clean search title
export function extractTitle(filename: string): string {
  // Only strip extensions that look like real media/text file extensions (1–5 alphanumeric chars).
  // path.extname on a folder name like "Mr. Toad, The (1949)" returns ". Toad, The (1949)" which we must NOT strip.
  const ext = path.extname(filename);
  const isRealExtension = /^\.[a-zA-Z0-9]{1,5}$/.test(ext);
  let name = isRealExtension ? path.basename(filename, ext) : path.basename(filename);

  // Remove episode info
  name = name.replace(/[Ss]\d{1,2}[Ee]\d{1,3}.*/g, "");
  name = name.replace(/\d{1,2}x\d{2}.*/g, "");

  // Remove quality tags and everything after them
  name = name.replace(/\b(1080p|720p|480p|4K|2160p|UHD|HDR|BluRay|BDRip|WEB-DL|WEBRip|HDTV|x264|x265|HEVC|AAC|AC3|DTS|Remux)\b.*/gi, "");

  // Remove trailing year in parentheses: "Title (2023)" → "Title"
  name = name.replace(/\s*\(\d{4}\)\s*$/, "");

  // Replace dots/underscores/hyphens with spaces
  name = name.replace(/[._-]+/g, " ").trim();

  return name;
}

/**
 * Compute a proper sort title by moving leading articles to the end.
 * "A Bug's Life" → "bug's life, a"
 * "The Dark Knight" → "dark knight, the"
 * Matches Jellyfin/Kodi/Radarr/Sonarr convention.
 */
export function toSortTitle(title: string): string {
  const moved = title.replace(/^(The|A|An)\s+(.+)$/i, (_, art, rest) => `${rest}, ${art}`);
  return moved.toLowerCase();
}

// Return true for files that should never be treated as media (macOS resource forks, system files)
export function isSystemFile(filename: string): boolean {
  const base = path.basename(filename);
  return base.startsWith("._") || base === ".DS_Store" || base.startsWith("@");
}

export function isSeasonFolder(folderName: string): number | null {
  const m = folderName.match(/^[Ss]eason\s*(\d{1,2})$|^[Ss](\d{1,2})$/);
  if (m) return parseInt((m[1] ?? m[2])!, 10);
  return null;
}
