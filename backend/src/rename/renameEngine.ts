/**
 * Radarr/Sonarr-compatible file rename engine.
 *
 * Supports all standard Radarr movie tokens and Sonarr episode tokens:
 *   {Movie Title}              {Series Title}
 *   {Movie CleanTitle}         {Series CleanTitle}
 *   {Movie TitleThe}           {Series TitleThe}
 *   {Movie CleanTitleThe}      {Series TitleTheYear}
 *   {Movie OriginalTitle}      {Series Year}
 *   {Movie Certification}      {Series TvdbId} {Series TmdbId}
 *   {Movie Collection}         {Season} {Season:00}
 *   {Release Year}             {Episode} {Episode:00}
 *   {ImdbId} {TmdbId}          {Absolute} {Absolute:000}
 *   {Quality Full}             {Episode Title}
 *   {Quality Title}            {Episode CleanTitle}
 *   {Release Group}            {Air Date}
 *   {Edition Tags}             {MediaInfo ...}
 *   {MediaInfo VideoCodec}     {Release Group}
 *   {MediaInfo VideoBitDepth}
 *   {MediaInfo VideoDynamicRange}
 *   {MediaInfo VideoDynamicRangeType}
 *   {MediaInfo AudioCodec}
 *   {MediaInfo AudioChannels}
 *   {MediaInfo AudioLanguages}
 *   {MediaInfo AudioLanguagesAll}
 *   {MediaInfo SubtitleLanguages}
 *   {MediaInfo SubtitleLanguagesAll}
 *   {MediaInfo Simple}
 *   {MediaInfo Full}
 *   {Original Title}
 *   {Original Filename}
 *
 * Token format: {Token Name} or {Token Name:N} for zero-padding numbers.
 * Case modifier: {Token Name:upper} or {Token Name:lower}
 */
import path from "path";
import type { VideoStream, AudioStream, SubtitleStream } from "../scanner/mediaInfo.js";

// ─── String utilities ─────────────────────────────────────────────────────────

