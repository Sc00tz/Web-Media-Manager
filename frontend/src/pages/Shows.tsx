import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { showApi, artworkDisplayUrl, type ShowSummary } from "../lib/api.js";
import { ShowDetailPanel } from "../components/media/ShowDetailPanel.js";
import { Search, RefreshCw } from "lucide-react";
import { clsx } from "clsx";

export function Shows() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["shows", { search, page }],
    queryFn: () => showApi.list({ search: search || undefined, page, pageSize: 50 }),
    placeholderData: (prev) => prev,
  });

  const { data: stats } = useQuery({
    queryKey: ["show-stats"],
    queryFn: showApi.stats,
  });

  const scanMissingMutation = useMutation({
    mutationFn: showApi.scanMissing,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["show-stats"] }),
  });

  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 1;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-white/5 flex-shrink-0">
        <h1 className="text-xl font-semibold mr-2">TV Shows</h1>
        <div className="relative flex-1 max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="Search shows..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full bg-gray-900 border border-white/10 rounded-md pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Stats chips */}
        {stats && (
          <div className="flex gap-2 text-xs">
            {stats.unmatched > 0 && (
              <span className="px-2 py-1 bg-red-500/10 text-red-400 border border-red-500/20 rounded">
                {stats.unmatched} unmatched
              </span>
            )}
            {stats.missingArtwork > 0 && (
              <span className="px-2 py-1 bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 rounded">
                {stats.missingArtwork} no artwork
              </span>
            )}
          </div>
        )}

        <div className="ml-auto flex items-center gap-3">
          {isFetching && <RefreshCw size={12} className="animate-spin text-gray-500" />}
          <span className="text-sm text-gray-500">{data?.total ?? 0} shows</span>
          <button
            onClick={() => scanMissingMutation.mutate()}
            disabled={scanMissingMutation.isPending}
            className="text-xs px-3 py-1.5 bg-gray-900 border border-white/10 rounded hover:bg-gray-800 disabled:opacity-40"
          >
            Scan missing
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {isLoading && <p className="text-gray-500 text-sm">Loading...</p>}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
          {data?.items.map((show) => (
            <ShowCard
              key={show.id}
              show={show}
              selected={selectedId === show.id}
              onClick={() => setSelectedId(show.id)}
            />
          ))}
        </div>

        {data && data.total > data.pageSize && (
          <div className="flex items-center gap-2 mt-6">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 text-sm bg-gray-900 border border-white/10 rounded disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-sm text-gray-400">Page {page} of {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1.5 text-sm bg-gray-900 border border-white/10 rounded disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </div>

      <ShowDetailPanel showId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}

function ShowCard({ show, selected, onClick }: { show: ShowSummary; selected: boolean; onClick: () => void }) {
  const posterUrl = artworkDisplayUrl({
    filePath: show.posterFilePath ?? undefined,
    sourceUrl: show.posterSourceUrl ?? undefined,
  });

  return (
    <button
      onClick={onClick}
      className={clsx(
        "text-left bg-gray-900 border rounded-lg overflow-hidden transition-all",
        selected ? "border-blue-500 ring-1 ring-blue-500/50" : "border-white/5 hover:border-white/20"
      )}
    >
      <div className="aspect-[2/3] bg-gray-800 flex items-center justify-center overflow-hidden relative">
        {posterUrl ? (
          <img src={posterUrl} alt={show.title} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <span className="text-gray-600 text-xs text-center px-2">{show.title[0]}</span>
        )}
      </div>
      <div className="p-2">
        <div className="text-xs font-medium truncate leading-tight">{show.title}</div>
        {show.firstAirDate && (
          <div className="text-xs text-gray-500 mt-0.5">{show.firstAirDate.slice(0, 4)}</div>
        )}
        {show.status && (
          <div className="text-xs text-gray-500 mt-0.5 truncate">{show.status}</div>
        )}
      </div>
    </button>
  );
}
