import { Queue, Worker } from "bullmq";
import { Redis as IORedis } from "ioredis";
import { config } from "../config/index.js";
import type { TaskType } from "@mediamanager/types";

export interface JobPayload {
  scan_library: { libraryId: string };
  scan_path: { path: string; libraryId: string };
  scrape_movie: { movieId: string; provider?: string; tmdbId?: number };
  scrape_show: { showId: string; provider?: string; tvdbId?: number };
  scrape_episode: { episodeId: string };
  download_artwork: { mediaId: string; mediaType: "movie" | "show" | "season" | "episode"; artworkId: string };
  search_subtitles: { mediaId: string; mediaType: "movie" | "episode"; language: string };
  download_subtitle: { mediaId: string; mediaType: "movie" | "episode"; subtitleResultId: string; language: string };
  rename_file: { mediaId: string; mediaType: "movie" | "episode"; template: string; dryRun: boolean };
  generate_nfo: { mediaId: string; mediaType: "movie" | "show" | "episode" };
  extract_mediainfo: { filePath: string; mediaId: string; mediaType: "movie" | "episode" };
}

export type QueueName = "scan" | "scrape" | "artwork" | "subtitle" | "rename";

const QUEUE_CONCURRENCY: Record<QueueName, number> = {
  scan: 2,
  scrape: 4,
  artwork: 3,
  subtitle: 2,
  rename: 1,
};

const TASK_TO_QUEUE: Record<TaskType, QueueName> = {
  scan_library: "scan",
  scan_path: "scan",
  extract_mediainfo: "scan",
  scrape_movie: "scrape",
  scrape_show: "scrape",
  scrape_episode: "scrape",
  download_artwork: "artwork",
  search_subtitles: "subtitle",
  download_subtitle: "subtitle",
  rename_file: "rename",
  generate_nfo: "rename",
};

let connection: IORedis | null = null;

export function getRedisConnection(): IORedis {
  if (!connection) {
    connection = new IORedis(config.REDIS_URL, {
      maxRetriesPerRequest: null,
    });
  }
  return connection;
}

const queues = new Map<QueueName, Queue>();

export function getQueue(name: QueueName): Queue {
  if (!queues.has(name)) {
    queues.set(name, new Queue(name, { connection: getRedisConnection() }));
  }
  return queues.get(name)!;
}

export function getQueueForTask(taskType: TaskType): Queue {
  const queueName = TASK_TO_QUEUE[taskType];
  return getQueue(queueName);
}

export async function enqueueTask<T extends TaskType>(
  type: T,
  payload: JobPayload[T],
  opts?: { priority?: number; delay?: number }
): Promise<string> {
  const queue = getQueueForTask(type);
  const job = await queue.add(type, payload, {
    priority: opts?.priority,
    delay: opts?.delay,
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 200 },
  });
  return job.id ?? "";
}

const workers = new Map<QueueName, Worker>();

type HandlerMap = {
  [K in TaskType]?: (payload: JobPayload[K]) => Promise<void>;
};

export function startWorkers(handlers: HandlerMap): void {
  for (const [queueName, concurrency] of Object.entries(QUEUE_CONCURRENCY) as [QueueName, number][]) {
    const worker = new Worker(
      queueName,
      async (job) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const handler = (handlers as Record<string, ((p: any) => Promise<void>) | undefined>)[job.name];
        if (handler) {
          await handler(job.data);
        } else {
          console.warn(`No handler registered for task type: ${job.name}`);
        }
      },
      { connection: getRedisConnection(), concurrency }
    );

    worker.on("failed", (job, err) => {
      console.error(`Job ${job?.id} (${job?.name}) failed:`, err.message);
    });

    workers.set(queueName, worker);
  }
  console.log("Workers started:", Object.keys(QUEUE_CONCURRENCY).join(", "));
}

export async function closeQueues(): Promise<void> {
  await Promise.all([
    ...Array.from(workers.values()).map((w) => w.close()),
    ...Array.from(queues.values()).map((q) => q.close()),
  ]);
  if (connection) {
    await connection.quit();
    connection = null;
  }
}
