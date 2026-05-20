/**
 * Kodi-compatible NFO generator.
 * Spec reference: https://kodi.wiki/view/NFO_files/Movies
 *                 https://kodi.wiki/view/NFO_files/TV_shows
 *                 https://kodi.wiki/view/NFO_files/Episodes
 *
 * We produce minimal XML that Kodi/Jellyfin/Emby can parse.
 * All values are XML-escaped. Missing optional fields are omitted.
 */
import fs from "fs/promises";
import path from "path";

function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function tag(name: string, value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  return `  <${name}>${esc(String(value))}</${name}>`;
}

function tags(name: string, values: string[]): string {
  return values.map((v) => tag(name, v)).join("\n");
}

export interface MovieNfoData {
  title: string;
  originalTitle?: string;
  sortTitle?: string;
  year?: number;
  releaseDate?: string;
  plot?: string;
  runtime?: number;
  certification?: string;
  tmdbId?: number;
  imdbId?: string;
  collectionName?: string;
  genres: string[];
  studios: string[];
  tags: string[];
  ratings: Array<{ source: string; value: number; votes?: number }>;
  cast: Array<{ name: string; character?: string; order?: number; profilePath?: string }>;
  directors: string[];
}

export interface ShowNfoData {
  title: string;
  originalTitle?: string;
  sortTitle?: string;
  firstAirDate?: string;
  plot?: string;
  status?: string;
  certification?: string;
  tvdbId?: number;
  tmdbId?: number;
  imdbId?: string;
  genres: string[];
  networks: string[];
  ratings: Array<{ source: string; value: number; votes?: number }>;
  cast: Array<{ name: string; character?: string; order?: number }>;
}

export interface EpisodeNfoData {
  title?: string;
  plot?: string;
  season: number;
  episode: number;
  airDate?: string;
  runtime?: number;
  tvdbId?: number;
  tmdbId?: number;
  showTitle?: string;
  ratings: Array<{ source: string; value: number; votes?: number }>;
}

function ratingsBlock(ratings: Array<{ source: string; value: number; votes?: number }>): string {
  if (!ratings.length) return "";
  const inner = ratings
    .map(
      (r) =>
        `    <rating name="${esc(r.source)}" max="10" default="${r.source === "tmdb" ? "true" : "false"}">\n      <value>${r.value.toFixed(1)}</value>\n${r.votes ? `      <votes>${r.votes}</votes>\n` : ""}    </rating>`
    )
    .join("\n");
  return `  <ratings>\n${inner}\n  </ratings>`;
}

function castBlock(cast: Array<{ name: string; character?: string; order?: number; profilePath?: string }>): string {
  return cast
    .map(
      (c) =>
        `  <actor>\n    <name>${esc(c.name)}</name>\n${c.character ? `    <role>${esc(c.character)}</role>\n` : ""}${c.order !== undefined ? `    <order>${c.order}</order>\n` : ""}${c.profilePath ? `    <thumb>${esc(c.profilePath)}</thumb>\n` : ""}  </actor>`
    )
    .join("\n");
}

export function buildMovieNfo(data: MovieNfoData): string {
  const lines = [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<movie>`,
    tag("title", data.title),
    tag("originaltitle", data.originalTitle),
    tag("sorttitle", data.sortTitle),
    tag("year", data.year),
    tag("premiered", data.releaseDate),
    tag("plot", data.plot),
    tag("runtime", data.runtime),
    tag("mpaa", data.certification),
    tag("imdbid", data.imdbId),
    data.tmdbId ? `  <uniqueid type="tmdb" default="true">${data.tmdbId}</uniqueid>` : "",
    data.imdbId ? `  <uniqueid type="imdb">${data.imdbId}</uniqueid>` : "",
    data.collectionName ? tag("set", data.collectionName) : "",
    tags("genre", data.genres),
    tags("studio", data.studios),
    tags("tag", data.tags),
    ratingsBlock(data.ratings),
    tags("director", data.directors),
    castBlock(data.cast),
    `</movie>`,
  ];

  return lines.filter(Boolean).join("\n");
}

export function buildShowNfo(data: ShowNfoData): string {
  const lines = [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<tvshow>`,
    tag("title", data.title),
    tag("originaltitle", data.originalTitle),
    tag("sorttitle", data.sortTitle),
    tag("premiered", data.firstAirDate),
    tag("plot", data.plot),
    tag("status", data.status),
    tag("mpaa", data.certification),
    data.tvdbId ? `  <uniqueid type="tvdb" default="true">${data.tvdbId}</uniqueid>` : "",
    data.tmdbId ? `  <uniqueid type="tmdb">${data.tmdbId}</uniqueid>` : "",
    data.imdbId ? `  <uniqueid type="imdb">${data.imdbId}</uniqueid>` : "",
    tags("genre", data.genres),
    tags("studio", data.networks),
    ratingsBlock(data.ratings),
    castBlock(data.cast),
    `</tvshow>`,
  ];

  return lines.filter(Boolean).join("\n");
}

export function buildEpisodeNfo(data: EpisodeNfoData): string {
  const lines = [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<episodedetails>`,
    tag("title", data.title),
    tag("showtitle", data.showTitle),
    tag("season", data.season),
    tag("episode", data.episode),
    tag("aired", data.airDate),
    tag("plot", data.plot),
    tag("runtime", data.runtime),
    data.tvdbId ? `  <uniqueid type="tvdb" default="true">${data.tvdbId}</uniqueid>` : "",
    data.tmdbId ? `  <uniqueid type="tmdb">${data.tmdbId}</uniqueid>` : "",
    ratingsBlock(data.ratings),
    `</episodedetails>`,
  ];

  return lines.filter(Boolean).join("\n");
}

async function fileExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

export async function writeMovieNfo(filePath: string, data: MovieNfoData, overwrite = false): Promise<void> {
  const nfoPath = filePath.replace(/\.[^.]+$/, ".nfo");
  // Also check for movie.nfo in the same folder
  const movieNfoPath = path.join(path.dirname(filePath), "movie.nfo");
  if (!overwrite && (await fileExists(nfoPath) || await fileExists(movieNfoPath))) return;
  await fs.writeFile(nfoPath, buildMovieNfo(data), "utf-8");
}

export async function writeShowNfo(showFolderPath: string, data: ShowNfoData, overwrite = false): Promise<void> {
  const nfoPath = path.join(showFolderPath, "tvshow.nfo");
  if (!overwrite && await fileExists(nfoPath)) return;
  await fs.writeFile(nfoPath, buildShowNfo(data), "utf-8");
}

export async function writeEpisodeNfo(filePath: string, data: EpisodeNfoData, overwrite = false): Promise<void> {
  const nfoPath = filePath.replace(/\.[^.]+$/, ".nfo");
  if (!overwrite && await fileExists(nfoPath)) return;
  await fs.writeFile(nfoPath, buildEpisodeNfo(data), "utf-8");
}
