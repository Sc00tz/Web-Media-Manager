import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Lock, Unlock, RefreshCw, Film, Download, Trash2, ExternalLink, Plus, Cpu } from "lucide-react";
import { movieApi, artworkApi, subtitleApi, trailerApi, artworkDisplayUrl, type MovieDetail, type ArtworkItem, type SubtitleItem } from "../../lib/api.js";
import { SlidePanel } from "../ui/SlidePanel.js";
import { Tabs } from "../ui/Tabs.js";
import { Badge } from "../ui/Badge.js";

const TABS = [
  { id: "metadata", label: "Metadata" },
  { id: "artwork", label: "Artwork" },
  { id: "cast", label: "Cast" },
  { id: "technical", label: "Technical" },
  { id: "subtitles", label: "Subtitles" },
  { id: "trailers", label: "Trailers" },
];

interface Props {
  movieId: string | null;
  onClose: () => void;
}

export function MovieDetailPanel({ movieId, onClose }: Props) {
  const [activeTab, setActiveTab] = useState("metadata");
  const queryClient = useQueryClient();

  const { data: movie, isLoading } = useQuery({
    queryKey: ["movie", movieId],
    queryFn: () => movieApi.get(movieId!),
    enabled: Boolean(movieId),
  });

  const scrapeMutation = useMutation({
    mutationFn: () => movieApi.scrape(movieId!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["movie", movieId] }),
  });

  const lockMutation = useMutation({
    mutationFn: (locked: boolean) => movieApi.patchMetadata(movieId!, { metadataLocked: locked }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["movie", movieId] });
      queryClient.invalidateQueries({ queryKey: ["movies"] });
    },
  });

  return (
    <SlidePanel open={Boolean(movieId)} onClose={onClose} title={movie?.title ?? "Movie"} width="w-[700px]">
      {isLoading && <div className="p-6 text-gray-500 text-sm">Loading...</div>}
      {movie && (
        <div className="flex flex-col h-full">
          {/* Action bar */}
          <div className="flex items-center gap-2 px-5 py-3 border-b border-white/10">
            <Badge variant={movie.status === "matched" ? "green" : movie.status === "locked" ? "yellow" : "red"}>
              {movie.status}
            </Badge>
            <div className="ml-auto flex gap-2">
              <button
                onClick={() => lockMutation.mutate(!movie.metadataLocked)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 rounded border border-white/10"
                title={movie.metadataLocked ? "Unlock metadata" : "Lock metadata"}
              >
                {movie.metadataLocked ? <Lock size={12} /> : <Unlock size={12} />}
                {movie.metadataLocked ? "Locked" : "Unlocked"}
              </button>
              <button
                onClick={() => scrapeMutation.mutate()}
                disabled={scrapeMutation.isPending || movie.metadataLocked}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 rounded disabled:opacity-40"
              >
                <RefreshCw size={12} className={scrapeMutation.isPending ? "animate-spin" : ""} />
                Rescrape
              </button>
            </div>
          </div>

          <Tabs tabs={TABS} active={activeTab} onChange={setActiveTab} />

          <div className="flex-1 overflow-y-auto p-5">
            {activeTab === "metadata" && <MetadataTab movie={movie} />}
            {activeTab === "artwork" && <ArtworkTab movieId={movie.id} />}
            {activeTab === "cast" && <CastTab movie={movie} />}
            {activeTab === "technical" && <TechnicalTab movie={movie} />}
            {activeTab === "subtitles" && <SubtitlesTab movieId={movie.id} />}
            {activeTab === "trailers" && <TrailersTab movieId={movie.id} />}
          </div>
        </div>
      )}
    </SlidePanel>
  );
}

function MField({ label, children }: { label: string; children?: React.ReactNode }) {
  if (!children && children !== 0) return null;
  return (
    <div className="grid grid-cols-[150px_1fr] gap-2 py-2 border-b border-white/5 items-start">
      <dt className="text-xs text-gray-500 pt-0.5 shrink-0">{label}</dt>
      <dd className="text-sm text-gray-200 break-words">{children}</dd>
    </div>
  );
}

