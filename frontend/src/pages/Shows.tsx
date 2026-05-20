import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { showApi, artworkDisplayUrl, type ShowSummary } from "../lib/api.js";
import type { ShowFilters } from "@mediamanager/types";
import { ShowDetailPanel } from "../components/media/ShowDetailPanel.js";
import { Search, RefreshCw, X } from "lucide-react";
import { clsx } from "clsx";

const EMPTY_FILTERS: ShowFilters = { page: 1, pageSize: 50 };

const SHOW_STATUSES = ["Continuing", "Ended", "Upcoming"];

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer group">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}
        className="rounded border-white/20 bg-gray-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-0" />
      <span className="text-sm text-gray-300 group-hover:text-white">{label}</span>
    </label>
  );
}

export function Shows() {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<ShowFilters>(EMPTY_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const activeFilters: ShowFilters = { ...filters, search: search || undefined };

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["shows", activeFilters],
    queryFn: () => showApi.list(activeFilters),
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

  const totalPages = data ? Math.ceil(data.total / (filters.pageSize ?? 50)) : 1;

  const hasActiveFilters = Boolean(
    filters.status || filters.missingMetadata || filters.missingArtwork ||
    filters.missingPoster || filters.missingSubtitles
  );

  function set<K extends keyof ShowFilters>(key: K, value: ShowFilters[K]) {
    setFilters((f: ShowFilters) => ({ ...f, [key]: value || undefined, page: 1 }));
  }

  function reset() {
    setFilters(EMPTY_FILTERS);
    setSearch("");
  }

  return (
    <div className="flex h-full">
      {/* Filter sidebar */}
      <div className="w-56 flex-shrink-0 bg-gray-900 border-r border-white/5 flex flex-col overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Filters</span>
          {hasActiveFilters && (
            <button onClick={reset} className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300">
              <X size={10} /> Reset
            </button>
          )}
        </div>

        <div className="p-4 space-y-5">
          {/* Status */}
          <div>
            <div className="text-xs text-gray-500 mb-2">Status</div>
            <select
              value={filters.status ?? ""}
              onChange={(e) => set("status", e.target.value)}
              className="w-full bg-gray-800 border border-white/10 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Any</option>
              {SHOW_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Missing metadata */}
          <div>
            <div className="text-xs text-gray-500 mb-2">Missing metadata</div>
            <div className="space-y-1.5">
              <Checkbox label="Unmatched (no TVDB/TMDB)" checked={filters.missingMetadata ?? false}
                onChange={(v) => set("missingMetadata", v || undefined)} />
            </div>
          </div>

          {/* Missing artwork */}
          <div>
            <div className="text-xs text-gray-500 mb-2">Missing artwork</div>
            <div className="space-y-1.5">
              <Checkbox label="Any active artwork" checked={filters.missingArtwork ?? false}
                onChange={(v) => set("missingArtwork", v || undefined)} />
              <Checkbox label="Poster" checked={filters.missingPoster ?? false}
                onChange={(v) => set("missingPoster", v || undefined)} />
            </div>
          </div>

          {/* Missing other */}
          <div>
            <div className="text-xs text-gray-500 mb-2">Missing other</div>
            <div className="space-y-1.5">
              <Checkbox label="Subtitles" checked={filters.missingSubtitles ?? false}
                onChange={(v) => set("missingSubtitles", v || undefined)} />
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-white/5 flex-shrink-0">
          <div className="relative flex-1 max-w-xs">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              placeholder="Search shows..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setFilters((f) => ({ ...f, page: 1 })); }}
              className="w-full bg-gray-900 border border-white/10 rounded-md pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Stats chips */}
          {stats && (
            <div className="flex gap-2 text-xs">
              {stats.unmatched > 0 && (
                <button
                  onClick={() => set("missingMetadata", true)}
                  className="px-2 py-1 bg-red-500/10 text-red-400 border border-red-500/20 rounded hover:bg-red-500/20"
                >
                  {stats.unmatched} unmatched
                </button>
              )}
              {stats.missingArtwork > 0 && (
                <button
                  onClick={() => set("missingArtwork", true)}
                  className="px-2 py-1 bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 rounded hover:bg-yellow-500/20"
                >
                  {stats.missingArtwork} no artwork
                </button>
              )}
              {stats.missingSubtitles > 0 && (
                <button
                  onClick={() => set("missingSubtitles", true)}
                  className="px-2 py-1 bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded hover:bg-purple-500/20"
                >
                  {stats.missingSubtitles} no subs
                </button>
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

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading && <p className="text-gray-500 text-sm">Loading...</p>}
          {!isLoading && data?.items.length === 0 && (
            <p className="text-gray-500 text-sm">No shows match the current filters.</p>
          )}

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

          {data && data.total > (filters.pageSize ?? 50) && (
            <div className="flex items-center gap-2 mt-6">
              <button
                onClick={() => setFilters((f: ShowFilters) => ({ ...f, page: Math.max(1, (f.page ?? 1) - 1) }))}
                disabled={(filters.page ?? 1) <= 1}
                className="px-3 py-1.5 text-sm bg-gray-900 border border-white/10 rounded disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-sm text-gray-400">
                Page {filters.page ?? 1} of {totalPages}
              </span>
              <button
                onClick={() => setFilters((f: ShowFilters) => ({ ...f, page: Math.min(totalPages, (f.page ?? 1) + 1) }))}
                disabled={(filters.page ?? 1) >= totalPages}
                className="px-3 py-1.5 text-sm bg-gray-900 border border-white/10 rounded disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </div>
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
