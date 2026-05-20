/**
 * Artwork upload endpoint.
 * Saves directly to the media folder next to the movie/show files,
 * using standard Kodi/Jellyfin/Plex naming conventions so the media
 * server picks it up automatically.
 *
 * Naming conventions:
 *   poster       → poster.jpg  (or .png/.webp from uploaded file ext)
 *   backdrop     → fanart.jpg
 *   logo         → logo.png
 *   clearart     → clearart.png
 *   disc         → disc.png
 *   banner       → landscape.jpg
 *   thumb        → thumb.jpg
 *   season_poster → season01-poster.jpg (uses season number)
 *   episode_thumb → {episode-basename}-thumb.jpg
 *
 * Overwrites existing files — user explicitly chose to replace.
 */
import type { FastifyInstance } from "fastify";
import fs from "fs/promises";
import path from "path";
import { getDb } from "../../db/index.js";
import {
  movies, shows, seasons, episodes,
  movieArtwork, showArtwork, seasonArtwork, episodeArtwork,
  artworkTypeEnum,
} from "../../db/schema.js";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";

type ArtworkTypeValue = typeof artworkTypeEnum.enumValues[number];

// Standard Kodi/Jellyfin filenames per artwork type (without extension)
const ARTWORK_BASENAME: Record<string, string> = {
  poster:        "poster",
  backdrop:      "fanart",
  logo:          "logo",
  clearart:      "clearart",
  clearlogo:     "clearlogo",
  disc:          "disc",
  banner:        "landscape",
  thumb:         "thumb",
  season_poster: "poster",  // prefix added per season
  episode_thumb: "thumb",   // prefixed with episode basename
};

// Preferred extension per type (overridden by uploaded file's actual ext)
const PREFERRED_EXT: Record<string, string> = {
  logo: ".png",
  clearart: ".png",
  clearlogo: ".png",
  disc: ".png",
};

