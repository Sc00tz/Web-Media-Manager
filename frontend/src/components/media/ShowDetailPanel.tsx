import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, RefreshCw, Lock, Unlock, Tv, Plus } from "lucide-react";
import { showApi, artworkApi, episodeApi, artworkDisplayUrl, type ShowDetail, type SeasonSummary, type EpisodeSummary } from "../../lib/api.js";
import { EpisodeDetailPanel } from "./EpisodeDetailPanel.js";
import { SlidePanel } from "../ui/SlidePanel.js";
import { Tabs } from "../ui/Tabs.js";
import { Badge } from "../ui/Badge.js";
import { clsx } from "clsx";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "seasons", label: "Seasons & Episodes" },
  { id: "artwork", label: "Artwork" },
  { id: "cast", label: "Cast" },
];

interface Props {
  showId: string | null;
  onClose: () => void;
}

export function ShowDetailPanel({ showId, onClose }: Props) {
  const [activeTab, setActiveTab] = useState("overview");
  const queryClient = useQueryClient();

  const { data: show, isLoading } = useQuery({
    queryKey: ["show", showId],
    queryFn: () => showApi.get(showId!),
    enabled: Boolean(showId),
  });

  const scrapeMutation = useMutation({
    mutationFn: () => showApi.scrape(showId!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["show", showId] }),
  });

  const lockMutation = useMutation({
    mutationFn: (locked: boolean) => showApi.patchMetadata(showId!, { metadataLocked: locked }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["show", showId] });
      queryClient.invalidateQueries({ queryKey: ["shows"] });
    },
  });

  return (
    <SlidePanel open={Boolean(showId)} onClose={onClose} title={show?.title ?? "TV Show"} width="w-[700px]">
      {isLoading && <div className="p-6 text-gray-500 text-sm">Loading...</div>}
      {show && (
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-white/10">
            <Badge variant={show.status ? "green" : "default"}>{show.status ?? "Unknown status"}</Badge>
            {show.firstAirDate && <span className="text-xs text-gray-500">{show.firstAirDate.slice(0, 4)}</span>}
            <div className="ml-auto flex gap-2">
              <button
                onClick={() => lockMutation.mutate(!show.metadataLocked)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 rounded border border-white/10"
              >
                {show.metadataLocked ? <Lock size={12} /> : <Unlock size={12} />}
                {show.metadataLocked ? "Locked" : "Unlocked"}
              </button>
              <button
                onClick={() => scrapeMutation.mutate()}
                disabled={scrapeMutation.isPending || show.metadataLocked}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 rounded disabled:opacity-40"
              >
                <RefreshCw size={12} className={scrapeMutation.isPending ? "animate-spin" : ""} />
                Rescrape
              </button>
            </div>
          </div>

          <Tabs tabs={TABS} active={activeTab} onChange={setActiveTab} />

          <div className="flex-1 overflow-y-auto p-5">
            {activeTab === "overview" && <ShowOverviewTab show={show} />}
            {activeTab === "seasons" && <SeasonsTab show={show} />}
            {activeTab === "artwork" && <ShowArtworkTab showId={show.id} />}
            {activeTab === "cast" && <ShowCastTab show={show} />}
          </div>
        </div>
      )}
    </SlidePanel>
  );
}

function ShowOverviewTab({ show }: { show: ShowDetail }) {
  const field = (label: string, value: string | number | null | undefined) =>
    value != null ? (
      <div key={label} className="grid grid-cols-[140px_1fr] gap-2 py-2 border-b border-white/5 items-start">
        <dt className="text-xs text-gray-500 pt-0.5">{label}</dt>
        <dd className="text-sm text-gray-200">{value}</dd>
      </div>
    ) : null;

  return (
    <div>
      <dl>
        {field("Title", show.title)}
        {field("Original Title", show.originalTitle)}
        {field("First Aired", show.firstAirDate)}
        {field("Status", show.status)}
        {field("Certification", show.certification)}
        {field("TVDB ID", show.tvdbId)}
        {field("TMDB ID", show.tmdbId)}
        {field("IMDB ID", show.imdbId)}
        {field("Genres", show.genres.join(", ") || undefined)}
        {field("Networks", show.networks.join(", ") || undefined)}
        {field("Seasons", show.seasons.length || undefined)}
      </dl>
      {show.plot && (
        <div className="mt-4">
          <div className="text-xs text-gray-500 mb-1">Overview</div>
          <p className="text-sm text-gray-300 leading-relaxed">{show.plot}</p>
        </div>
      )}
    </div>
  );
}

function SeasonsTab({ show }: { show: ShowDetail }) {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      {show.seasons.map((season) => (
        <SeasonAccordion
          key={season.id}
          season={season}
          showId={show.id}
          open={expanded[season.seasonNumber] ?? false}
          onToggle={() =>
            setExpanded((e) => ({ ...e, [season.seasonNumber]: !e[season.seasonNumber] }))
          }
          onSelectEpisode={setSelectedEpisodeId}
        />
      ))}
      {show.seasons.length === 0 && (
        <p className="text-sm text-gray-500">No seasons found. Try rescraping the show.</p>
      )}
      <EpisodeDetailPanel
        episodeId={selectedEpisodeId}
        showTitle={show.title}
        onClose={() => setSelectedEpisodeId(null)}
      />
    </div>
  );
}

