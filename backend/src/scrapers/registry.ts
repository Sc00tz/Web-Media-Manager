/**
 * Scraper registry — single source of truth for all active scrapers.
 *
 * Built-in scrapers are registered at startup. Custom plugin scrapers can be
 * registered at runtime by loading a JS module that exports a default object
 * conforming to IMovieScraper, ITvScraper, or IArtworkScraper.
 *
 * Plugin contract (custom scraper module must export):
 *   export default {
 *     provider: "my-scraper",      // unique string ID
 *     priority: 5,                 // lower = higher priority
 *     isAvailable(): boolean,
 *     // implement at least one of: searchMovies, searchShows, getMovieArtwork
 *   }
 */
import type { IMovieScraper, ITvScraper, IArtworkScraper, ISubtitleScraper } from "@mediamanager/types";
import { tmdbScraper } from "./tmdb.js";
import { tvdbScraper } from "./tvdb.js";
import { fanartScraper } from "./fanart.js";
import { openSubtitlesScraper } from "./opensubtitles.js";
import { subDlScraper } from "./subdl.js";

type AnyScraper = IMovieScraper | ITvScraper | IArtworkScraper | ISubtitleScraper;

interface ScraperEntry {
  scraper: AnyScraper;
  type: "movie" | "tv" | "artwork" | "subtitle";
  isPlugin: boolean;
}

const registry = new Map<string, ScraperEntry>();

function register(scraper: AnyScraper, type: ScraperEntry["type"], isPlugin = false) {
  registry.set(scraper.provider, { scraper, type, isPlugin });
}

// Register built-ins
register(tmdbScraper, "movie");
register(tvdbScraper, "tv");
register(fanartScraper, "artwork");
register(openSubtitlesScraper, "subtitle");
register(subDlScraper, "subtitle");

export function getMovieScrapers(): IMovieScraper[] {
  return [...registry.values()]
    .filter((e) => e.type === "movie" && e.scraper.isAvailable())
    .sort((a, b) => a.scraper.priority - b.scraper.priority)
    .map((e) => e.scraper as IMovieScraper);
}

export function getTvScrapers(): ITvScraper[] {
  return [...registry.values()]
    .filter((e) => e.type === "tv" && e.scraper.isAvailable())
    .sort((a, b) => a.scraper.priority - b.scraper.priority)
    .map((e) => e.scraper as ITvScraper);
}

export function getArtworkScrapers(): IArtworkScraper[] {
  return [...registry.values()]
    .filter((e) => e.type === "artwork" && e.scraper.isAvailable())
    .sort((a, b) => a.scraper.priority - b.scraper.priority)
    .map((e) => e.scraper as IArtworkScraper);
}

export function listAll(): Array<{
  provider: string;
  type: "movie" | "tv" | "artwork" | "subtitle";
  available: boolean;
  priority: number;
  isPlugin: boolean;
}> {
  return [...registry.values()].map((e) => ({
    provider: e.scraper.provider,
    type: e.type,
    available: e.scraper.isAvailable(),
    priority: e.scraper.priority,
    isPlugin: e.isPlugin,
  }));
}

export async function loadPlugin(modulePath: string): Promise<{ provider: string }> {
  let mod: { default?: AnyScraper };
  try {
    mod = await import(modulePath) as { default?: AnyScraper };
  } catch (err) {
    throw new Error(`Failed to load plugin from ${modulePath}: ${String(err)}`);
  }

  const scraper = mod.default;
  if (!scraper || typeof scraper.provider !== "string" || typeof scraper.isAvailable !== "function") {
    throw new Error(`Plugin at ${modulePath} does not export a valid scraper object`);
  }

  // Detect type from implemented methods
  let type: ScraperEntry["type"] = "movie";
  if ("searchShows" in scraper) type = "tv";
  else if ("getMovieArtwork" in scraper && !("searchMovies" in scraper)) type = "artwork";

  register(scraper, type, true);
  return { provider: scraper.provider };
}

export function unloadPlugin(provider: string): void {
  const entry = registry.get(provider);
  if (!entry) throw new Error(`Scraper not found: ${provider}`);
  if (!entry.isPlugin) throw new Error(`Cannot unload built-in scraper: ${provider}`);
  registry.delete(provider);
}
