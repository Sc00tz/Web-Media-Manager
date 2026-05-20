import type { FastifyInstance } from "fastify";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import { getDb } from "../../db/index.js";
import { libraries } from "../../db/schema.js";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { enqueueTask } from "../../workers/queue.js";

const createLibrarySchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
  type: z.enum(["movie", "tv"]),
});

export async function libraryRoutes(app: FastifyInstance): Promise<void> {
  // Directory browser — used by the path picker in the UI
  app.get("/browse", async (req, reply) => {
    const { dir = "/" } = req.query as { dir?: string };

    // Normalise and prevent traversal
    const resolved = path.resolve(dir);

    let entries: { name: string; path: string; isDir: boolean }[] = [];
    try {
      const items = await fs.readdir(resolved, { withFileTypes: true });
      entries = items
        .filter((e) => !e.name.startsWith(".") && !e.isSymbolicLink())
        .filter((e) => e.isDirectory())
        .map((e) => ({
          name: e.name,
          path: path.join(resolved, e.name),
          isDir: true,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      return reply.status(400).send({ error: "Cannot read directory" });
    }

    const parent = resolved !== "/" ? path.dirname(resolved) : null;
    return { current: resolved, parent, entries };
  });

  app.get("/libraries", async () => {
    const db = getDb();
    return db.select().from(libraries).orderBy(libraries.name);
  });

  app.post("/libraries", async (req, reply) => {
    const body = createLibrarySchema.safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({ error: "Validation", message: body.error.message });
    }

    const db = getDb();
    const [library] = await db
      .insert(libraries)
      .values({ id: randomUUID(), ...body.data })
      .returning();

    await enqueueTask("scan_library", { libraryId: library!.id });

    return reply.status(201).send(library);
  });

  app.delete("/libraries/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const db = getDb();
    await db.delete(libraries).where(eq(libraries.id, id));
    return reply.status(204).send();
  });

  app.post("/libraries/:id/scan", async (req, reply) => {
    const { id } = req.params as { id: string };
    await enqueueTask("scan_library", { libraryId: id });
    return reply.status(202).send({ message: "Scan queued" });
  });
}
