import { getDb } from "../db/index.js";
import { movieMediaInfo, episodeMediaInfo } from "../db/schema.js";
import { extractMediaInfo, type DetailedMediaInfo } from "../scanner/mediaInfo.js";
import type { JobPayload } from "./queue.js";

function buildValues(info: DetailedMediaInfo, idField: Record<string, string>) {
  const streams = {
    video: info.videoStreams,
    audio: info.audioStreams,
    subtitles: info.subtitleStreams,
  };

  return {
    ...idField,
    videoCodec: info.videoCodec ?? null,
    audioCodec: info.audioCodec ?? null,
    audioChannels: info.audioChannels ?? null,
    hdrFormat: info.hdrFormat ?? null,
    resolution: info.resolution ?? null,
    width: info.width ?? null,
    height: info.height ?? null,
    bitrate: info.bitrate ?? null,
    container: info.container ?? null,
    durationSeconds: info.durationSeconds ?? null,
    subtitleTracks: info.subtitleTracks ?? null,
    streamsJson: streams,
    rawJson: info.rawJson ?? null,
  };
}

export async function extractMediaInfoHandler(payload: JobPayload["extract_mediainfo"]): Promise<void> {
  const db = getDb();
  const info = await extractMediaInfo(payload.filePath);

  if (payload.mediaType === "movie") {
    const vals = buildValues(info, { movieId: payload.mediaId });
    await db.insert(movieMediaInfo).values(vals as typeof movieMediaInfo.$inferInsert)
      .onConflictDoUpdate({ target: movieMediaInfo.movieId, set: vals as Partial<typeof movieMediaInfo.$inferInsert> });
  } else {
    const vals = buildValues(info, { episodeId: payload.mediaId });
    await db.insert(episodeMediaInfo).values(vals as typeof episodeMediaInfo.$inferInsert)
      .onConflictDoUpdate({ target: episodeMediaInfo.episodeId, set: vals as Partial<typeof episodeMediaInfo.$inferInsert> });
  }
}