const ILLEGAL_CHARS = /[<>:"/\\|?*\x00-\x1F]/g;

function sanitizeSegment(s: string): string {
  return s.replace(ILLEGAL_CHARS, " ").replace(/\s{2,}/g, " ").trim();
}

/** "The Dark Knight" → "Dark Knight, The" */
function moveArticleToEnd(title: string): string {
  return title.replace(/^(The|A|An)\s+(.+)$/i, (_, art, rest) => `${rest}, ${art}`);
}

/** Remove characters illegal in filenames and collapse whitespace */
function cleanTitle(title: string): string {
  return title.replace(ILLEGAL_CHARS, "").replace(/\s{2,}/g, " ").trim();
}

function firstChar(title: string): string {
  const m = title.match(/[A-Za-z0-9]/);
  return m ? m[0]!.toUpperCase() : "#";
}

/**
 * Detect quality/source from filename patterns.
 * Returns e.g. "Bluray-2160p", "WEB-DL-1080p", "HDTV-720p"
 */
function detectQuality(filename: string): { title: string; full: string } {
  const f = filename.toLowerCase();

  let source = "";
  if (/\b(bluray|blu-ray|bdrip|bdrip)\b/.test(f)) source = "Bluray";
  else if (/\bremux\b/.test(f)) source = "Remux";
  else if (/\bweb-dl\b/.test(f)) source = "WEB-DL";
  else if (/\bwebrip\b/.test(f)) source = "WEBRip";
  else if (/\bhdtv\b/.test(f)) source = "HDTV";
  else if (/\bdvdrip\b/.test(f)) source = "DVDRip";
  else if (/\bdvd\b/.test(f)) source = "DVD";

  let res = "";
  if (/\b(2160p|4k)\b/.test(f)) res = "2160p";
  else if (/\b1080p\b/.test(f)) res = "1080p";
  else if (/\b720p\b/.test(f)) res = "720p";
  else if (/\b480p\b/.test(f)) res = "480p";

  const title = [source, res].filter(Boolean).join("-") || "Unknown";
  const full = title;
  return { title, full };
}

/**
 * Extract release group from filename.
 * Looks for: "-GROUP" at end, or "[GROUP]" bracket pattern.
 */
function extractReleaseGroup(filename: string): string {
  const base = path.basename(filename, path.extname(filename));
  // "-GROUP" at end (common release naming)
  const dash = base.match(/-([A-Za-z0-9]+)$/);
  if (dash?.[1]) return dash[1];
  // "[GROUP]" brackets
  const bracket = base.match(/\[([A-Za-z0-9]+)\]$/);
  if (bracket?.[1]) return bracket[1];
  return "";
}

/**
 * Detect edition tags: "Director's Cut", "Extended", "Theatrical", "Remastered", etc.
 */
function detectEdition(filename: string): string {
  const f = filename.toLowerCase();
  const editions: string[] = [];
  if (/director'?s.?cut/i.test(f)) editions.push("Director's Cut");
  else if (/extended/i.test(f)) editions.push("Extended");
  else if (/theatrical/i.test(f)) editions.push("Theatrical");
  if (/remaster(ed)?/i.test(f)) editions.push("Remastered");
  if (/unrated/i.test(f)) editions.push("Unrated");
  if (/\b3d\b/i.test(f)) editions.push("3D");
  if (/imax/i.test(f)) editions.push("IMAX");
  return editions.join(" ");
}

// ─── MediaInfo helpers ────────────────────────────────────────────────────────

interface StreamsData {
  video?: VideoStream[];
  audio?: AudioStream[];
  subtitles?: SubtitleStream[];
}

function videoCodecShort(codec: string | undefined): string {
  if (!codec) return "";
  const map: Record<string, string> = {
    HEVC: "x265", "H.265": "x265", AVC: "x264", "H.264": "x264",
    AV1: "AV1", VP9: "VP9", "MPEG-2 Video": "MPEG2",
    "VC-1": "VC1",
  };
  return map[codec] ?? codec;
}

function audioCodecShort(codec: string | undefined): string {
  if (!codec) return "";
  const map: Record<string, string> = {
    "MLP FBA": "TrueHD Atmos", "MLP FBA 16-ch": "TrueHD Atmos",
    "MLP": "TrueHD", "AC-3": "DD", "E-AC-3": "DD+", "E-AC-3 JOC": "DD+ Atmos",
    "DTS-HD MA": "DTS-MA", "DTS-HD": "DTS-MA", "DTS": "DTS",
    "FLAC": "FLAC", "AAC": "AAC", "PCM": "PCM",
  };
  return map[codec] ?? codec;
}

function channelLabel(n: number | undefined): string {
  if (!n) return "";
  const map: Record<number, string> = { 1: "1.0", 2: "2.0", 6: "5.1", 7: "6.1", 8: "7.1", 10: "7.1.2", 12: "7.1.4", 16: "7.1.4" };
  return map[n] ?? String(n);
}

function langCode(s: AudioStream | SubtitleStream): string {
  return s.language ?? s.languageName?.slice(0, 3).toLowerCase() ?? "und";
}

function buildMediaInfoVars(
  info: { videoCodec?: string; audioCodec?: string; audioChannels?: number; hdrFormat?: string; streamsJson?: StreamsData | null } | undefined
): Record<string, string> {
  if (!info) return {};

  const streams = info.streamsJson ?? {};
  const vid = (streams.video ?? [])[0];
  const audios = streams.audio ?? [];
  const subs = streams.subtitles ?? [];

  const primaryVid = vid?.codec ?? info.videoCodec ?? "";
  const primaryAud = audios[0];
  const hdr = vid?.hdrFormat ?? info.hdrFormat ?? "";

  // Audio languages — deduplicated
  const audLangs = [...new Set(audios.map(langCode).filter((l) => l !== "und"))];
  const audLangsAll = [...new Set(audios.map(langCode))];
  const subLangs = [...new Set(subs.map(langCode).filter((l) => l !== "und"))];
  const subLangsAll = [...new Set(subs.map(langCode))];

  const bitDepth = vid?.bitDepth ? String(vid.bitDepth) : "";
  const audioShort = audioCodecShort(primaryAud?.codec ?? info.audioCodec ?? "");
  const channels = channelLabel(primaryAud?.channels ?? info.audioChannels);
  const videoShort = videoCodecShort(primaryVid);

  // Simple: "x265 TrueHD" | Full: "x265 TrueHD Atmos 7.1"
  const simple = [videoShort, audioShort].filter(Boolean).join(" ");
  const full = [videoShort, audioShort, channels].filter(Boolean).join(" ");

  // HDR formats
  const hdrSimple = hdr ? (hdr.includes("Dolby Vision") ? "DV" : hdr.includes("HDR10+") ? "HDR10+" : "HDR") : "";
  const hdrFull = hdr.split(" / ")[0] ?? "";

  return {
    "MediaInfo Video": videoShort,
    "MediaInfo VideoCodec": videoShort,
    "MediaInfo VideoBitDepth": bitDepth,
    "MediaInfo VideoResolution": vid ? `${vid.width}x${vid.height}` : info.videoCodec ?? "",
    "MediaInfo VideoDynamicRange": hdrSimple,
    "MediaInfo VideoDynamicRangeType": hdrFull,
    "MediaInfo Audio": audioShort,
    "MediaInfo AudioCodec": audioShort,
    "MediaInfo AudioChannels": channels,
    "MediaInfo AudioLanguages": audLangs.join("+"),
    "MediaInfo AudioLanguagesAll": audLangsAll.join("+"),
    "MediaInfo SubtitleLanguages": subLangs.join("+"),
    "MediaInfo SubtitleLanguagesAll": subLangsAll.join("+"),
    "MediaInfo Simple": simple,
    "MediaInfo Full": full,
    "MediaInfo 3D": "", // not parsed
  };
}

// ─── Token expansion ──────────────────────────────────────────────────────────

function applyModifier(value: string, mod: string): string {
  if (/^\d+$/.test(mod)) return value.padStart(parseInt(mod, 10), "0");
  if (mod.toLowerCase() === "upper") return value.toUpperCase();
  if (mod.toLowerCase() === "lower") return value.toLowerCase();
  return value;
}

export function expandTemplate(template: string, vars: Record<string, string>): string {
  // Match {Token Name} or {Token Name:modifier}
  return template.replace(/\{([^}:]+)(?::([^}]+))?\}/g, (match, key: string, mod?: string) => {
    const val = vars[key.trim()];
    if (val === undefined || val === null || val === "") return "";
    return mod ? applyModifier(val, mod) : val;
  });
}

