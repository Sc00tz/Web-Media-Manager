import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { taskApi } from "../lib/api.js";
import { clsx } from "clsx";
import { CheckCircle, XCircle, Loader, Clock } from "lucide-react";

interface Job {
  id: string;
  name: string;
  queue: string;
  status: string;
  data: Record<string, unknown>;
  failedReason?: string;
  finishedOn?: number;
  processedOn?: number;
  timestamp: number;
}

const STATUS_ICON = {
  completed: <CheckCircle size={14} className="text-green-400 flex-shrink-0" />,
  failed: <XCircle size={14} className="text-red-400 flex-shrink-0" />,
  active: <Loader size={14} className="text-blue-400 animate-spin flex-shrink-0" />,
  waiting: <Clock size={14} className="text-gray-500 flex-shrink-0" />,
};

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

// Subscribe to the SSE task stream and call onEvent for each message.
// Returns a cleanup function.
function useTaskStream(onEvent: () => void) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    const es = new EventSource("/api/tasks/stream");
    const handler = () => onEventRef.current();
    es.addEventListener("active", handler);
    es.addEventListener("completed", handler);
    es.addEventListener("failed", handler);
    es.addEventListener("waiting", handler);
    return () => es.close();
  }, []);
}

export function TaskLogs() {
  const queryClient = useQueryClient();

  // Invalidate both queries whenever a task event arrives via SSE
  useTaskStream(() => {
    queryClient.invalidateQueries({ queryKey: ["task-queues"] });
    queryClient.invalidateQueries({ queryKey: ["task-jobs"] });
  });

  // Queue stats still poll at a slow interval as a fallback
  const { data: queues } = useQuery({
    queryKey: ["task-queues"],
    queryFn: taskApi.queues,
    refetchInterval: 15000,
  });

  const { data: jobs, isLoading } = useQuery({
    queryKey: ["task-jobs"],
    queryFn: () => taskApi.list(100) as Promise<Job[]>,
    refetchInterval: 15000,
  });

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Task Queue</h1>

      {/* Queue summary cards */}
      <div className="grid grid-cols-5 gap-3">
        {queues?.map((q) => (
          <div key={q.name} className="bg-gray-900 border border-white/5 rounded-lg p-4">
            <div className="font-medium capitalize text-sm">{q.name}</div>
            <dl className="mt-2 space-y-1 text-xs">
              <div className="flex justify-between">
                <dt className="text-gray-400">Waiting</dt>
                <dd className={q.waiting > 0 ? "text-yellow-400" : "text-gray-600"}>{q.waiting}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-400">Active</dt>
                <dd className={q.active > 0 ? "text-blue-400" : "text-gray-600"}>{q.active}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-400">Done</dt>
                <dd className="text-green-400">{q.completed}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-400">Failed</dt>
                <dd className={q.failed > 0 ? "text-red-400" : "text-gray-600"}>{q.failed}</dd>
              </div>
            </dl>
          </div>
        ))}
      </div>

      {/* Job list */}
      <section>
        <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">Recent Jobs</h2>
        {isLoading && <p className="text-sm text-gray-500">Loading...</p>}
        {!isLoading && !jobs?.length && (
          <p className="text-sm text-gray-500">No jobs yet. Add a library or trigger a scrape to see activity here.</p>
        )}
        <div className="bg-gray-900 border border-white/5 rounded-lg overflow-hidden">
          {jobs?.map((job) => (
            <div key={`${job.queue}-${job.id}`}
              className="flex items-start gap-3 px-4 py-3 border-b border-white/5 last:border-0 hover:bg-white/5"
            >
              {STATUS_ICON[job.status as keyof typeof STATUS_ICON] ?? <Clock size={14} className="text-gray-600 flex-shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={clsx("text-xs font-medium", job.status === "failed" ? "text-red-300" : "text-gray-200")}>
                    {job.name}
                  </span>
                  <span className="text-xs text-gray-600 bg-white/5 px-1.5 py-0.5 rounded">{job.queue}</span>
                </div>
                <div className="text-xs text-gray-500 mt-0.5 truncate">
                  {Object.entries(job.data ?? {})
                    .filter(([k]) => !k.includes("Id") || ["movieId", "showId", "episodeId"].includes(k))
                    .slice(0, 3)
                    .map(([k, v]) => `${k}: ${String(v)}`)
                    .join(" · ")}
                </div>
                {job.failedReason && (
                  <div className="text-xs text-red-400 mt-1 truncate" title={job.failedReason}>
                    {job.failedReason}
                  </div>
                )}
              </div>
              <span className="text-xs text-gray-600 flex-shrink-0">
                {timeAgo(job.finishedOn ?? job.processedOn ?? job.timestamp)}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