function MetadataTab({ movie }: { movie: MovieDetail }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    title: movie.title,
    originalTitle: movie.originalTitle ?? "",
    sortTitle: movie.sortTitle ?? "",
    tagline: movie.tagline ?? "",
    plot: movie.plot ?? "",
    year: movie.year ?? "",
    releaseDate: movie.releaseDate ?? "",
    runtime: movie.runtime ?? "",
    certification: movie.certification ?? "",
    edition: movie.edition ?? "",
    country: movie.country ?? "",
    originalLanguage: movie.originalLanguage ?? "",
    criticRating: movie.criticRating ?? "",
    imdbId: movie.imdbId ?? "",
    tmdbId: movie.tmdbId ?? "",
    collectionName: movie.collectionName ?? "",
    genres: movie.genres.join(", "),
    studios: movie.studios.join(", "),
    writers: movie.writers?.join(", ") ?? "",
    countries: movie.countries?.join(", ") ?? "",
    tags: movie.tags.join(", "),
  });
  const queryClient = useQueryClient();

  const directors = movie.crew?.filter((c) => c.job === "Director").map((c) => c.name).join(", ");
  const writers = movie.crew?.filter((c) => ["Screenplay", "Writer", "Story", "Novel"].includes(c.job ?? "")).map((c) => c.name).join(", ");
  const topCast = movie.cast?.slice(0, 6).map((c) => c.name).join(", ");
  const primaryRating = movie.ratings?.[0];

  const saveMutation = useMutation({
    mutationFn: () =>
      movieApi.patchMetadata(movie.id, {
        title: draft.title,
        originalTitle: draft.originalTitle || undefined,
        sortTitle: draft.sortTitle || undefined,
        plot: draft.plot || undefined,
        year: toInt(draft.year),
        releaseDate: draft.releaseDate || undefined,
        runtime: toInt(draft.runtime),
        certification: draft.certification || undefined,
        tagline: draft.tagline || undefined,
        edition: draft.edition || undefined,
        country: draft.country || undefined,
        originalLanguage: draft.originalLanguage || undefined,
        criticRating: toInt(draft.criticRating),
        imdbId: draft.imdbId || undefined,
        tmdbId: toInt(draft.tmdbId),
        collectionName: draft.collectionName || undefined,
        genres: draft.genres.split(",").map((s) => s.trim()).filter(Boolean),
        studios: draft.studios.split(",").map((s) => s.trim()).filter(Boolean),
        writers: draft.writers.split(",").map((s) => s.trim()).filter(Boolean),
        countries: draft.countries.split(",").map((s) => s.trim()).filter(Boolean),
        tags: draft.tags.split(",").map((s) => s.trim()).filter(Boolean),
      }),
    onSuccess: () => {
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ["movie", movie.id] });
    },
  });

  if (!editing) {
    return (
      <div className="space-y-1">
        <div className="flex justify-end mb-2">
          <button onClick={() => setEditing(true)} disabled={movie.metadataLocked}
            className="text-xs px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded border border-white/10 disabled:opacity-40">
            Edit
          </button>
        </div>

        {/* Core */}
        <dl>
          <MField label="Title">{movie.title}</MField>
          <MField label="Original Title">{movie.originalTitle}</MField>
          <MField label="Sort Title">{movie.sortTitle}</MField>
          <MField label="Edition">{movie.edition}</MField>
          <MField label="Year">{movie.year}</MField>
          <MField label="Release Date">{movie.releaseDate}</MField>
          <MField label="Runtime">{movie.runtime ? `${movie.runtime} min` : undefined}</MField>
          <MField label="Certification">{movie.certification}</MField>
          <MField label="Original Language">{movie.originalLanguage}</MField>
          <MField label="Country">{movie.countries?.join(", ") || movie.country}</MField>
        </dl>

        {/* IDs */}
        <div className="pt-2 pb-1">
          <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1">Identifiers</div>
          <dl>
            <MField label="TMDB ID">{movie.tmdbId}</MField>
            <MField label="IMDB ID">{movie.imdbId}</MField>
            <MField label="Collection">{movie.collectionName}</MField>
          </dl>
        </div>

        {/* Ratings */}
        {(movie.ratings?.length > 0 || movie.criticRating) && (
          <div className="pt-2 pb-1">
            <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1">Ratings</div>
            <dl>
              {movie.ratings?.map((r) => (
                <MField key={r.source} label={r.source.toUpperCase()}>
                  {parseFloat(r.value).toFixed(1)}{r.votes ? ` / 10 (${r.votes.toLocaleString()} votes)` : " / 10"}
                </MField>
              ))}
              <MField label="Critic Score">{movie.criticRating ? `${movie.criticRating}%` : undefined}</MField>
            </dl>
          </div>
        )}

        {/* People */}
        <div className="pt-2 pb-1">
          <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1">People</div>
          <dl>
            <MField label="Director(s)">{directors || undefined}</MField>
            <MField label="Writer(s)">{(movie.writers?.join(", ")) || writers || undefined}</MField>
            <MField label="Top Cast">{topCast || undefined}</MField>
            <MField label="Full Cast">{movie.cast?.length ? `${movie.cast.length} people — see Cast tab` : undefined}</MField>
          </dl>
        </div>

        {/* Genre & production */}
        <div className="pt-2 pb-1">
          <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1">Production</div>
          <dl>
            <MField label="Genres">{movie.genres?.join(", ") || undefined}</MField>
            <MField label="Studios">{movie.studios?.join(", ") || undefined}</MField>
            <MField label="Tags">{movie.tags?.join(", ") || undefined}</MField>
          </dl>
        </div>

        {/* Tagline + Plot */}
        {movie.tagline && (
          <div className="pt-2">
            <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1">Tagline</div>
            <p className="text-sm text-gray-300 italic">"{movie.tagline}"</p>
          </div>
        )}
        {movie.plot && (
          <div className="pt-2">
            <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1">Plot / Overview</div>
            <p className="text-sm text-gray-300 leading-relaxed">{movie.plot}</p>
          </div>
        )}
      </div>
    );
  }

  // Edit form
  const textField = (key: keyof typeof draft, label: string, hint?: string) => (
    <div key={key}>
      <label className="block text-xs text-gray-400 mb-1">{label}{hint && <span className="text-gray-600 ml-1">{hint}</span>}</label>
      <input value={String(draft[key])} onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
        className="w-full bg-gray-800 border border-white/10 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
    </div>
  );

  return (
    <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }} className="space-y-3">
      {textField("title", "Title")}
      {textField("originalTitle", "Original Title")}
      {textField("sortTitle", "Sort Title", "(auto-computed if blank)")}
      {textField("edition", "Edition", "(e.g. Director's Cut, Extended, IMAX, Remastered)")}
      {textField("tagline", "Tagline")}
      <div className="grid grid-cols-2 gap-3">
        {textField("year", "Year")}
        {textField("releaseDate", "Release Date", "(YYYY-MM-DD)")}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {textField("runtime", "Runtime (min)")}
        {textField("certification", "Certification / Rating")}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {textField("originalLanguage", "Original Language", "(e.g. en, fr)")}
        {textField("criticRating", "Critic Score", "(0–100%)")}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {textField("tmdbId", "TMDB ID")}
        {textField("imdbId", "IMDB ID")}
      </div>
      {textField("collectionName", "Collection / Franchise")}
      <div>
        <label className="block text-xs text-gray-400 mb-1">Plot / Overview</label>
        <textarea rows={5} value={draft.plot} onChange={(e) => setDraft((d) => ({ ...d, plot: e.target.value }))}
          className="w-full bg-gray-800 border border-white/10 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none" />
      </div>
      {(["genres", "studios", "writers", "countries", "tags"] as const).map((k) => (
        <div key={k}>
          <label className="block text-xs text-gray-400 mb-1 capitalize">
            {k === "writers" ? "Writers / Screenplay" : k === "countries" ? "Countries" : k}
            <span className="text-gray-600 ml-1">(comma-separated)</span>
          </label>
          <input value={draft[k]} onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
            className="w-full bg-gray-800 border border-white/10 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
        </div>
      ))}
      <div className="flex gap-2 pt-2">
        <button type="submit" disabled={saveMutation.isPending}
          className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 rounded disabled:opacity-50">
          {saveMutation.isPending ? "Saving..." : "Save"}
        </button>
        <button type="button" onClick={() => setEditing(false)}
          className="px-4 py-2 text-sm bg-gray-800 hover:bg-gray-700 rounded border border-white/10">
          Cancel
        </button>
      </div>
    </form>
  );
}