// ─── Variable builders ────────────────────────────────────────────────────────

export interface MovieRenameContext {
  title: string;
  originalTitle?: string | null;
  sortTitle?: string | null;
  year?: number | null;
  certification?: string | null;
  tmdbId?: number | null;
  imdbId?: string | null;
  collectionName?: string | null;
  filePath: string;
  mediaInfo?: {
    videoCodec?: string;
    audioCodec?: string;
    audioChannels?: number;
    hdrFormat?: string;
    streamsJson?: StreamsData | null;
  } | null;
}

export interface EpisodeRenameContext {
  showTitle: string;
  showYear?: number | null;
  showTvdbId?: number | null;
  showTmdbId?: number | null;
  showImdbId?: string | null;
  episodeTitle?: string | null;
  seasonNumber: number;
  episodeNumber: number;
  absoluteNumber?: number | null;
  airDate?: string | null;
  filePath: string;
  mediaInfo?: {
    videoCodec?: string;
    audioCodec?: string;
    audioChannels?: number;
    hdrFormat?: string;
    streamsJson?: StreamsData | null;
  } | null;
}

export function buildMovieVars(ctx: MovieRenameContext): Record<string, string> {
  const filename = path.basename(ctx.filePath);
  const ext = path.extname(ctx.filePath).slice(1);
  const quality = detectQuality(filename);
  const releaseGroup = extractReleaseGroup(filename);
  const edition = detectEdition(filename);
  const cleanT = cleanTitle(ctx.title);
  const theT = moveArticleToEnd(ctx.title);
  const origT = ctx.originalTitle ?? ctx.title;

  return {
    // Movie title variants
    "Movie Title": ctx.title,
    "Movie CleanTitle": cleanT,
    "Movie TitleThe": theT,
    "Movie CleanTitleThe": cleanTitle(theT),
    "Movie TitleFirstCharacter": firstChar(ctx.title),
    "Movie OriginalTitle": origT,
    "Movie CleanOriginalTitle": cleanTitle(origT),
    "Movie Certification": ctx.certification ?? "",
    "Movie Collection": ctx.collectionName ?? "",
    "Movie CollectionThe": ctx.collectionName ? moveArticleToEnd(ctx.collectionName) : "",
    "Movie CleanCollectionThe": ctx.collectionName ? cleanTitle(moveArticleToEnd(ctx.collectionName)) : "",
    // Release
    "Release Year": String(ctx.year ?? ""),
    "Release Group": releaseGroup,
    "Edition Tags": edition,
    // IDs
    "ImdbId": ctx.imdbId ?? "",
    "TmdbId": String(ctx.tmdbId ?? ""),
    // Quality
    "Quality Full": quality.full,
    "Quality Title": quality.title,
    "Quality Proper": "",
    "Quality Real": "",
    // Original file
    "Original Title": path.basename(ctx.filePath, `.${ext}`),
    "Original Filename": filename,
    // Extension (not a Radarr token but useful)
    "ext": ext,
    // MediaInfo
    ...buildMediaInfoVars(ctx.mediaInfo ?? undefined),
  };
}