function SeasonAccordion({
  season, showId, open, onToggle, onSelectEpisode,
}: {
  season: SeasonSummary;
  showId: string;
  open: boolean;
  onToggle: () => void;
  onSelectEpisode: (id: string) => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["season", showId, season.seasonNumber],
    queryFn: () => showApi.getSeason(showId, season.seasonNumber),
    enabled: open,
  });

  return (
    <div className="border border-white/10 rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors"
      >
        {open ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
        {/* Season poster thumbnail */}
{(() => {
          const activeArt = season.artwork?.find((a) => a.active);
          const src = activeArt ? artworkDisplayUrl(activeArt) : null;
          return src ? (
            <img src={src} alt="" className="w-8 h-12 object-cover rounded flex-shrink-0" loading="lazy" />
          ) : null;
        })()}
        <span className="font-medium text-sm">
          {season.title ?? (season.seasonNumber === 0 ? "Specials" : `Season ${season.seasonNumber}`)}
        </span>
        {season.airDate && <span className="text-xs text-gray-500 ml-auto">{season.airDate.slice(0, 4)}</span>}
      </button>

      {open && (
        <div className="border-t border-white/10">
          {/* Season poster upload */}
          <SeasonArtworkUpload seasonId={season.id} showId={showId} />
          {isLoading && <div className="px-4 py-3 text-xs text-gray-500">Loading episodes...</div>}
          {data?.episodes.map((ep) => (
            <EpisodeRow key={ep.id} episode={ep} onClick={() => onSelectEpisode(ep.id)} />
          ))}
          {data?.episodes.length === 0 && (
            <div className="px-4 py-3 text-xs text-gray-500">No episodes found.</div>
          )}
        </div>
      )}
    </div>
  );
}

function SeasonArtworkUpload({ seasonId, showId }: { seasonId: string; showId: string }) {
  const queryClient = useQueryClient();

  const { data: artwork } = useQuery({
    queryKey: ["season-artwork", seasonId],
    queryFn: () => artworkApi.seasonList(seasonId),
  });

  const activePoster = artwork?.find((a) => a.active && a.type === "season_poster");
  const posterSrc = artworkDisplayUrl(activePoster);

  const uploadMutation = useMutation({
    mutationFn: (file: File) => artworkApi.seasonUploadFile(seasonId, showId, file, "season_poster"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["season-artwork", seasonId] }),
  });

  const addUrlMutation = useMutation({
    mutationFn: (url: string) => artworkApi.seasonAddUrl(seasonId, showId, url, "season_poster"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["season-artwork", seasonId] }),
  });

  const [urlInput, setUrlInput] = useState("");

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-white/5 border-b border-white/5">
      {/* Current season poster or placeholder */}
      <div className="w-10 h-14 bg-gray-800 rounded overflow-hidden flex-shrink-0">
        {posterSrc ? (
          <img src={posterSrc} alt="season poster" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-gray-600 text-xs">?</span>
          </div>
        )}
      </div>
      <div className="flex-1 flex items-center gap-2 min-w-0">
        <span className="text-xs text-gray-500 flex-shrink-0">Season poster:</span>
        <form onSubmit={(e) => { e.preventDefault(); if (urlInput) { addUrlMutation.mutate(urlInput); setUrlInput(""); }}} className="flex gap-1 flex-1 min-w-0">
          <input type="url" placeholder="Paste URL..." value={urlInput} onChange={(e) => setUrlInput(e.target.value)}
            className="flex-1 min-w-0 bg-gray-800 border border-white/10 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
          <button type="submit" disabled={!urlInput} className="text-xs px-2 py-1 bg-gray-700 border border-white/10 rounded disabled:opacity-40">URL</button>
        </form>
        <label className="flex-shrink-0 cursor-pointer">
          <input type="file" accept="image/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadMutation.mutate(f); e.target.value = ""; }} />
          <span className={`text-xs px-2 py-1 border border-white/10 rounded ${uploadMutation.isPending ? "opacity-40" : "bg-gray-700 hover:bg-gray-600 cursor-pointer"}`}>
            {uploadMutation.isPending ? "..." : "Upload"}
          </span>
        </label>
      </div>
    </div>
  );
}

function EpisodeRow({ episode, onClick }: { episode: EpisodeSummary; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full text-left flex items-start gap-3 px-4 py-2.5 border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors">
      <span className="text-xs text-gray-600 w-12 flex-shrink-0 pt-0.5">
        E{String(episode.episodeNumber).padStart(2, "0")}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm truncate">{episode.title ?? "Untitled"}</div>
        {episode.airDate && <div className="text-xs text-gray-500">{episode.airDate}</div>}
      </div>
      {!episode.filePath && (
        <Badge variant="red" className="flex-shrink-0">missing</Badge>
      )}
    </button>
  );
}

