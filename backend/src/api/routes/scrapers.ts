import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { listAll, loadPlugin, unloadPlugin } from "../../scrapers/registry.js";
import { getDb } from "../../db/index.js";
import { scraperConfig } from "../../db/schema.js";
import { eq } from "drizzle-orm";
import { setRuntimeKey } from "../../config/index.js";

const loadPluginSchema = z.object({
  modulePath: z.string().min(1),
});

const updateConfigSchema = z.object({
  apiKey: z.string().optional(),
  enabled: z.boolean().optional(),
  priority: z.number().int().optional(),
  options: z.record(z.unknown()).optional(),
});

export async function scraperRoutes(app: FastifyInstance): Promise<void> {
  // List all registered scrapers with their availability status
  app.get("/scrapers", async () => {
    const scrapers = listAll();
    const db = getDb();
    const configs = await db.select().from(scraperConfig);
    const configMap = new Map(configs.map((c) => [c.provider, c]));

    return scrapers.map((s) => ({
      ...s,
      config: configMap.get(s.provider) ?? null,
    }));
  });

  // Update API key / priority for a scraper
  app.patch("/scrapers/:provider/config", async (req, reply) => {
    const { provider } = req.params as { provider: string };
    const body = updateConfigSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.message });

    const db = getDb();
    await db
      .insert(scraperConfig)
      .values({
        provider,
        apiKey: body.data.apiKey ?? null,
        enabled: body.data.enabled ?? true,
        priority: body.data.priority ?? 10,
        options: body.data.options ?? null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: scraperConfig.provider,
        set: {
          ...(body.data.apiKey !== undefined && { apiKey: body.data.apiKey }),
          ...(body.data.enabled !== undefined && { enabled: body.data.enabled }),
          ...(body.data.priority !== undefined && { priority: body.data.priority }),
          ...(body.data.options !== undefined && { options: body.data.options }),
          updatedAt: new Date(),
        },
      });

    // Apply key to runtime store immediately — no restart required
    if (body.data.apiKey) {
      // Map provider names to getApiKey() provider type
      const knownProviders = ["tmdb", "tvdb", "fanart", "opensubtitles", "subdl"];
      if (knownProviders.includes(provider)) {
        setRuntimeKey(provider, body.data.apiKey);
      }
    }
    // OpenSubtitles stores username/password in options
    const opts = body.data.options as Record<string, string> | undefined;
    if (provider === "opensubtitles" && opts) {
      if (opts["username"]) setRuntimeKey("opensubtitles_username", opts["username"]);
      if (opts["password"]) setRuntimeKey("opensubtitles_password", opts["password"]);
    }

    return { success: true };
  });

  // Load a plugin scraper from a file path
  app.post("/scrapers/plugin/load", async (req, reply) => {
    const body = loadPluginSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.message });

    try {
      const result = await loadPlugin(body.data.modulePath);
      return reply.status(201).send(result);
    } catch (err) {
      return reply.status(422).send({ error: String(err) });
    }
  });

  // Unload a plugin scraper
  app.delete("/scrapers/plugin/:provider", async (req, reply) => {
    const { provider } = req.params as { provider: string };
    try {
      unloadPlugin(provider);
      return reply.status(204).send();
    } catch (err) {
      return reply.status(400).send({ error: String(err) });
    }
  });
}