function artworkFilename(type: string, ext: string, seasonNumber?: number, episodeBasename?: string): string {
  const base = ARTWORK_BASENAME[type] ?? type;
  const finalExt = ext || PREFERRED_EXT[type] || ".jpg";

  if (type === "season_poster" && seasonNumber !== undefined) {
    const pad = seasonNumber === 0 ? "specials" : String(seasonNumber).padStart(2, "0");
    return `season${pad}-${base}${finalExt}`;
  }
  if (type === "episode_thumb" && episodeBasename) {
    return `${episodeBasename}-${base}${finalExt}`;
  }
  return `${base}${finalExt}`;
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

export async function uploadRoutes(app: FastifyInstance): Promise<void> {
  app.post("/upload/artwork", async (req, reply) => {
    // Iterate all multipart parts to collect both the file and text fields.
    // req.file() only reads the first part; subsequent text fields would be empty.
    const fields: Record<string, string> = {};
    let fileBuf: Buffer | null = null;
    let uploadedFilename = "";

    for await (const part of req.parts()) {
      if (part.type === "file") {
        fileBuf = await part.toBuffer();
        uploadedFilename = part.filename;
      } else {
        fields[part.fieldname] = part.value as string;
      }
    }

    if (!fileBuf) return reply.status(400).send({ error: "No file uploaded" });

    const mediaId   = fields["mediaId"];
    const mediaType = fields["mediaType"];
    const artType   = fields["type"];
    const showIdF   = fields["showId"];

    if (!mediaId || !mediaType || !artType) {
      return reply.status(400).send({ error: "mediaId, mediaType, and type are required" });
    }

    const validTypes = artworkTypeEnum.enumValues as readonly string[];
    if (!validTypes.includes(artType)) {
      return reply.status(400).send({ error: `Invalid type. Must be one of: ${validTypes.join(", ")}` });
    }

    const buf = fileBuf;
    if (buf.byteLength > 50 * 1024 * 1024) {
      return reply.status(413).send({ error: "File too large (max 50 MB)" });
    }

    const uploadedExt = path.extname(uploadedFilename).toLowerCase() || PREFERRED_EXT[artType] || ".jpg";
    const db = getDb();
    const type = artType as ArtworkTypeValue;

    // ── Movie artwork ─────────────────────────────────────────────────────────
    if (mediaType === "movie") {
      const [movie] = await db.select({ filePath: movies.filePath }).from(movies).where(eq(movies.id, mediaId));
      if (!movie) return reply.status(404).send({ error: "Movie not found" });

      const folder = path.dirname(movie.filePath);
      const filename = artworkFilename(artType, uploadedExt);
      const destPath = path.join(folder, filename);

      await ensureDir(folder);
      await fs.writeFile(destPath, buf);

      // Delete ALL existing DB records for this type so we always insert a fresh ID.
      // A fresh ID changes the cache-busting URL, forcing browsers to fetch the new file
      // even if they cached the old image at the same path.
      await db.delete(movieArtwork)
        .where(and(eq(movieArtwork.movieId, mediaId), eq(movieArtwork.type, type)));

      const id = randomUUID();
      await db.insert(movieArtwork).values({
        id, movieId: mediaId, type, filePath: destPath, sourceUrl: null, active: true, source: "upload",
      });
      return reply.status(201).send({ id, filePath: destPath });
    }

    // ── Show artwork ──────────────────────────────────────────────────────────
    if (mediaType === "show") {
      const [show] = await db.select({ folderPath: shows.folderPath }).from(shows).where(eq(shows.id, mediaId));
      if (!show) return reply.status(404).send({ error: "Show not found" });

      const filename = artworkFilename(artType, uploadedExt);
      const destPath = path.join(show.folderPath, filename);

      await ensureDir(show.folderPath);
      await fs.writeFile(destPath, buf);

      await db.delete(showArtwork)
        .where(and(eq(showArtwork.showId, mediaId), eq(showArtwork.type, type)));

      const id = randomUUID();
      await db.insert(showArtwork).values({
        id, showId: mediaId, type, filePath: destPath, sourceUrl: null, active: true, source: "upload",
      });
      return reply.status(201).send({ id, filePath: destPath });
    }

    // ── Season artwork ────────────────────────────────────────────────────────
    if (mediaType === "season") {
      const showId = showIdF;
      if (!showId) return reply.status(400).send({ error: "showId required for season artwork" });

      const [season] = await db.select({ seasonNumber: seasons.seasonNumber })
        .from(seasons).where(eq(seasons.id, mediaId));
      const [show] = await db.select({ folderPath: shows.folderPath })
        .from(shows).where(eq(shows.id, showId));

      if (!season || !show) return reply.status(404).send({ error: "Season or show not found" });

      const filename = artworkFilename(artType, uploadedExt, season.seasonNumber);
      const destPath = path.join(show.folderPath, filename);

      await ensureDir(show.folderPath);
      await fs.writeFile(destPath, buf);

      await db.delete(seasonArtwork)
        .where(and(eq(seasonArtwork.seasonId, mediaId), eq(seasonArtwork.type, type)));

      const id = randomUUID();
      await db.insert(seasonArtwork).values({
        id, seasonId: mediaId, showId, type, filePath: destPath, sourceUrl: null, active: true, source: "upload",
      });
      return reply.status(201).send({ id, filePath: destPath });
    }

    // ── Episode artwork ───────────────────────────────────────────────────────
    if (mediaType === "episode") {
      const [episode] = await db.select({ filePath: episodes.filePath })
        .from(episodes).where(eq(episodes.id, mediaId));
      if (!episode?.filePath) return reply.status(404).send({ error: "Episode not found or has no file" });

      const episodeFolder = path.dirname(episode.filePath);
      const episodeBase = path.basename(episode.filePath, path.extname(episode.filePath));
      const filename = artworkFilename(artType, uploadedExt, undefined, episodeBase);
      const destPath = path.join(episodeFolder, filename);

      await ensureDir(episodeFolder);
      await fs.writeFile(destPath, buf);

      await db.delete(episodeArtwork)
        .where(and(eq(episodeArtwork.episodeId, mediaId), eq(episodeArtwork.type, type)));

      const id = randomUUID();
      await db.insert(episodeArtwork).values({
        id, episodeId: mediaId, type, filePath: destPath, sourceUrl: null, active: true, source: "upload",
      });
      return reply.status(201).send({ id, filePath: destPath });
    }

    return reply.status(400).send({ error: "mediaType must be movie, show, season, or episode" });
  });
}
