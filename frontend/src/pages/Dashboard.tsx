import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { libraryApi, taskApi, movieApi } from "../lib/api.js";

export function Dashboard() {
  const queryClient = useQueryClient();
  const { data: libraries } = useQuery({
    queryKey: ["libraries"],
    queryFn: libraryApi.list,
  });

  const mediaInfoMutation = useMutation({
    mutationFn: movieApi.scanAllMediaInfo,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["task-queues"] }),
  });

  const { data: queues } = useQuery({
    queryKey: ["task-queues"],
    queryFn: taskApi.queues,
    refetchInterval: 5000,
  });

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      {/* Libraries */}
      <section>
        <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">Libraries</h2>
        {libraries?.length === 0 && (
          <p className="text-gray-500 text-sm">No libraries configured. Add one in Settings.</p>
        )}
        <div className="grid grid-cols-2 gap-3">
          {libraries?.map((lib) => (
            <div key={lib.id} className="bg-gray-900 border border-white/5 rounded-lg p-4">
              <div className="font-medium">{lib.name}</div>
              <div className="text-xs text-gray-500 mt-1">{lib.type === "movie" ? "Movies" : "TV Shows"}</div>
              <div className="text-xs text-gray-600 mt-1 truncate">{lib.path}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Quick actions */}
      <section>
        <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">Quick Actions</h2>
        <div className="flex gap-3">
          <button
            onClick={() => mediaInfoMutation.mutate()}
            disabled={mediaInfoMutation.isPending}
            className="px-4 py-2 text-sm bg-gray-900 border border-white/10 rounded hover:bg-gray-800 disabled:opacity-40"
          >
            {mediaInfoMutation.isPending ? "Queuing..." : "Scan all missing MediaInfo"}
          </button>
          {mediaInfoMutation.isSuccess && (
            <span className="text-xs text-green-400 self-center">{mediaInfoMutation.data?.message}</span>
          )}
        </div>
      </section>

      {/* Queue stats */}
      <section>
        <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">Task Queues</h2>
        <div className="grid grid-cols-5 gap-3">
          {queues?.map((q) => (
            <div key={q.name} className="bg-gray-900 border border-white/5 rounded-lg p-3">
              <div className="text-xs font-medium text-gray-400 capitalize">{q.name}</div>
              <div className="mt-2 flex gap-3 text-xs">
                <span className="text-yellow-400">{q.waiting} waiting</span>
                <span className="text-blue-400">{q.active} active</span>
              </div>
              <div className="flex gap-3 text-xs mt-1">
                <span className="text-green-400">{q.completed} done</span>
                <span className="text-red-400">{q.failed} failed</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
