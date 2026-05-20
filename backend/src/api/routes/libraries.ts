import type { FastifyInstance } from "fastify";
import { z } from "zod";
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
