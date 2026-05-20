/**
 * Kodi/Jellyfin NFO parser.
 * These are XML files but we use regex extraction to avoid adding an XML dependency.
 * The format is well-defined and predictable enough for this approach.
 */
import fs from "fs/promises";
import path from "path";
import { toSortTitle } from "./fileDetector.js";

// Decode XML/HTML entities
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

// Extract the text content of the first matching XML tag
function tag(xml: string, name: string): string | undefined {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  const raw = m?.[1]?.trim();
  return raw ? decodeEntities(raw) : undefined;
}

// Extract all text contents of a repeated tag
function tags(xml: string, name: string): string[] {
  const results: string[] = [];
  const re = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const v = m[1]?.trim();
    if (v) results.push(v);
  }
  return results;
}

function num(xml: string, name: string): number | undefined {
  const v = tag(xml, name);
  if (!v) return undefined;
  const n = parseFloat(v);
  return isNaN(n) ? undefined : n;
}

function int(xml: string, name: string): number | undefined {
  const v = tag(xml, name);
  if (!v) return undefined;
  const n = parseInt(v, 10);
  return isNaN(n) ? undefined : n;
}

export interface ParsedMovieNfo {
  title?: string;
  originalTitle?: string;
  sortTitle?: string;
  year?: number;
  releaseDate?: string;
  plot?: string;
  tagline?: string;
  runtime?: number;
  certification?: string;
  tmdbId?: number;
  imdbId?: string;
  collectionName?: string;
  edition?: string;
  country?: string;
  originalLanguage?: string;
  criticRating?: number;
  rating?: number;
  ratingVotes?: number;
  genres: string[];
  studios: string[];
  directors: string[];
  writers: string[];
  countries: string[];
  cast: Array<{ name: string; character?: string; order?: number; thumb?: string }>;
}

export interface ParsedShowNfo {
  title?: string;
  originalTitle?: string;
  sortTitle?: string;
  firstAirDate?: string;
  plot?: string;
  status?: string;
  certification?: string;
  tvdbId?: number;
  tmdbId?: number;
  imdbId?: string;
  rating?: number;
  genres: string[];
  networks: string[];
  cast: Array<{ name: string; character?: string; order?: number; thumb?: string }>;
}

export interface ParsedEpisodeNfo {
  title?: string;
  plot?: string;
  season?: number;
  episode?: number;
  airDate?: string;
  runtime?: number;
  tvdbId?: number;
  tmdbId?: number;
  rating?: number;
  directors: string[];
}

function parseActors(xml: string): Array<{ name: string; character?: string; order?: number; thumb?: string }> {
  const actors: Array<{ name: string; character?: string; order?: number; thumb?: string }> = [];
  const re = /<actor>([\s\S]*?)<\/actor>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const block = m[1]!;
    const name = tag(block, "name");
    if (!name) continue;
    actors.push({
      name,
      character: tag(block, "role"),
      order: int(block, "order"),
      thumb: tag(block, "thumb"),
    });
  }
  return actors;
}

export function parseMovieNfo(xml: string): ParsedMovieNfo {
  // Handle <ratings><rating ...><value>X</value></rating></ratings> block
  const ratingsBlock = tag(xml, "ratings") ?? "";
  const ratingValue = num(ratingsBlock, "value") ?? num(xml, "rating");
  const ratingVotes = int(ratingsBlock, "votes") ?? int(xml, "votes");

  // Collection from either <set><name>X</name></set> or <collectionnumber> (used for set ID)
  const setBlock = tag(xml, "set") ?? "";
  const collectionName = tag(setBlock, "name") ?? tag(xml, "set");

  const movieTitle = tag(xml, "title");
  const movieSortTitle = tag(xml, "sorttitle") || (movieTitle ? toSortTitle(movieTitle) : undefined);

  // Edition: check <edition> tag, or detect from <releaseType> (Emby)
  const editionTag = tag(xml, "edition") ?? tag(xml, "releaseType");

  // Writers: <writer> or <credits> (Kodi/Jellyfin uses both)
  const writers = [...new Set([...tags(xml, "writer"), ...tags(xml, "credits")])];

  // Countries
  const countries = tags(xml, "country");

  // Critic rating (Rotten Tomatoes % etc.)
  const criticRating = int(xml, "criticrating");

  return {
    title: movieTitle,
    originalTitle: tag(xml, "originaltitle"),
    sortTitle: movieSortTitle,
    year: int(xml, "year"),
    releaseDate: tag(xml, "releasedate") ?? tag(xml, "premiered"),
    plot: tag(xml, "plot"),
    tagline: tag(xml, "tagline"),
    runtime: int(xml, "runtime"),
    certification: tag(xml, "mpaa") ?? tag(xml, "certification"),
    tmdbId: int(xml, "tmdbid") ?? int(xml, "tmdb"),
    imdbId: tag(xml, "imdbid") ?? tag(xml, "imdb"),
    collectionName: collectionName || undefined,
    edition: editionTag || undefined,
    country: countries[0],
    originalLanguage: tag(xml, "language") ?? tag(xml, "originallanguage"),
    criticRating: criticRating !== undefined && !isNaN(criticRating) ? criticRating : undefined,
    rating: ratingValue,
    ratingVotes,
    genres: tags(xml, "genre"),
    studios: tags(xml, "studio"),
    directors: tags(xml, "director"),
    writers,
    countries,
    cast: parseActors(xml),
  };
}

