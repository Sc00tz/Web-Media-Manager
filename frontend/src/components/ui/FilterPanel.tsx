import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { X } from "lucide-react";
import { movieApi, type MovieFiltersExtended } from "../../lib/api.js";

interface Props {
  filters: MovieFiltersExtended;
  onChange: (f: MovieFiltersExtended) => void;
  onReset: () => void;
}
const SORT_OPTIONS: Array<{ value: MovieFiltersExtended["sortBy"]; label: string }> = [
  { value: "title", label: "Title" },
  { value: "year", label: "Year" },
  { value: "updatedAt", label: "Date Added" },
  { value: "runtime", label: "Runtime" },
];

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer group">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded border-white/20 bg-gray-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
      />
      <span className="text-sm text-gray-300 group-hover:text-white">{label}</span>
    </label>
  );
}

export function MovieFilterPanel({ filters, onChange, onReset }: Props) {
  const { data: filterOptions } = useQuery({
    queryKey: ["movie-filter-options"],
    queryFn: movieApi.filterOptions,
    staleTime: 1000 * 60 * 5,
  });

  const hasActiveFilters = Boolean(
    filters.genre || filters.yearMin || filters.yearMax || filters.resolution ||
    filters.videoCodec || filters.missingArtwork || filters.missingMetadata || filters.missingSubtitles
  );

  function set<K extends keyof MovieFiltersExtended>(key: K, value: MovieFiltersExtended[K]) {
    onChange({ ...filters, [key]: value || undefined, page: 1 });
  }

  return (
    <div className="w-56 flex-shrink-0 bg-gray-900 border-r border-white/5 flex flex-col overflow-y-auto">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Filters</span>
        {hasActiveFilters && (
          <button onClick={onReset} className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300">
            <X size={10} /> Reset
          </button>
        )}
      </div>

      <div className="p-4 space-y-5">
        {/* Sort */}
        <div>
          <div className="text-xs text-gray-500 mb-2">Sort by</div>
          <div className="flex gap-1 flex-wrap">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  if (filters.sortBy === opt.value) {
                    set("sortDir", filters.sortDir === "asc" ? "desc" : "asc");
                  } else {
                    onChange({ ...filters, sortBy: opt.value, sortDir: "asc", page: 1 });
                  }
                }}
                className={clsx(
                  "px-2 py-1 text-xs rounded border transition-colors",
                  filters.sortBy === opt.value
                    ? "border-blue-500 text-blue-400 bg-blue-500/10"
                    : "border-white/10 text-gray-400 hover:text-gray-200"
                )}
              >
                {opt.label}
                {filters.sortBy === opt.value && (filters.sortDir === "asc" ? " ↑" : " ↓")}
              </button>
            ))}
          </div>
        </div>

        {/* Year range */}
        <div>
          <div className="text-xs text-gray-500 mb-2">Year range</div>
          <div className="flex gap-2 items-center">
            <input
              type="number"
              placeholder="From"
              value={filters.yearMin ?? ""}
              onChange={(e) => set("yearMin", e.target.value ? Number(e.target.value) : undefined)}
              className="w-full bg-gray-800 border border-white/10 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <span className="text-gray-600">–</span>
            <input
              type="number"
              placeholder="To"
              value={filters.yearMax ?? ""}
              onChange={(e) => set("yearMax", e.target.value ? Number(e.target.value) : undefined)}
              className="w-full bg-gray-800 border border-white/10 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Genre */}
        <div>
          <div className="text-xs text-gray-500 mb-2">Genre</div>
          <input
            type="text"
            placeholder="e.g. Action"
            value={filters.genre ?? ""}
            onChange={(e) => set("genre", e.target.value)}
            className="w-full bg-gray-800 border border-white/10 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Resolution */}
        <div>
          <div className="text-xs text-gray-500 mb-2">Resolution</div>
          <select
            value={filters.resolution ?? ""}
            onChange={(e) => set("resolution", e.target.value)}
            className="w-full bg-gray-800 border border-white/10 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">Any</option>
            {filterOptions?.resolutions.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>

        {/* Video codec */}
        <div>
          <div className="text-xs text-gray-500 mb-2">Video Codec</div>
          <select
            value={filters.videoCodec ?? ""}
            onChange={(e) => set("videoCodec", e.target.value)}
            className="w-full bg-gray-800 border border-white/10 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">Any</option>
            {filterOptions?.codecs.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {/* Missing artwork */}
        <div>
          <div className="text-xs text-gray-500 mb-2">Missing artwork</div>
          <div className="space-y-1.5">
            <Checkbox label="Poster" checked={filters.missingPoster ?? false} onChange={(v) => set("missingPoster", v || undefined)} />
            <Checkbox label="Backdrop / Fanart" checked={filters.missingBackdrop ?? false} onChange={(v) => set("missingBackdrop", v || undefined)} />
            <Checkbox label="Logo / ClearLogo" checked={filters.missingLogo ?? false} onChange={(v) => set("missingLogo", v || undefined)} />
            <Checkbox label="ClearArt" checked={filters.missingClearart ?? false} onChange={(v) => set("missingClearart", v || undefined)} />
          </div>
        </div>

        {/* Missing metadata */}
        <div>
          <div className="text-xs text-gray-500 mb-2">Missing metadata</div>
          <div className="space-y-1.5">
            <Checkbox label="Any metadata (unmatched)" checked={filters.missingMetadata ?? false} onChange={(v) => set("missingMetadata", v || undefined)} />
            <Checkbox label="Plot / Overview" checked={filters.missingPlot ?? false} onChange={(v) => set("missingPlot", v || undefined)} />
            <Checkbox label="Director" checked={filters.missingDirector ?? false} onChange={(v) => set("missingDirector", v || undefined)} />
            <Checkbox label="Subtitles" checked={filters.missingSubtitles ?? false} onChange={(v) => set("missingSubtitles", v || undefined)} />
            <Checkbox label="MediaInfo / Technical" checked={filters.missingMediaInfo ?? false} onChange={(v) => set("missingMediaInfo", v || undefined)} />
          </div>
        </div>
      </div>
    </div>
  );
}
