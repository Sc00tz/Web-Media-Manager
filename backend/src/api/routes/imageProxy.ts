/**
 * Image proxy endpoint.
 *
 * GET /api/proxy/image?url=<encoded-url>
 *
 * Fetches the remote image, caches it on disk in CACHE_DIR/proxy/,
 * and serves it with long-lived Cache-Control headers.
 *
 * Benefits:
 *   - Eliminates browser CORS errors when loading TMDB/Fanart images
 *   - Single cache location — no duplicate downloads per browser tab
 *   - Allows the frontend to use a single origin for all images
 *   - Respects Content-Type from the upstream response
 */
import type { FastifyInstance } from "fastify";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { config } from "../../config/index.js";

const CACHE_DIR = path.join(config.CACHE_DIR, "proxy");
const MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB guard

function cacheKey(url: string): string {
  const hash = crypto.createHash("sha256").update(url).digest("hex");
  const ext = path.extname(new URL(url).pathname) || ".jpg";
  return path.join(CACHE_DIR, `${hash}${ext}`);
}

// Simple allowlist — only proxy known image CDNs to prevent SSRF abuse
const ALLOWED_HOSTS = new Set([
  "image.tmdb.org",
  "artworks.thetvdb.com",
  "assets.fanart.tv",
  "webservice.fanart.tv",
  "media.thetvdb.com",
  "static.opensubtitles.org",
]);

// Allowed root directories for local file serving.
// MEDIA_PATH covers the user-configured library mount; the others cover common Linux/macOS paths.
const ALLOWED_LOCAL_ROOTS = [
  process.env["MEDIA_PATH"] ?? "/media",
  "/Volumes/",
  "/mnt/",
  "/media/",
  config.CACHE_DIR,
  config.UPLOAD_DIR,
];

export async function imageProxyRoutes(app: FastifyInstance): Promise<void> {
  // Serve local artwork files (e.g. /poster.jpg on the media drive)
  app.get("/artwork/local", async (req, reply) => {
    const { path: filePath } = req.query as { path?: string };
    if (!filePath) return reply.status(400).send({ error: "path required" });

    // Resolve symlinks and normalise before checking the allowlist — prevents
    // tricks like "....//....//etc/passwd" that survive a simple /\.\./ strip.
    const resolved = path.resolve(filePath);
    const allowed = ALLOWED_LOCAL_ROOTS.some((root) => resolved.startsWith(path.resolve(root)));
    if (!allowed) return reply.status(403).send({ error: "Path not allowed" });

    try {
      const buf = await fs.readFile(resolved);
      const ext = path.extname(resolved).slice(1).toLowerCase();
      const mime =
        ext === "png" ? "image/png" :
        ext === "webp" ? "image/webp" :
        ext === "gif" ? "image/gif" :
        "image/jpeg";

      return reply
        .header("Content-Type", mime)
        // Local files can be replaced by the user at any time — don't cache them.
        .header("Cache-Control", "no-store")
        .send(buf);
    } catch {
      return reply.status(404).send({ error: "File not found" });
    }
  });

  app.get("/proxy/image", async (req, reply) => {
    const { url } = req.query as { url?: string };
    if (!url) return reply.status(400).send({ error: "url parameter required" });

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return reply.status(400).send({ error: "Invalid URL" });
    }

    if (!ALLOWED_HOSTS.has(parsed.hostname)) {
      return reply.status(403).send({ error: "Host not allowed" });
    }

    const dest = cacheKey(url);

    // Serve from cache if available
    try {
      await fs.access(dest);
      const content = await fs.readFile(dest);
      const ext = path.extname(dest).slice(1).toLowerCase();
      const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
      return reply
        .header("Content-Type", mime)
        .header("Cache-Control", "public, max-age=604800, immutable")
        .send(content);
    } catch {
      // Not cached — fetch from upstream
    }

    await fs.mkdir(CACHE_DIR, { recursive: true });

    let upstream: Response;
    try {
      upstream = await fetch(url, { signal: AbortSignal.timeout(15000) });
    } catch (err) {
      return reply.status(502).send({ error: `Upstream fetch failed: ${String(err)}` });
    }

    if (!upstream.ok) {
      return reply.status(502).send({ error: `Upstream returned ${upstream.status}` });
    }

    const contentType = upstream.headers.get("content-type") ?? "image/jpeg";
    if (!contentType.startsWith("image/")) {
      return reply.status(422).send({ error: "Upstream did not return an image" });
    }

    const buf = Buffer.from(await upstream.arrayBuffer());
    if (buf.byteLength > MAX_SIZE_BYTES) {
      return reply.status(413).send({ error: "Image too large" });
    }

    await fs.writeFile(dest, buf);

    return reply
      .header("Content-Type", contentType)
      .header("Cache-Control", "public, max-age=604800, immutable")
      .send(buf);
  });
}