export function parseShowNfo(xml: string): ParsedShowNfo {
  const ratingsBlock = tag(xml, "ratings") ?? "";
  const ratingValue = num(ratingsBlock, "value") ?? num(xml, "rating");

  const showTitle = tag(xml, "title");
  const showSortTitle = tag(xml, "sorttitle") || (showTitle ? toSortTitle(showTitle) : undefined);

  return {
    title: showTitle,
    originalTitle: tag(xml, "originaltitle"),
    sortTitle: showSortTitle,
    firstAirDate: tag(xml, "premiered") ?? tag(xml, "releasedate"),
    plot: tag(xml, "plot"),
    status: tag(xml, "status"),
    certification: tag(xml, "mpaa") ?? tag(xml, "certification"),
    tvdbId: int(xml, "tvdbid") ?? int(xml, "tvdb"),
    tmdbId: int(xml, "tmdbid") ?? int(xml, "tmdb"),
    imdbId: tag(xml, "imdbid") ?? tag(xml, "imdb"),
    rating: ratingValue,
    genres: tags(xml, "genre"),
    networks: [...tags(xml, "studio"), ...tags(xml, "network")],
    cast: parseActors(xml),
  };
}

export function parseEpisodeNfo(xml: string): ParsedEpisodeNfo {
  const ratingsBlock = tag(xml, "ratings") ?? "";
  const ratingValue = num(ratingsBlock, "value") ?? num(xml, "rating");

  return {
    title: tag(xml, "title"),
    plot: tag(xml, "plot"),
    season: int(xml, "season"),
    episode: int(xml, "episode"),
    airDate: tag(xml, "aired") ?? tag(xml, "premiered"),
    runtime: int(xml, "runtime"),
    tvdbId: int(xml, "tvdbid") ?? int(xml, "tvdb"),
    tmdbId: int(xml, "tmdbid") ?? int(xml, "tmdb"),
    rating: ratingValue,
    directors: tags(xml, "director"),
  };
}

// Find the NFO file for a movie — prefers movie.nfo, falls back to <filename>.nfo
export async function findMovieNfo(movieFilePath: string): Promise<string | null> {
  const dir = path.dirname(movieFilePath);
  const base = path.basename(movieFilePath, path.extname(movieFilePath));

  const candidates = [
    path.join(dir, "movie.nfo"),
    path.join(dir, `${base}.nfo`),
  ];

  for (const p of candidates) {
    try {
      await fs.access(p);
      return p;
    } catch {}
  }
  return null;
}

export async function findShowNfo(showFolderPath: string): Promise<string | null> {
  const p = path.join(showFolderPath, "tvshow.nfo");
  try {
    await fs.access(p);
    return p;
  } catch {}
  return null;
}

export async function findEpisodeNfo(episodeFilePath: string): Promise<string | null> {
  const base = episodeFilePath.replace(/\.[^.]+$/, ".nfo");
  try {
    await fs.access(base);
    return base;
  } catch {}
  return null;
}

export async function readNfo(nfoPath: string): Promise<string | null> {
  try {
    const raw = await fs.readFile(nfoPath, "utf-8");
    // Strip BOM if present
    return raw.replace(/^﻿/, "");
  } catch {
    return null;
  }
}
