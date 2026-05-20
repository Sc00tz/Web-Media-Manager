import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { movieApi, showApi, renameApi, type RenamePreviewItem } from "../lib/api.js";
import { AlertTriangle, RotateCcw, Play, Eye, ChevronDown, ChevronRight, Loader } from "lucide-react";
import { clsx } from "clsx";

export function RenamePreview() {
  const [mediaType, setMediaType] = useState<"movie" | "episode">("movie");
  const [template, setTemplate] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<RenamePreviewItem[] | null>(null);
  const [hasConflicts, setHasConflicts] = useState(false);
  const [showTokens, setShowTokens] = useState(true);
  const [tokenFilter, setTokenFilter] = useState("");

  // Episode picker state
  const [selectedShowId, setSelectedShowId] = useState<string>("");
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);

  const { data: defaults } = useQuery({
    queryKey: ["rename-defaults"],
    queryFn: renameApi.defaults,
    staleTime: Infinity,
  });

  const { data: tokens } = useQuery({
    queryKey: ["rename-tokens"],
    queryFn: renameApi.tokens,
    staleTime: Infinity,
  });

  const currentDefault = mediaType === "movie" ? defaults?.movie : defaults?.episode;
  const currentTokens = (mediaType === "movie" ? tokens?.movie : tokens?.episode) ?? [];
  const filteredTokens = tokenFilter
    ? currentTokens.filter((t) => t.toLowerCase().includes(tokenFilter.toLowerCase()))
    : currentTokens;

  const { data: movies, isLoading: moviesLoading } = useQuery({
    queryKey: ["movies-rename"],
    queryFn: () => movieApi.list({ page: 1, pageSize: 200 }),
    enabled: mediaType === "movie",
  });

  const { data: shows, isLoading: showsLoading } = useQuery({
    queryKey: ["shows-rename"],
    queryFn: () => showApi.list({ page: 1, pageSize: 200 }),
    enabled: mediaType === "episode",
  });

  const validSeason = selectedSeason !== null && !isNaN(selectedSeason);
  const { data: seasonData } = useQuery({
    queryKey: ["season-episodes", selectedShowId, selectedSeason],
    queryFn: () => showApi.getSeason(selectedShowId, selectedSeason!),
    enabled: !!(selectedShowId && validSeason),
  });

  const { data: validation } = useQuery({
    queryKey: ["rename-validate", template || currentDefault, mediaType],
    queryFn: () => renameApi.validate(template || currentDefault || "", mediaType),
    enabled: !!(template || currentDefault),
  });

  const previewMutation = useMutation({
    mutationFn: () => renameApi.preview(Array.from(selectedIds), template || currentDefault || "", mediaType),
    onSuccess: (data) => { setPreview(data.items); setHasConflicts(data.hasConflicts); },
  });

  const executeMutation = useMutation({
    mutationFn: (dryRun: boolean) =>
      renameApi.execute(Array.from(selectedIds), template || currentDefault || "", mediaType, dryRun),
  });

  const journalQuery = useQuery({ queryKey: ["rename-journal"], queryFn: renameApi.journal });

  const undoMutation = useMutation({
    mutationFn: (batchId: string) => renameApi.undo(batchId),
    onSuccess: () => journalQuery.refetch(),
  });

  const movieItems = movies?.items ?? [];
  const allMoviesSelected = movieItems.length > 0 && movieItems.every((i) => selectedIds.has(i.id));

  const episodeItems = seasonData?.episodes ?? [];
  const allEpisodesSelected = episodeItems.length > 0 && episodeItems.every((e) => selectedIds.has(e.id));

  function insertToken(token: string) {
    setTemplate((t) => (t || currentDefault || "") + `{${token}}`);
  }

  const activeTemplate = template || currentDefault || "";

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <h1 className="text-2xl font-semibold">Rename Files</h1>

      {/* Media type */}
      <div className="flex gap-2">
        {(["movie", "episode"] as const).map((t) => (
          <button key={t} onClick={() => { setMediaType(t); setSelectedIds(new Set()); setPreview(null); }}
            className={clsx("px-4 py-2 text-sm rounded border capitalize transition-colors",
              mediaType === t ? "border-blue-500 text-blue-400 bg-blue-500/10" : "border-white/10 text-gray-400 hover:text-gray-200")}>
            {t}s
          </button>
        ))}
      </div>

      {/* Template editor */}
      <section className="bg-gray-900 border border-white/10 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Template</h2>
          <button onClick={() => setShowTokens((s) => !s)}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200">
            {showTokens ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            Tokens ({currentTokens.length})
          </button>
        </div>

        <input type="text" value={activeTemplate} onChange={(e) => setTemplate(e.target.value)}
          placeholder={currentDefault ?? "Enter template..."}
          className="w-full bg-gray-800 border border-white/10 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-500" />

        {validation && (
          <p className={clsx("text-xs", validation.valid ? "text-green-400" : "text-red-400")}>
            {validation.valid ? "✓ Valid" : validation.errors.join(" · ")}
          </p>
        )}

        {showTokens && (
          <div className="border border-white/10 rounded bg-gray-950 p-3 space-y-2">
            <input type="text" placeholder="Filter tokens..." value={tokenFilter}
              onChange={(e) => setTokenFilter(e.target.value)}
              className="w-full bg-gray-800 border border-white/10 rounded px-2 py-1 text-xs focus:outline-none" />
            <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
              {filteredTokens.map((t) => (
                <button key={t} onClick={() => insertToken(t)}
                  className="text-xs px-2 py-1 bg-gray-800 hover:bg-blue-600/30 border border-white/10 hover:border-blue-500/50 rounded font-mono transition-colors">
                  {`{${t}}`}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-600">
              Padding: <code className="text-gray-400">{"{Season:00}"}</code>→<code className="text-gray-400">01</code> &nbsp;
              Case: <code className="text-gray-400">{"{Movie Title:upper}"}</code>
            </p>
          </div>
        )}
      </section>

      {/* Movie selector */}
      {mediaType === "movie" && (
        <section className="bg-gray-900 border border-white/10 rounded-lg overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
            <input type="checkbox" checked={allMoviesSelected}
              onChange={() => {
                if (allMoviesSelected) setSelectedIds(new Set());
                else setSelectedIds(new Set(movieItems.map((i) => i.id)));
              }} className="rounded" />
            <span className="text-sm font-medium">Movies</span>
            {moviesLoading && <Loader size={12} className="animate-spin text-gray-500" />}
            <span className="text-xs text-gray-500 ml-auto">{selectedIds.size} of {movieItems.length} selected</span>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {moviesLoading && (
              <div className="px-4 py-6 text-center text-xs text-gray-500">Loading movies...</div>
            )}
            {!moviesLoading && movieItems.length === 0 && (
              <div className="px-4 py-6 text-center text-xs text-gray-500">No movies found.</div>
            )}
            {movieItems.map((movie) => (
              <label key={movie.id} className="flex items-center gap-3 px-4 py-2 hover:bg-white/5 cursor-pointer border-b border-white/5 last:border-0">
                <input type="checkbox" checked={selectedIds.has(movie.id)}
                  onChange={(e) => {
                    const n = new Set(selectedIds);
                    e.target.checked ? n.add(movie.id) : n.delete(movie.id);
                    setSelectedIds(n);
                  }} className="rounded" />
                <span className="flex-1 text-sm truncate">{movie.title}</span>
                {movie.year && <span className="text-xs text-gray-500 flex-shrink-0">{movie.year}</span>}
              </label>
            ))}
          </div>
        </section>
      )}

      {/* Episode selector */}
      {mediaType === "episode" && (
        <section className="bg-gray-900 border border-white/10 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10">
            <span className="text-sm font-medium">Select Show & Season</span>
          </div>
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Show</label>
                <select value={selectedShowId} onChange={(e) => { setSelectedShowId(e.target.value); setSelectedSeason(null); setSelectedIds(new Set()); }}
                  className="w-full bg-gray-800 border border-white/10 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500">
                  <option value="">— Select a show —</option>
                  {showsLoading && <option disabled>Loading...</option>}
                  {(shows?.items ?? []).map((s) => (
                    <option key={s.id} value={s.id}>{s.title}</option>
                  ))}
                </select>
              </div>
              {selectedShowId && (
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Season</label>
                  <ShowSeasonPicker showId={selectedShowId}
                    value={selectedSeason}
                    onChange={(n) => { setSelectedSeason(n); setSelectedIds(new Set()); }} />
                </div>
              )}
            </div>

            {selectedSeason !== null && (
              <div className="border border-white/10 rounded overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/10 bg-white/5">
                  <input type="checkbox" checked={allEpisodesSelected}
                    onChange={() => {
                      if (allEpisodesSelected) setSelectedIds(new Set());
                      else setSelectedIds(new Set(episodeItems.filter((e) => e.filePath).map((e) => e.id)));
                    }} className="rounded" />
                  <span className="text-xs font-medium">{episodeItems.length} episodes</span>
                  <span className="text-xs text-gray-500 ml-auto">{selectedIds.size} selected</span>
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {episodeItems.map((ep) => (
                    <label key={ep.id} className={clsx(
                      "flex items-center gap-3 px-4 py-2 border-b border-white/5 last:border-0",
                      ep.filePath ? "hover:bg-white/5 cursor-pointer" : "opacity-40 cursor-not-allowed"
                    )}>
                      <input type="checkbox" disabled={!ep.filePath} checked={selectedIds.has(ep.id)}
                        onChange={(e) => {
                          const n = new Set(selectedIds);
                          e.target.checked ? n.add(ep.id) : n.delete(ep.id);
                          setSelectedIds(n);
                        }} className="rounded" />
                      <span className="text-xs text-gray-500 w-10">E{String(ep.episodeNumber).padStart(2, "0")}</span>
                      <span className="flex-1 text-sm truncate">{ep.title ?? "Untitled"}</span>
                      {!ep.filePath && <span className="text-xs text-red-500">no file</span>}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Actions */}
      <div className="flex gap-3 flex-wrap">
        <button onClick={() => previewMutation.mutate()}
          disabled={selectedIds.size === 0 || !validation?.valid || previewMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-800 hover:bg-gray-700 border border-white/10 rounded disabled:opacity-40">
          <Eye size={14} />
          {previewMutation.isPending ? "Previewing..." : `Preview (${selectedIds.size} files)`}
        </button>
        <button onClick={() => executeMutation.mutate(true)}
          disabled={!preview || executeMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-yellow-600/20 hover:bg-yellow-600/30 border border-yellow-500/30 rounded text-yellow-400 disabled:opacity-40">
          <Play size={14} /> Dry Run
        </button>
        <button onClick={() => executeMutation.mutate(false)}
          disabled={!preview || hasConflicts || executeMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 rounded disabled:opacity-40">
          <Play size={14} />
          {executeMutation.isPending ? "Renaming..." : "Execute"}
        </button>
      </div>

      {executeMutation.isSuccess && (
        <p className={clsx("text-sm px-4 py-2 rounded border",
          executeMutation.data?.dryRun
            ? "text-yellow-400 bg-yellow-500/10 border-yellow-500/20"
            : "text-green-400 bg-green-500/10 border-green-500/20")}>
          {executeMutation.data?.dryRun ? "Dry run complete — no files changed" : "Rename jobs queued"}
        </p>
      )}

      {/* Preview table */}
      {preview && (
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium">Preview ({preview.length} files)</h2>
            {hasConflicts && (
              <span className="flex items-center gap-1 text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded px-2 py-0.5">
                <AlertTriangle size={10} /> Conflicts — duplicates would overwrite
              </span>
            )}
          </div>
          <div className="bg-gray-900 border border-white/10 rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/10 text-gray-400">
                  <th className="text-left px-4 py-2">Current path</th>
                  <th className="text-left px-4 py-2">New path</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((item) => (
                  <tr key={item.mediaId} className={clsx("border-b border-white/5 last:border-0 hover:bg-white/5", item.conflict && "bg-yellow-500/5")}>
                    <td className="px-4 py-2 font-mono text-gray-400 truncate max-w-[280px]">
                      <span title={item.oldPath}>{item.oldPath.split("/").slice(-2).join("/")}</span>
                    </td>
                    <td className={clsx("px-4 py-2 font-mono truncate max-w-[280px]",
                      item.error ? "text-red-400" : item.conflict ? "text-yellow-400" : "text-green-400")}>
                      {item.error
                        ? <span title={item.error}>Error: {item.error}</span>
                        : <span title={item.newPath}>{item.newPath.split("/").slice(-2).join("/")}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Undo journal */}
      {(journalQuery.data?.length ?? 0) > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-gray-400">Recent Rename Batches</h2>
          <div className="bg-gray-900 border border-white/10 rounded-lg overflow-hidden">
            {journalQuery.data?.map((batch) => (
              <div key={batch.batchId} className="flex items-center gap-3 px-4 py-2.5 border-b border-white/5 last:border-0">
                <div className="flex-1">
                  <div className="text-xs text-gray-400">{new Date(batch.executedAt).toLocaleString()}</div>
                  <div className="text-xs text-gray-600 font-mono">{batch.batchId.slice(0, 8)}</div>
                </div>
                {batch.undoneAt ? (
                  <span className="text-xs text-gray-600">Undone</span>
                ) : (
                  <button onClick={() => undoMutation.mutate(batch.batchId)} disabled={undoMutation.isPending}
                    className="flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300 disabled:opacity-40">
                    <RotateCcw size={11} /> Undo
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ShowSeasonPicker({ showId, value, onChange }: {
  showId: string;
  value: number | null;
  onChange: (n: number) => void;
}) {
  const { data: show } = useQuery({
    queryKey: ["show", showId],
    queryFn: () => import("../lib/api.js").then((m) => m.showApi.get(showId)),
  });

  return (
    <select value={value ?? ""} onChange={(e) => {
      const n = parseInt(e.target.value, 10);
      if (!isNaN(n)) onChange(n);
    }}
      className="w-full bg-gray-800 border border-white/10 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500">
      <option value="">— Select season —</option>
      {(show?.seasons ?? []).map((s) => (
        <option key={s.id} value={s.seasonNumber}>
          {s.seasonNumber === 0 ? "Specials" : `Season ${s.seasonNumber}`}
        </option>
      ))}
    </select>
  );
}