const ARTWORK_TYPES = ["poster", "backdrop", "logo", "clearlogo", "clearart", "disc", "banner", "thumb"] as const;

const ARTWORK_BASENAME: Record<string, string> = {
  poster: "poster", backdrop: "fanart", logo: "logo",
  clearlogo: "clearlogo", clearart: "clearart", disc: "disc", banner: "landscape", thumb: "thumb",
};

function ArtworkTab({ movieId }: { movieId: string }) {
  const queryClient = useQueryClient();
  const [addUrl, setAddUrl] = useState("");
  const [addType, setAddType] = useState("poster");

  const { data: artwork, isLoading } = useQuery({
    queryKey: ["movie-artwork", movieId],
    queryFn: () => artworkApi.movieList(movieId),
  });

  const refreshMutation = useMutation({
    mutationFn: () => artworkApi.movieRefresh(movieId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["movie-artwork", movieId] }),
  });

  const activateMutation = useMutation({
    mutationFn: (artworkId: string) => artworkApi.movieActivate(movieId, artworkId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["movie-artwork", movieId] }),
  });

  const addUrlMutation = useMutation({
    mutationFn: () => artworkApi.movieAddUrl(movieId, addUrl, addType),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["movie-artwork", movieId] });
      setAddUrl("");
    },
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => artworkApi.movieUploadFile(movieId, file, addType),
    onSuccess: () => queryClient.refetchQueries({ queryKey: ["movie-artwork", movieId] }),
  });

  const typeGroups = artwork?.reduce<Record<string, ArtworkItem[]>>((acc, a) => {
    (acc[a.type] ??= []).push(a);
    return acc;
  }, {}) ?? {};

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <button
          onClick={() => refreshMutation.mutate()}
          disabled={refreshMutation.isPending}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded border border-white/10 disabled:opacity-40"
        >
          <RefreshCw size={12} className={refreshMutation.isPending ? "animate-spin" : ""} />
          {refreshMutation.isPending ? "Fetching..." : "Fetch from providers"}
        </button>
        {refreshMutation.isSuccess && <span className="text-xs text-green-400">Done — new artwork below</span>}
      </div>

      {/* Type selector shared by both add-by-URL and upload */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500">Type:</span>
        <select
          value={addType}
          onChange={(e) => setAddType(e.target.value)}
          className="bg-gray-800 border border-white/10 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {ARTWORK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {/* Add by URL */}
      <form
        onSubmit={(e) => { e.preventDefault(); if (addUrl) addUrlMutation.mutate(); }}
        className="flex gap-2"
      >
        <input
          type="url"
          placeholder="Paste image URL..."
          value={addUrl}
          onChange={(e) => setAddUrl(e.target.value)}
          className="flex-1 bg-gray-800 border border-white/10 rounded px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={!addUrl || addUrlMutation.isPending}
          className="flex items-center gap-1 px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 border border-white/10 rounded disabled:opacity-40"
        >
          <Plus size={11} /> URL
        </button>
      </form>

      {/* Upload local file */}
      <div className="space-y-2">
        <label className={`flex items-center justify-center gap-2 w-full px-4 py-3 rounded border-2 border-dashed cursor-pointer transition-colors
          ${uploadMutation.isPending
            ? "border-blue-500/50 bg-blue-500/5 cursor-wait"
            : uploadMutation.isSuccess
              ? "border-green-500/50 bg-green-500/5"
              : uploadMutation.isError
                ? "border-red-500/50 bg-red-500/5"
                : "border-white/20 hover:border-white/40 hover:bg-white/5"}`}>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={uploadMutation.isPending}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadMutation.mutate(file);
              e.target.value = "";
            }}
          />
          {uploadMutation.isPending ? (
            <>
              <RefreshCw size={14} className="animate-spin text-blue-400" />
              <span className="text-sm text-blue-400">Uploading…</span>
            </>
          ) : uploadMutation.isSuccess ? (
            <>
              <span className="text-green-400 text-lg">✓</span>
              <span className="text-sm text-green-400 font-medium">
                Saved as {uploadMutation.data && "filePath" in (uploadMutation.data as object)
                  ? (uploadMutation.data as { filePath: string }).filePath.split("/").pop()
                  : `${ARTWORK_BASENAME[addType] ?? addType}.jpg`}
              </span>
            </>
          ) : uploadMutation.isError ? (
            <>
              <span className="text-red-400 text-lg">✕</span>
              <span className="text-sm text-red-400">{String(uploadMutation.error)}</span>
            </>
          ) : (
            <>
              <Plus size={14} className="text-gray-400" />
              <span className="text-sm text-gray-300">Click to upload image file</span>
            </>
          )}
        </label>
        <p className="text-[10px] text-gray-600">Saved next to your media file as <code>{ARTWORK_BASENAME[addType] ?? addType}.jpg</code> — Jellyfin picks it up automatically. Overwrites existing.</p>
      </div>

      {isLoading && <p className="text-sm text-gray-500">Loading artwork...</p>}
      {!isLoading && !artwork?.length && (
        <p className="text-sm text-gray-500">No artwork yet. Fetch from providers or paste a URL above.</p>
      )}

      {Object.entries(typeGroups).map(([type, items]) => (
        <div key={type}>
          <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2 capitalize">{type.replace("_", " ")}</h3>
          <div className="grid grid-cols-3 gap-2">
            {items.map((art) => {
              const displayUrl = artworkDisplayUrl(art);
              return (
              <div
                key={art.id}
                className={`relative rounded overflow-hidden border-2 cursor-pointer transition-all ${art.active ? "border-blue-500" : "border-white/10 hover:border-white/30"}`}
                onClick={() => { if (!art.active) activateMutation.mutate(art.id); }}
              >
                {displayUrl ? (
                  <img
                    src={displayUrl}
                    alt={type}
                    className="w-full h-auto object-cover"
                    loading="eager"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                      (e.target as HTMLImageElement).nextElementSibling?.removeAttribute("hidden");
                    }}
                  />
                ) : null}
                <div className={displayUrl ? "hidden" : ""} aria-hidden="true">
                  <div className="aspect-[2/3] bg-gray-800 flex items-center justify-center">
                    <Film size={20} className="text-gray-600" />
                  </div>
                </div>
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1 text-xs flex justify-between">
                  <span className="text-gray-300">{art.source}</span>
                  {art.width && <span className="text-gray-500">{art.width}×{art.height}</span>}
                </div>
                {art.active && (
                  <div className="absolute top-1 right-1 bg-blue-500 text-white text-xs px-1.5 py-0.5 rounded">Active</div>
                )}
              </div>
            );})}
          </div>
        </div>
      ))}
    </div>
  );
}