export function buildEpisodeVars(ctx: EpisodeRenameContext): Record<string, string> {
  const filename = path.basename(ctx.filePath);
  const ext = path.extname(ctx.filePath).slice(1);
  const quality = detectQuality(filename);
  const releaseGroup = extractReleaseGroup(filename);
  const cleanShow = cleanTitle(ctx.showTitle);
  const theShow = moveArticleToEnd(ctx.showTitle);
  const cleanTitle_ = cleanTitle(ctx.episodeTitle ?? "");
  const airDate = ctx.airDate?.slice(0, 10) ?? "";
  const airYear = airDate.slice(0, 4);

  const padSeason = String(ctx.seasonNumber).padStart(2, "0");
  const padEpisode = String(ctx.episodeNumber).padStart(2, "0");
  const padAbsolute = String(ctx.absoluteNumber ?? ctx.episodeNumber).padStart(3, "0");

  return {
    // Series
    "Series Title": ctx.showTitle,
    "Series CleanTitle": cleanShow,
    "Series TitleThe": theShow,
    "Series CleanTitleThe": cleanTitle(theShow),
    "Series TitleYear": ctx.showYear ? `${ctx.showTitle} (${ctx.showYear})` : ctx.showTitle,
    "Series CleanTitleYear": ctx.showYear ? `${cleanShow} (${ctx.showYear})` : cleanShow,
    "Series TitleWithoutYear": ctx.showTitle,
    "Series CleanTitleWithoutYear": cleanShow,
    "Series TitleTheYear": ctx.showYear ? `${theShow} (${ctx.showYear})` : theShow,
    "Series CleanTitleTheYear": ctx.showYear ? `${cleanTitle(theShow)} (${ctx.showYear})` : cleanTitle(theShow),
    "Series TitleTheWithoutYear": theShow,
    "Series CleanTitleTheWithoutYear": cleanTitle(theShow),
    "Series TitleFirstCharacter": firstChar(ctx.showTitle),
    "Series Year": String(ctx.showYear ?? ""),
    // IDs
    "Series TvdbId": String(ctx.showTvdbId ?? ""),
    "Series TmdbId": String(ctx.showTmdbId ?? ""),
    "TvdbId": String(ctx.showTvdbId ?? ""),
    "TmdbId": String(ctx.showTmdbId ?? ""),
    "ImdbId": ctx.showImdbId ?? "",
    // Numbers
    "Season": String(ctx.seasonNumber),
    "Episode": String(ctx.episodeNumber),
    "Absolute": String(ctx.absoluteNumber ?? ctx.episodeNumber),
    // Episode info
    "Episode Title": ctx.episodeTitle ?? "",
    "Episode CleanTitle": cleanTitle_,
    "Air Date": airDate,
    "Air Year": airYear,
    // Quality
    "Quality Full": quality.full,
    "Quality Title": quality.title,
    "Quality Proper": "",
    "Quality Real": "",
    // Release
    "Release Group": releaseGroup,
    // Original file
    "Original Title": path.basename(ctx.filePath, `.${ext}`),
    "Original Filename": filename,
    // Extension
    "ext": ext,
    // MediaInfo
    ...buildMediaInfoVars(ctx.mediaInfo ?? undefined),
  };
}

