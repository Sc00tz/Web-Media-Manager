import Fastify from "fastify";
import cors from "@fastify/cors";
import { config } from "./config/index.js";
import { healthRoutes } from "./api/routes/health.js";
import { libraryRoutes } from "./api/routes/libraries.js";
import { movieRoutes } from "./api/routes/movies.js";
import { showRoutes } from "./api/routes/shows.js";
import { artworkRoutes } from "./api/routes/artwork.js";
import { metadataRoutes } from "./api/routes/metadata.js";
import { subtitleRoutes } from "./api/routes/subtitles.js";
import { renameRoutes } from "./api/routes/rename.js";
import { trailerRoutes } from "./api/routes/trailers.js";
import { imageProxyRoutes } from "./api/routes/imageProxy.js";
import { scraperRoutes } from "./api/routes/scrapers.js";
import { uploadRoutes } from "./api/routes/upload.js";
import { taskRoutes } from "./api/routes/tasks.js";
import { startWorkers } from "./workers/queue.js";
import { scanLibraryHandler, scanPathHandler } from "./workers/scanWorker.js";
import { scrapMovieHandler } from "./workers/scrapeWorker.js";
import { scrapeShowHandler, scrapeEpisodeHandler } from "./workers/tvScrapeWorker.js";
import { extractMediaInfoHandler } from "./workers/mediaInfoWorker.js";
import { downloadArtworkHandler } from "./workers/artworkWorker.js";
import { generateNfoHandler } from "./workers/nfoWorker.js";
import { searchSubtitlesHandler, downloadSubtitleHandler } from "./workers/subtitleWorker.js";
import { renameFileHandler } from "./workers/renameWorker.js";
import { closeDb, getDb } from "./db/index.js";
import { closeQueues } from "./workers/queue.js";
import { scraperConfig } from "./db/schema.js";
import { setRuntimeKey } from "./config/index.js";

const app = Fastify({
  logger: config.NODE_ENV !== "production"
    ? { level: "debug", transport: { target: "pino-pretty", options: { colorize: true } } }
    : { level: "info" },
});

async function loadSavedApiKeys() {
  try {
    const db = getDb();
    const configs = await db.select().from(scraperConfig);
    for (const c of configs) {
      if (c.apiKey) setRuntimeKey(c.provider, c.apiKey);
      const opts = c.options as Record<string, string> | null;
      if (c.provider === "opensubtitles" && opts) {
        if (opts["username"]) setRuntimeKey("opensubtitles_username", opts["username"]);
        if (opts["password"]) setRuntimeKey("opensubtitles_password", opts["password"]);
      }
    }
    if (configs.length > 0) console.log(`Loaded API keys for: ${configs.map((c) => c.provider).join(", ")}`);
  } catch {
    // Table may not exist yet on first run — ignore
  }
}

async function bootstrap() {
  await loadSavedApiKeys();

  await app.register(cors, {
    origin: config.NODE_ENV === "production" ? false : true,
  });

  // Multipart for artwork file uploads
  const multipart = await import("@fastify/multipart");
  await app.register(multipart.default, { limits: { fileSize: 20 * 1024 * 1024 } });

  await app.register(healthRoutes);
  await app.register(libraryRoutes, { prefix: "/api" });
  await app.register(movieRoutes, { prefix: "/api" });
  await app.register(showRoutes, { prefix: "/api" });
  await app.register(artworkRoutes, { prefix: "/api" });
  await app.register(metadataRoutes, { prefix: "/api" });
  await app.register(subtitleRoutes, { prefix: "/api" });
  await app.register(renameRoutes, { prefix: "/api" });
  await app.register(trailerRoutes, { prefix: "/api" });
  await app.register(imageProxyRoutes, { prefix: "/api" });
  await app.register(scraperRoutes, { prefix: "/api" });
  await app.register(uploadRoutes, { prefix: "/api" });
  await app.register(taskRoutes, { prefix: "/api" });

  startWorkers({
    scan_library: scanLibraryHandler,
    scan_path: scanPathHandler,
    scrape_movie: scrapMovieHandler,
    scrape_show: scrapeShowHandler,
    scrape_episode: scrapeEpisodeHandler,
    extract_mediainfo: extractMediaInfoHandler,
    download_artwork: downloadArtworkHandler,
    generate_nfo: generateNfoHandler,
    search_subtitles: searchSubtitlesHandler,
    download_subtitle: downloadSubtitleHandler,
    rename_file: renameFileHandler,
  });

  const shutdown = async () => {
    console.log("Shutting down...");
    await app.close();
    await closeQueues();
    await closeDb();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  await app.listen({ port: config.PORT, host: config.HOST });
  console.log(`Server running at http://${config.HOST}:${config.PORT}`);
}

bootstrap().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