function CastAvatar({ name, profilePath }: { name: string; profilePath?: string }) {
  const [imgFailed, setImgFailed] = useState(false);

  // Local filesystem paths go through the local file server.
  // HTTP URLs (TMDB, TVDB CDN) load directly — they have proper CORS headers and no proxy needed.
  const imgSrc = profilePath
    ? (profilePath.startsWith("/") || profilePath.startsWith("\\")
        ? `/api/artwork/local?path=${encodeURIComponent(profilePath)}`
        : profilePath)
    : undefined;

  return (
    <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0 overflow-hidden">
      {imgSrc && !imgFailed ? (
        <img src={imgSrc} alt={name} className="w-full h-full object-cover" loading="eager"
          onError={() => setImgFailed(true)} />
      ) : (
        <span className="text-xs text-gray-400">{name[0]?.toUpperCase()}</span>
      )}
    </div>
  );
}

function CastTab({ movie }: { movie: MovieDetail }) {
  return (
    <div className="space-y-2">
      {movie.cast.length === 0 && <p className="text-sm text-gray-500">No cast information. Scrape from TMDB to populate cast with images.</p>}
      {movie.cast.map((c) => (
        <div key={c.id} className="flex items-center gap-3 py-2 border-b border-white/5">
          <CastAvatar name={c.name} profilePath={c.profilePath} />
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">{c.name}</div>
            {c.character && <div className="text-xs text-gray-500 truncate">{c.character}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

function toInt(s: string | number | undefined | null): number | undefined {
  if (s === "" || s === null || s === undefined) return undefined;
  const n = parseInt(String(s), 10);
  return isNaN(n) ? undefined : n;
}

function fmtBitrate(bps: number | undefined | null): string | undefined {
  if (!bps) return undefined;
  return bps > 1_000_000 ? `${(bps / 1_000_000).toFixed(1)} Mbps` : `${Math.round(bps / 1000)} kbps`;
}

function fmtDuration(s: number | undefined | null): string | undefined {
  if (!s) return undefined;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}h ${m}m ${sec}s` : `${m}m ${sec}s`;
}

function chLabel(n: number | undefined): string | undefined {
  if (!n) return undefined;
  const map: Record<number, string> = { 1: "1.0 Mono", 2: "2.0 Stereo", 6: "5.1", 7: "6.1", 8: "7.1", 10: "7.1.2", 12: "7.1.4", 16: "7.1.4" };
  return map[n] ?? `${n}ch`;
}

function TechSection({ title, color, children }: { title: string; color?: string; children: React.ReactNode }) {
  const border = color === "blue" ? "border-blue-500/40" : color === "green" ? "border-green-500/40" : color === "purple" ? "border-purple-500/40" : "border-white/15";
  return (
    <div className={`border-l-2 pl-3 ${border} space-y-0.5`}>
      <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1">{title}</div>
      {children}
    </div>
  );
}

function TechRow({ label, children }: { label: string; children?: React.ReactNode }) {
  if (children === null || children === undefined || children === "") return null;
  return (
    <div className="grid grid-cols-[130px_1fr] gap-1 text-xs">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-200">{children}</span>
    </div>
  );
}

function TechnicalTab({ movie }: { movie: MovieDetail }) {
  const queryClient = useQueryClient();
  const [scanning, setScanning] = useState(false);
  const info = movie.mediaInfo;
  const streams = info?.streamsJson;

  // When a scan is queued, poll the parent movie query until mediaInfo appears
  useEffect(() => {
    if (!scanning) return;
    if (info) { setScanning(false); return; }
    const interval = setInterval(
      () => queryClient.invalidateQueries({ queryKey: ["movie", movie.id] }),
      2000
    );
    return () => clearInterval(interval);
  }, [scanning, info, movie.id, queryClient]);

  const scanMutation = useMutation({
    mutationFn: () => movieApi.scanMediaInfo(movie.id),
    onSuccess: () => setScanning(true),
  });

  const isBusy = scanMutation.isPending || scanning;
  const rescanBtn = (
    <button onClick={() => scanMutation.mutate()} disabled={isBusy}
      className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-white/10 rounded disabled:opacity-40">
      <Cpu size={11} className={isBusy ? "animate-pulse" : ""} />
      {isBusy ? "Scanning..." : info ? "Rescan" : "Run MediaInfo Scan"}
    </button>
  );

  if (!info) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-400">No technical information yet.</p>
        {rescanBtn}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">{rescanBtn}</div>

      <TechSection title="General">
        <TechRow label="Container">{info.container}</TechRow>
        <TechRow label="Duration">{fmtDuration(info.durationSeconds)}</TechRow>
        <TechRow label="Overall bitrate">{fmtBitrate(info.bitrate)}</TechRow>
        <TechRow label="File">{movie.filePath.split("/").slice(-1)[0]}</TechRow>
        <TechRow label="Path">{movie.filePath.split("/").slice(0, -1).join("/")}</TechRow>
      </TechSection>

      {(streams?.video.length ? streams.video : info.videoCodec ? [{ codec: info.videoCodec, resolution: info.resolution ?? "", hdrFormat: info.hdrFormat }] : []).map((v, i) => (
        <TechSection key={i} title={`Video${(streams?.video.length ?? 0) > 1 ? ` Track ${i + 1}` : ""}`} color="blue">
          <TechRow label="Codec">{v.codec}{"profile" in v && v.profile ? ` ${v.profile}` : ""}</TechRow>
          <TechRow label="Resolution">{"resolution" in v ? v.resolution : info.resolution}</TechRow>
          {"bitDepth" in v && <TechRow label="Bit depth">{v.bitDepth ? `${v.bitDepth}-bit` : undefined}</TechRow>}
          <TechRow label="HDR">{("hdrFormat" in v ? v.hdrFormat : undefined) ?? info.hdrFormat}</TechRow>
          {"frameRate" in v && <TechRow label="Frame rate">{v.frameRate}</TechRow>}
          {"aspectRatio" in v && <TechRow label="Aspect ratio">{v.aspectRatio}</TechRow>}
          {"bitrate" in v && <TechRow label="Bitrate">{fmtBitrate(v.bitrate)}</TechRow>}
        </TechSection>
      ))}

      {(streams?.audio.length ? streams.audio : info.audioCodec ? [{ codec: info.audioCodec, channels: info.audioChannels }] : []).map((a, i) => (
        <TechSection key={i} title={`Audio Track ${i + 1}${"languageName" in a && a.languageName ? ` — ${a.languageName}` : "language" in a && a.language ? ` — ${a.language}` : ""}`} color="green">
          <TechRow label="Codec">{"commercial" in a && a.commercial ? a.commercial : a.codec}</TechRow>
          <TechRow label="Channels">{chLabel(a.channels)}</TechRow>
          {"channelLayout" in a && <TechRow label="Layout">{a.channelLayout}</TechRow>}
          {"language" in a && <TechRow label="Language">{("languageName" in a ? a.languageName : undefined) ?? a.language}</TechRow>}
          {"bitrate" in a && <TechRow label="Bitrate">{fmtBitrate(a.bitrate)}</TechRow>}
          {"default" in a && a.default && <TechRow label="Default">Yes</TechRow>}
        </TechSection>
      ))}

      {((streams?.subtitles.length ?? 0) > 0 || (info.subtitleTracks?.length ?? 0) > 0) && (
        <TechSection title={`Subtitles — ${streams?.subtitles.length ?? info.subtitleTracks?.length ?? 0} track${(streams?.subtitles.length ?? info.subtitleTracks?.length ?? 0) !== 1 ? "s" : ""}`} color="purple">
          {(streams?.subtitles ?? []).map((s, i) => (
            <div key={i} className="flex items-center gap-2 text-xs py-0.5">
              <span className="text-gray-600 w-5">#{i + 1}</span>
              <span className="flex-1 text-gray-200">{s.languageName ?? s.language ?? "Unknown"}</span>
              <span className="text-gray-500">{s.codec}</span>
              {s.title && <span className="text-gray-600 truncate max-w-[100px]" title={s.title}>{s.title}</span>}
              {s.forced && <span className="text-yellow-500 bg-yellow-500/10 px-1 rounded text-[10px]">Forced</span>}
              {s.default && <span className="text-blue-400 bg-blue-500/10 px-1 rounded text-[10px]">Default</span>}
            </div>
          ))}
          {!streams?.subtitles.length && info.subtitleTracks?.map((lang, i) => (
            <div key={i} className="flex items-center gap-2 text-xs py-0.5">
              <span className="text-gray-600 w-5">#{i + 1}</span>
              <span className="text-gray-200">{lang}</span>
            </div>
          ))}
        </TechSection>
      )}
    </div>
  );
}

function SubtitlesTab({ movieId }: { movieId: string }) {
  const [language, setLanguage] = useState("en");
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const [queuedIds, setQueuedIds] = useState<Set<string>>(new Set());
  const [downloadErrors, setDownloadErrors] = useState<Record<string, string>>({});
  const queryClient = useQueryClient();

  // Poll every 3 seconds while waiting for any background download to complete
  const hasPending = (subs: SubtitleItem[] | undefined) =>
    subs?.some((s) => !s.filePath && queuedIds.has(s.id)) ?? false;

  const { data: subs, isLoading } = useQuery({
    queryKey: ["movie-subtitles", movieId],
    queryFn: () => subtitleApi.movieList(movieId),
    refetchInterval: (query) => hasPending(query.state.data as SubtitleItem[] | undefined) ? 3000 : false,
  });

  // Clear queued state when the file path appears in the polled data
  useEffect(() => {
    if (!subs) return;
    const nowDownloaded = subs.filter((s) => s.filePath && queuedIds.has(s.id)).map((s) => s.id);
    if (nowDownloaded.length) {
      setQueuedIds((prev) => { const n = new Set(prev); nowDownloaded.forEach((id) => n.delete(id)); return n; });
    }
  }, [subs]);

  const searchMutation = useMutation({
    mutationFn: () => subtitleApi.movieSearch(movieId, language),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["movie-subtitles", movieId] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (subtitleId: string) => subtitleApi.movieDelete(movieId, subtitleId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["movie-subtitles", movieId] }),
  });

  async function handleDownload(subId: string) {
    setDownloadingIds((prev) => new Set(prev).add(subId));
    setDownloadErrors((prev) => { const n = { ...prev }; delete n[subId]; return n; });
    try {
      await subtitleApi.movieDownload(movieId, subId);
      setQueuedIds((prev) => new Set(prev).add(subId));
    } catch (err) {
      setDownloadErrors((prev) => ({ ...prev, [subId]: String(err) }));
    } finally {
      setDownloadingIds((prev) => { const n = new Set(prev); n.delete(subId); return n; });
    }
  }

  function releaseName(sub: SubtitleItem): string {
    if (sub.filePath) return sub.filePath.split("/").pop() ?? "";
    if (sub.source?.includes("|")) return sub.source.split("|").slice(1).join("|");
    return "";
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <select value={language} onChange={(e) => setLanguage(e.target.value)}
          className="bg-gray-800 border border-white/10 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500">
          {["en", "es", "fr", "de", "pt", "it", "nl", "ja", "ko", "zh"].map((l) => (
            <option key={l} value={l}>{l.toUpperCase()}</option>
          ))}
        </select>
        <button onClick={() => searchMutation.mutate()} disabled={searchMutation.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 rounded disabled:opacity-40">
          <RefreshCw size={12} className={searchMutation.isPending ? "animate-spin" : ""} />
          {searchMutation.isPending ? "Searching..." : "Search"}
        </button>
        {searchMutation.isSuccess && (
          <span className="text-xs text-green-400">Found {searchMutation.data?.found ?? 0} results</span>
        )}
        {searchMutation.isError && (
          <span className="text-xs text-red-400">{String(searchMutation.error)}</span>
        )}
      </div>

      {isLoading && <p className="text-sm text-gray-500">Loading...</p>}
      {!isLoading && !subs?.length && (
        <p className="text-sm text-gray-500">No subtitles found. Use Search to find subtitles.</p>
      )}

      <div className="space-y-1.5">
        {subs?.map((sub) => {
          const isDownloading = downloadingIds.has(sub.id);
          const isQueued = queuedIds.has(sub.id) && !sub.filePath;
          const dlError = downloadErrors[sub.id];
          const name = releaseName(sub);

          return (
            <div key={sub.id} className="flex items-start gap-2 bg-gray-800 rounded px-3 py-2.5">
              <div className="flex flex-wrap gap-1 items-center flex-shrink-0 pt-0.5">
                <Badge variant={sub.filePath ? "green" : isQueued ? "blue" : "default"}>
                  {sub.language.toUpperCase()}
                </Badge>
                {sub.forced && <Badge variant="yellow">Forced</Badge>}
                {sub.sdh && <Badge variant="blue">SDH</Badge>}
              </div>

              <div className="flex-1 min-w-0">
                {name && (
                  <div className="text-xs text-gray-200 truncate" title={name}>{name}</div>
                )}
                <div className="text-xs text-gray-500 mt-0.5">
                  {sub.filePath
                    ? `Saved: ${sub.filePath.split("/").slice(-2).join("/")}`
                    : isQueued
                      ? "⏳ Downloading in background…"
                      : isDownloading
                        ? "Queuing…"
                        : dlError
                          ? <span className="text-red-400">{dlError}</span>
                          : "Not downloaded"}
                </div>
              </div>

              <div className="flex gap-1 flex-shrink-0 items-center">
                {!sub.filePath && !isQueued && (
                  <button
                    onClick={() => handleDownload(sub.id)}
                    disabled={isDownloading}
                    title="Download subtitle"
                    className="flex items-center gap-1 text-xs px-2 py-1 bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 rounded disabled:opacity-40"
                  >
                    {isDownloading
                      ? <RefreshCw size={11} className="animate-spin" />
                      : <Download size={11} />}
                    {isDownloading ? "…" : "Get"}
                  </button>
                )}
                {isQueued && (
                  <span className="text-xs text-blue-400 px-2">Queued</span>
                )}
                {sub.filePath && (
                  <span className="text-xs text-green-400 px-2">✓ Done</span>
                )}
                <button
                  onClick={() => deleteMutation.mutate(sub.id)}
                  title="Remove from list"
                  className="text-gray-600 hover:text-red-400 p-1"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {queuedIds.size > 0 && (
        <p className="text-xs text-gray-500 italic">
          Downloads are processing in the background — this list updates automatically.
        </p>
      )}
    </div>
  );
}

function TrailersTab({ movieId }: { movieId: string }) {
  const [newUrl, setNewUrl] = useState("");
  const [newName, setNewName] = useState("");
  const queryClient = useQueryClient();

  const { data: trailers, isLoading } = useQuery({
    queryKey: ["movie-trailers", movieId],
    queryFn: () => trailerApi.list(movieId),
  });

  const fetchMutation = useMutation({
    mutationFn: () => trailerApi.fetchFromTmdb(movieId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["movie-trailers", movieId] }),
    onError: () => {}, // errors surfaced inline below
  });

  const addMutation = useMutation({
    mutationFn: () => trailerApi.add(movieId, { name: newName || "Trailer", url: newUrl }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["movie-trailers", movieId] });
      setNewUrl("");
      setNewName("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (trailerId: string) => trailerApi.delete(movieId, trailerId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["movie-trailers", movieId] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          onClick={() => fetchMutation.mutate()}
          disabled={fetchMutation.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 border border-white/10 rounded disabled:opacity-40"
        >
          <RefreshCw size={12} className={fetchMutation.isPending ? "animate-spin" : ""} />
          {fetchMutation.isPending ? "Fetching…" : "Fetch from TMDB"}
        </button>
        {fetchMutation.isSuccess && (
          <span className="text-xs self-center text-green-400">
            {(fetchMutation.data?.added ?? 0) > 0
              ? `${fetchMutation.data!.added} trailer${fetchMutation.data!.added === 1 ? "" : "s"} added`
              : "No new trailers found"}
          </span>
        )}
        {fetchMutation.isError && (
          <span className="text-xs self-center text-red-400">
            {String(fetchMutation.error)}
          </span>
        )}
      </div>

      {isLoading && <p className="text-sm text-gray-500">Loading...</p>}

      <div className="space-y-2">
        {trailers?.map((trailer) => (
          <div key={trailer.id} className="flex items-center gap-3 bg-gray-800 rounded px-3 py-2">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{trailer.name}</div>
              <div className="text-xs text-gray-500 truncate">{trailer.url}</div>
            </div>
            <Badge variant="default">{trailer.source}</Badge>
            <a href={trailer.url} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-blue-400 p-1">
              <ExternalLink size={12} />
            </a>
            <button onClick={() => deleteMutation.mutate(trailer.id)} className="text-gray-600 hover:text-red-400 p-1">
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>

      {/* Add manually */}
      <form
        onSubmit={(e) => { e.preventDefault(); if (newUrl) addMutation.mutate(); }}
        className="flex gap-2"
      >
        <input
          type="text"
          placeholder="Name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="w-32 bg-gray-800 border border-white/10 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <input
          type="url"
          placeholder="https://youtube.com/watch?v=..."
          value={newUrl}
          onChange={(e) => setNewUrl(e.target.value)}
          className="flex-1 bg-gray-800 border border-white/10 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={!newUrl || addMutation.isPending}
          className="flex items-center gap-1 px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 rounded border border-white/10 disabled:opacity-40"
        >
          <Plus size={12} /> Add
        </button>
      </form>
    </div>
  );
}