// ─── Path building ────────────────────────────────────────────────────────────

export function computeNewPath(baseDir: string, template: string, vars: Record<string, string>): string {
  const expanded = expandTemplate(template, vars);
  const segments = expanded.split("/").map(sanitizeSegment).filter(Boolean);
  if (segments.length === 0) throw new Error("Template expanded to empty path");
  return path.join(baseDir, ...segments);
}

// ─── Validation ───────────────────────────────────────────────────────────────

export const MOVIE_TOKENS = [
  "Movie Title", "Movie CleanTitle", "Movie TitleThe", "Movie CleanTitleThe",
  "Movie TitleFirstCharacter", "Movie OriginalTitle", "Movie CleanOriginalTitle",
  "Movie Certification", "Movie Collection", "Movie CollectionThe", "Movie CleanCollectionThe",
  "Release Year", "Release Group", "Edition Tags",
  "ImdbId", "TmdbId",
  "Quality Full", "Quality Title", "Quality Proper", "Quality Real",
  "Original Title", "Original Filename",
  "MediaInfo Video", "MediaInfo VideoCodec", "MediaInfo VideoBitDepth",
  "MediaInfo VideoResolution", "MediaInfo VideoDynamicRange", "MediaInfo VideoDynamicRangeType",
  "MediaInfo Audio", "MediaInfo AudioCodec", "MediaInfo AudioChannels",
  "MediaInfo AudioLanguages", "MediaInfo AudioLanguagesAll",
  "MediaInfo SubtitleLanguages", "MediaInfo SubtitleLanguagesAll",
  "MediaInfo Simple", "MediaInfo Full", "MediaInfo 3D",
  "ext",
];

export const EPISODE_TOKENS = [
  "Series Title", "Series CleanTitle", "Series TitleThe", "Series CleanTitleThe",
  "Series TitleYear", "Series CleanTitleYear", "Series TitleWithoutYear", "Series CleanTitleWithoutYear",
  "Series TitleTheYear", "Series CleanTitleTheYear", "Series TitleTheWithoutYear", "Series CleanTitleTheWithoutYear",
  "Series TitleFirstCharacter", "Series Year",
  "Series TvdbId", "Series TmdbId", "TvdbId", "TmdbId", "ImdbId",
  "Season", "Episode", "Absolute",
  "Episode Title", "Episode CleanTitle", "Air Date", "Air Year",
  "Quality Full", "Quality Title", "Quality Proper", "Quality Real",
  "Release Group", "Original Title", "Original Filename",
  "MediaInfo Video", "MediaInfo VideoCodec", "MediaInfo VideoBitDepth",
  "MediaInfo VideoResolution", "MediaInfo VideoDynamicRange", "MediaInfo VideoDynamicRangeType",
  "MediaInfo Audio", "MediaInfo AudioCodec", "MediaInfo AudioChannels",
  "MediaInfo AudioLanguages", "MediaInfo AudioLanguagesAll",
  "MediaInfo SubtitleLanguages", "MediaInfo SubtitleLanguagesAll",
  "MediaInfo Simple", "MediaInfo Full", "MediaInfo 3D",
  "ext",
];

export function validateTemplate(template: string, type: "movie" | "episode"): string[] {
  const errors: string[] = [];
  if (!template.trim()) { errors.push("Template cannot be empty"); return errors; }

  const known = new Set(type === "movie" ? MOVIE_TOKENS : EPISODE_TOKENS);
  const re = /\{([^}:]+)(?::[^}]*)?\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(template)) !== null) {
    const key = m[1]!.trim();
    if (!known.has(key)) errors.push(`Unknown token: {${key}}`);
  }
  if (!template.includes("{ext}") && !path.extname(template)) {
    errors.push("Template should end with {ext} or a static extension");
  }
  return errors;
}

export const DEFAULT_MOVIE_TEMPLATE = "{Movie Title} ({Release Year})/{Movie Title} ({Release Year}) {Quality Full}.{ext}";
export const DEFAULT_EPISODE_TEMPLATE = "{Series Title}/Season {Season:00}/{Series Title} - S{Season:00}E{Episode:00} - {Episode Title}.{ext}";
