import type { FastifyInstance } from "fastify";
import { QueueEvents } from "bullmq";
import { getQueue, getRedisConnection } from "../../workers/queue.js";
import type { QueueName } from "../../workers/queue.js";

const QUEUE_NAMES: QueueName[] = ["scan", "scrape", "artwork", "subtitle", "rename"];

export async function taskRoutes(app: FastifyInstance): Promise<void> {
  app.get("/tasks/queues", async () => {
    const stats = await Promise.all(
      QUEUE_NAMES.map(async (name) => {
        const queue = getQueue(name);
        const [waiting, active, completed, failed] = await Promise.all([
          queue.getWaitingCount(),
          queue.getActiveCount(),
          queue.getCompletedCount(),
          queue.getFailedCount(),
        ]);
        return { name, waiting, active, completed, failed };
      })
    );
    return stats;
  });

  // Recent jobs across all queues — reads directly from BullMQ, not the unused DB table
  app.get("/tasks", async (req) => {
    const { limit = "50" } = req.query as { limit?: string };
    const perQueue = Math.ceil(Number(limit) / QUEUE_NAMES.length);

    const allJobs: Array<{
      id: string;
      name: string;
      queue: string;
      status: string;
      data: unknown;
      failedReason?: string;
      finishedOn?: number;
      processedOn?: number;
      timestamp: number;
    }> = [];

    for (const queueName of QUEUE_NAMES) {
      const queue = getQueue(queueName);
      const [completed, failed, active] = await Promise.all([
        queue.getCompleted(0, perQueue),
        queue.getFailed(0, perQueue),
        queue.getActive(),
      ]);

      const jobsWithStatus = [
        ...active.map(j => [j, "active"] as const),
        ...completed.map(j => [j, "completed"] as const),
        ...failed.map(j => [j, "failed"] as const),
      ];

      for (const [job, status] of jobsWithStatus) {
        allJobs.push({
          id: job.id ?? "",
          name: job.name,
          queue: queueName,
          status,
          data: job.data,
          failedReason: job.failedReason,
          finishedOn: job.finishedOn,
          processedOn: job.processedOn,
          timestamp: job.timestamp,
        });
      }
    }

    return allJobs
      .sort((a, b) => (b.finishedOn ?? b.timestamp) - (a.finishedOn ?? a.timestamp))
      .slice(0, Number(limit));
  });

  // SSE endpoint for real-time task events
  app.get("/tasks/stream", async (req, reply) => {
    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.flushHeaders();

    const send = (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // QueueEvents uses a dedicated Redis pub/sub connection per queue (separate from the main client)
    const queueEvents = QUEUE_NAMES.map((name) => {
      const qe = new QueueEvents(name, { connection: getRedisConnection() });

      qe.on("active", ({ jobId }) => send("active", { queue: name, jobId, status: "active" }));
      qe.on("completed", ({ jobId }) => send("completed", { queue: name, jobId, status: "completed" }));
      qe.on("failed", ({ jobId, failedReason }) => send("failed", { queue: name, jobId, status: "failed", failedReason }));
      qe.on("waiting", ({ jobId }) => send("waiting", { queue: name, jobId, status: "waiting" }));

      return qe;
    });

    const heartbeat = setInterval(() => {
      reply.raw.write(": heartbeat\n\n");
    }, 15000);

    await new Promise<void>((resolve) => req.socket.on("close", resolve));

    clearInterval(heartbeat);
    await Promise.all(queueEvents.map((qe) => qe.close()));
  });
}