const SHOW_ARTWORK_TYPES = ["poster", "backdrop", "logo", "clearart", "banner", "thumb"] as const;

function ShowArtworkTab({ showId }: { showId: string }) {
  const [addUrl, setAddUrl] = useState("");
  const [addType, setAddType] = useState("poster");
  const queryClient = useQueryClient();

  const { data: artwork, isLoading } = useQuery({
    queryKey: ["show-artwork", showId],
    queryFn: () => artworkApi.showList(showId),
  });

  const refreshMutation = useMutation({
    mutationFn: () => artworkApi.showRefresh(showId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["show-artwork", showId] }),
  });

  const activateMutation = useMutation({
    mutationFn: (artworkId: string) => artworkApi.showActivate(showId, artworkId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["show-artwork", showId] }),
  });

  const addUrlMutation = useMutation({
    mutationFn: () => artworkApi.showAddUrl(showId, addUrl, addType),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["show-artwork", showId] });
      setAddUrl("");
    },
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => artworkApi.showUploadFile(showId, file, addType),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["show-artwork", showId] }),
  });

  const typeGroups = artwork?.reduce<Record<string, typeof artwork>>((acc, a) => {
    (acc[a.type] ??= []).push(a);
    return acc;
  }, {}) ?? {};

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          onClick={() => refreshMutation.mutate()}
          disabled={refreshMutation.isPending}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded border border-white/10 disabled:opacity-40"
        >
          <RefreshCw size={12} className={refreshMutation.isPending ? "animate-spin" : ""} />
          {refreshMutation.isPending ? "Fetching..." : "Fetch from providers"}
        </button>
        {refreshMutation.isSuccess && <span className="text-xs text-green-400">Done</span>}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500">Type:</span>
        <select value={addType} onChange={(e) => setAddType(e.target.value)}
          className="bg-gray-800 border border-white/10 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500">
          {SHOW_ARTWORK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); if (addUrl) addUrlMutation.mutate(); }} className="flex gap-2">
        <input type="url" placeholder="Paste image URL..." value={addUrl}
          onChange={(e) => setAddUrl(e.target.value)}
          className="flex-1 bg-gray-800 border border-white/10 rounded px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
        <button type="submit" disabled={!addUrl || addUrlMutation.isPending}
          className="flex items-center gap-1 px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 border border-white/10 rounded disabled:opacity-40">
          <Plus size={11} /> URL
        </button>
      </form>
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="file" accept="image/*" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadMutation.mutate(f); e.target.value = ""; }} />
        <span className={`flex items-center gap-1 px-3 py-1.5 text-xs border border-white/10 rounded ${uploadMutation.isPending ? "opacity-40" : "bg-gray-700 hover:bg-gray-600 cursor-pointer"}`}>
          <Plus size={11} /> {uploadMutation.isPending ? "Uploading..." : "Upload file"}
        </span>
        {uploadMutation.isSuccess && <span className="text-xs text-green-400">Uploaded</span>}
      </label>

      {isLoading && <p className="text-sm text-gray-500">Loading artwork...</p>}
      {!isLoading && !artwork?.length && (
        <p className="text-sm text-gray-500">No artwork yet. Fetch from providers, paste a URL, or upload a file.</p>
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
                onClick={() => { if (!art.active) activateMutation.mutate(art.id); }}
                className={clsx(
                  "relative rounded overflow-hidden border-2 cursor-pointer transition-all",
                  art.active ? "border-blue-500" : "border-white/10 hover:border-white/30"
                )}
              >
                {displayUrl ? (
                  <img src={displayUrl} alt={type} className="w-full h-auto object-cover" loading="eager"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                ) : (
                  <div className="aspect-[2/3] bg-gray-800 flex items-center justify-center">
                    <Tv size={20} className="text-gray-600" />
                  </div>
                )}
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
  const [failed, setFailed] = useState(false);
  const src = profilePath
    ? (profilePath.startsWith("/") || profilePath.startsWith("\\")
        ? `/api/artwork/local?path=${encodeURIComponent(profilePath)}`
        : `/api/proxy/image?url=${encodeURIComponent(profilePath)}`)
    : undefined;
  return (
    <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0 overflow-hidden">
      {src && !failed
        ? <img src={src} alt={name} className="w-full h-full object-cover" loading="eager" onError={() => setFailed(true)} />
        : <span className="text-xs text-gray-400">{name[0]?.toUpperCase()}</span>}
    </div>
  );
}

function ShowCastTab({ show }: { show: ShowDetail }) {
  return (
    <div className="space-y-2">
      {show.cast.length === 0 && <p className="text-sm text-gray-500">No cast information. Scrape from TVDB to populate cast.</p>}
      {show.cast.map((c) => (
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
