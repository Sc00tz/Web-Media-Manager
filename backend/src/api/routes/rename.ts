import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { previewMovieRenames, previewEpisodeRenames } from "../../workers/renameWorker.js";
import { enqueueTask } from "../../workers/queue.js";
import { validateTemplate, DEFAULT_MOVIE_TEMPLATE, DEFAULT_EPISODE_TEMPLATE, MOVIE_TOKENS, EPISODE_TOKENS } from "../../rename/renameEngine.js";
import { undoBatch, listBatches, getBatch } from "../../rename/renameJournal.js";

const previewSchema = z.object({
  mediaIds: z.array(z.string()),
  template: z.string(),
  mediaType: z.enum(["movie", "episode"]),
});

const executeSchema = z.object({
  mediaIds: z.array(z.string()),
  template: z.string(),
  mediaType: z.enum(["movie", "episode"]),
  dryRun: z.boolean().default(false),
});

export async function renameRoutes(app: FastifyInstance): Promise<void> {
  // Validate a template and return any errors
  app.post("/rename/validate", async (req, reply) => {
    const { template, mediaType } = req.body as { template: string; mediaType: "movie" | "episode" };
    if (!template || !mediaType) return reply.status(400).send({ error: "template and mediaType required" });

    const errors = validateTemplate(template, mediaType);
    return { valid: errors.length === 0, errors };
  });

  // Preview renames without touching the filesystem
  app.post("/rename/preview", async (req, reply) => {
    const body = previewSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.message });

    const { mediaIds, template, mediaType } = body.data;
    const validationErrors = validateTemplate(template, mediaType);
    if (validationErrors.length > 0) {
      return reply.status(422).send({ error: "Invalid template", details: validationErrors });
    }

    if (mediaType === "movie") {
      const preview = await previewMovieRenames(mediaIds, template);
      return { items: preview, hasConflicts: preview.some((p) => p.conflict) };
    } else {
      const preview = await previewEpisodeRenames(mediaIds, template);
      return { items: preview, hasConflicts: preview.some((p) => p.conflict) };
    }
  });

  // Execute renames (queues individual rename jobs)
  app.post("/rename/execute", async (req, reply) => {
    const body = executeSchema.safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: body.error.message });

    const { mediaIds, template, mediaType, dryRun } = body.data;

    for (const id of mediaIds) {
      await enqueueTask("rename_file", {
        mediaId: id,
        mediaType,
        template,
        dryRun,
      });
    }

    return reply.status(202).send({ message: `${mediaIds.length} renames queued`, dryRun });
  });

  // Undo a rename batch
  app.post("/rename/undo/:batchId", async (req, reply) => {
    const { batchId } = req.params as { batchId: string };
    try {
      const result = await undoBatch(batchId);
      return result;
    } catch (err) {
      return reply.status(400).send({ error: String(err) });
    }
  });

  // List recent rename batches
  app.get("/rename/journal", async () => listBatches());

  // Get a specific batch
  app.get("/rename/journal/:batchId", async (req, reply) => {
    const { batchId } = req.params as { batchId: string };
    const batch = await getBatch(batchId);
    if (!batch) return reply.status(404).send({ error: "Batch not found" });
    return batch;
  });

  // Default templates and full token list
  app.get("/rename/templates/defaults", async () => ({
    movie: DEFAULT_MOVIE_TEMPLATE,
    episode: DEFAULT_EPISODE_TEMPLATE,
  }));

  app.get("/rename/tokens", async () => ({
    movie: MOVIE_TOKENS,
    episode: EPISODE_TOKENS,
  }));
}
