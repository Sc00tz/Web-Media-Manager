import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { movieApi, artworkDisplayUrl, type MovieSummary, type MovieFiltersExtended } from "../lib/api.js";
import { MovieDetailPanel } from "../components/media/MovieDetailPanel.js";
import { MovieFilterPanel } from "../components/ui/FilterPanel.js";
import { Search, RefreshCw } from "lucide-react";
import { clsx } from "clsx";
import { Badge } from "../components/ui/Badge.js";

const EMPTY_FILTERS: MovieFiltersExtended = {
  sortBy: "title",
  sortDir: "asc",
  page: 1,
  pageSize: 50,
};

const STATUS_VARIANT = {
  matched: "green",
  locked: "yellow",
  unmatched: "red",
} as const;

export function Movies() {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<MovieFiltersExtended>(EMPTY_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const activeFilters: MovieFiltersExtended = { ...filters, search: search || undefined };

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["movies", activeFilters],
    queryFn: () => movieApi.list(activeFilters),
    placeholderData: (prev) => prev,
  });

  const { data: stats } = useQuery({
    queryKey: ["movie-stats"],
    queryFn: movieApi.stats,
  });

  const scanMissingMutation = useMutation({
    mutationFn: movieApi.scanMissing,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["movie-stats"] }),
  });

  const totalPages = data ? Math.ceil(data.total / (filters.pageSize ?? 50)) : 1;

  return (
    <div className="flex h-full">
      {/* Filter sidebar */}
      <MovieFilterPanel
        filters={filters}
        onChange={setFilters}
        onReset={() => setFilters(EMPTY_FILTERS)}
      />

      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-white/5 flex-shrink-0">
          <div className="relative flex-1 max-w-xs">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              placeholder="Search movies..."
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
                  onClick={() => setFilters((f) => ({ ...f, missingMetadata: true, page: 1 }))}
                  className="px-2 py-1 bg-red-500/10 text-red-400 border border-red-500/20 rounded hover:bg-red-500/20"
                >
                  {stats.unmatched} unmatched
                </button>
              )}
              {stats.missingArtwork > 0 && (
                <button
                  onClick={() => setFilters((f) => ({ ...f, missingArtwork: true, page: 1 }))}
                  className="px-2 py-1 bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 rounded hover:bg-yellow-500/20"
                >
                  {stats.missingArtwork} no artwork
                </button>
              )}
            </div>
          )}

          <div className="ml-auto flex items-center gap-3">
            {isFetching && <RefreshCw size={12} className="animate-spin text-gray-500" />}
            <span className="text-sm text-gray-500">{data?.total ?? 0} movies</span>
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
            <p className="text-gray-500 text-sm">No movies match the current filters.</p>
          )}

          <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
            {data?.items.map((movie) => (
              <MovieCard
                key={movie.id}
                movie={movie}
                selected={selectedId === movie.id}
                onClick={() => setSelectedId(movie.id)}
              />
            ))}
          </div>

          {/* Pagination */}
          {data && data.total > (filters.pageSize ?? 50) && (
            <div className="flex items-center gap-2 mt-6">
              <button
                onClick={() => setFilters((f) => ({ ...f, page: Math.max(1, (f.page ?? 1) - 1) }))}
                disabled={(filters.page ?? 1) <= 1}
                className="px-3 py-1.5 text-sm bg-gray-900 border border-white/10 rounded disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-sm text-gray-400">
                Page {filters.page ?? 1} of {totalPages}
              </span>
              <button
                onClick={() => setFilters((f) => ({ ...f, page: Math.min(totalPages, (f.page ?? 1) + 1) }))}
                disabled={(filters.page ?? 1) >= totalPages}
                className="px-3 py-1.5 text-sm bg-gray-900 border border-white/10 rounded disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>

      <MovieDetailPanel movieId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}

function MovieCard({ movie, selected, onClick }: { movie: MovieSummary; selected: boolean; onClick: () => void }) {
  const posterUrl = artworkDisplayUrl({
    filePath: movie.posterFilePath ?? undefined,
    sourceUrl: movie.posterSourceUrl ?? undefined,
  });

  return (
    <button
      onClick={onClick}
      className={clsx(
        "text-left bg-gray-900 border rounded-lg overflow-hidden transition-all group",
        selected ? "border-blue-500 ring-1 ring-blue-500/50" : "border-white/5 hover:border-white/20"
      )}
    >
      <div className="aspect-[2/3] bg-gray-800 flex items-center justify-center relative overflow-hidden">
        {posterUrl ? (
          <img src={posterUrl} alt={movie.title} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <span className="text-gray-600 text-xs text-center px-2">{movie.title[0]}</span>
        )}
        <div className="absolute top-1 right-1">
          <Badge variant={STATUS_VARIANT[movie.status]}>{movie.status[0]!.toUpperCase()}</Badge>
        </div>
      </div>
      <div className="p-2">
        <div className="text-xs font-medium truncate leading-tight">{movie.title}</div>
        {movie.year && <div className="text-xs text-gray-500 mt-0.5">{movie.year}</div>}
      </div>
    </button>
  );
}
