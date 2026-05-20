import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Cpu, Download, Plus } from "lucide-react";
import { episodeApi, subtitleApi, artworkDisplayUrl, artworkApi, type EpisodeDetail, type SubtitleItem } from "../../lib/api.js";
import { SlidePanel } from "../ui/SlidePanel.js";
import { Tabs } from "../ui/Tabs.js";
import { Badge } from "../ui/Badge.js";

const TABS = [
  { id: "info", label: "Info" },
  { id: "artwork", label: "Artwork" },
  { id: "technical", label: "Technical" },
  { id: "subtitles", label: "Subtitles" },
];

interface Props {
  episodeId: string | null;
  showTitle?: string;
  onClose: () => void;
}

export function EpisodeDetailPanel({ episodeId, showTitle, onClose }: Props) {
  const [activeTab, setActiveTab] = useState("info");
  const queryClient = useQueryClient();

  const { data: episode, isLoading } = useQuery({
    queryKey: ["episode", episodeId],
    queryFn: () => episodeApi.get(episodeId!),
    enabled: Boolean(episodeId),
  });

  const scrapeMutation = useMutation({
    mutationFn: () => episodeApi.scrape(episodeId!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["episode", episodeId] }),
  });

  const seasonStr = episode?.seasonNumber != null
    ? String(episode.seasonNumber).padStart(2, "0")
    : "??";
  const title = episode
    ? `${showTitle ? showTitle + " · " : ""}S${seasonStr}E${String(episode.episodeNumber).padStart(2, "0")}${episode.title ? " · " + episode.title : ""}`
    : "Episode";

  return (
    <SlidePanel open={Boolean(episodeId)} onClose={onClose} title={title} width="w-[600px]">
      {isLoading && <div className="p-6 text-gray-500 text-sm">Loading...</div>}
      {episode && (
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-white/10">
            {episode.airDate && <span className="text-xs text-gray-500">{episode.airDate}</span>}
            {episode.runtime && <span className="text-xs text-gray-500">{episode.runtime}m</span>}
            <div className="ml-auto">
              <button
                onClick={() => scrapeMutation.mutate()}
                disabled={scrapeMutation.isPending || episode.metadataLocked}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 rounded disabled:opacity-40"
              >
                <RefreshCw size={11} className={scrapeMutation.isPending ? "animate-spin" : ""} />
                Rescrape
              </button>
            </div>
          </div>

          <Tabs tabs={TABS} active={activeTab} onChange={setActiveTab} />

          <div className="flex-1 overflow-y-auto p-5">
            {activeTab === "info" && <EpisodeInfoTab episode={episode} />}
            {activeTab === "artwork" && <EpisodeArtworkTab episodeId={episode.id} />}
            {activeTab === "technical" && <EpisodeTechnicalTab episode={episode} />}
            {activeTab === "subtitles" && <EpisodeSubtitlesTab episodeId={episode.id} />}
          </div>
        </div>
      )}
    </SlidePanel>
  );
}

function EpisodeInfoTab({ episode }: { episode: EpisodeDetail }) {
  if (!episode) return null;
  const field = (label: string, value: string | number | null | undefined) =>
    value != null ? (
      <div key={label} className="grid grid-cols-[120px_1fr] gap-2 py-2 border-b border-white/5 items-start">
        <dt className="text-xs text-gray-500 pt-0.5">{label}</dt>
        <dd className="text-sm text-gray-200">{value}</dd>
      </div>
    ) : null;

  return (
    <div>
      <dl>
        {field("Episode", episode.episodeNumber)}
        {field("Air Date", episode.airDate)}
        {field("Runtime", episode.runtime ? `${episode.runtime} min` : undefined)}
        {field("TVDB ID", episode.tvdbId)}
        {field("TMDB ID", episode.tmdbId)}
        {field("File", episode.filePath?.split("/").slice(-2).join("/"))}
      </dl>
      {episode.plot && (
        <div className="mt-4">
          <div className="text-xs text-gray-500 mb-1">Plot</div>
          <p className="text-sm text-gray-300 leading-relaxed">{episode.plot}</p>
        </div>
      )}
    </div>
  );
}

const ARTWORK_TYPES_EP = ["episode_thumb", "poster", "backdrop"] as const;

function EpisodeArtworkTab({ episodeId }: { episodeId: string }) {
  const [addUrl, setAddUrl] = useState("");
  const [addType, setAddType] = useState("episode_thumb");
  const queryClient = useQueryClient();

  const { data: artwork, isLoading } = useQuery({
    queryKey: ["episode-artwork", episodeId],
    queryFn: () => episodeApi.getArtwork(episodeId),
  });

  const addUrlMutation = useMutation({
    mutationFn: () => artworkApi.episodeAddUrl(episodeId, addUrl, addType),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["episode-artwork", episodeId] });
      setAddUrl("");
    },
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => artworkApi.episodeUploadFile(episodeId, file, addType),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["episode-artwork", episodeId] }),
  });

  return (
    <div className="space-y-4">
      {/* Type + add controls */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Type:</span>
          <select
            value={addType}
            onChange={(e) => setAddType(e.target.value)}
            className="bg-gray-800 border border-white/10 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {ARTWORK_TYPES_EP.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
          </select>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); if (addUrl) addUrlMutation.mutate(); }} className="flex gap-2">
          <input
            type="url"
            placeholder="Paste image URL..."
            value={addUrl}
            onChange={(e) => setAddUrl(e.target.value)}
            className="flex-1 bg-gray-800 border border-white/10 rounded px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
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
      </div>

      {isLoading && <p className="text-sm text-gray-500">Loading...</p>}
      {!isLoading && !artwork?.length && (
        <p className="text-sm text-gray-500">No artwork yet. Upload a thumbnail or paste a URL above.</p>
      )}

      <div className="grid grid-cols-2 gap-3">
        {artwork?.map((art) => {
          const src = artworkDisplayUrl(art);
          return (
            <div key={art.id} className="rounded overflow-hidden border border-white/10">
              {src ? (
                <img src={src} alt="episode thumb" className="w-full h-auto object-cover" loading="lazy"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              ) : (
                <div className="aspect-video bg-gray-800 flex items-center justify-center">
                  <span className="text-xs text-gray-600">No image</span>
                </div>
              )}
              <div className="px-2 py-1.5 text-xs text-gray-500 flex justify-between">
                <span>{art.type.replace("_", " ")}</span>
                <span>{art.source}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EpisodeTechnicalTab({ episode }: { episode: EpisodeDetail }) {
  const queryClient = useQueryClient();
  const [scanning, setScanning] = useState(false);
  const info = episode.mediaInfo;

  useEffect(() => {
    if (!scanning) return;
    if (info) { setScanning(false); return; }
    const interval = setInterval(
      () => queryClient.invalidateQueries({ queryKey: ["episode", episode.id] }),
      2000
    );
    return () => clearInterval(interval);
  }, [scanning, info, episode.id, queryClient]);

  const scanMutation = useMutation({
    mutationFn: () => episodeApi.scanMediaInfo(episode.id),
    onSuccess: () => setScanning(true),
  });

  const isBusy = scanMutation.isPending || scanning;

  if (!info) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-400">No technical information yet.</p>
        <button
          onClick={() => scanMutation.mutate()}
          disabled={isBusy}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 rounded disabled:opacity-40"
        >
          <Cpu size={14} className={isBusy ? "animate-pulse" : ""} />
          {isBusy ? "Scanning..." : "Run MediaInfo Scan"}
        </button>
      </div>
    );
  }

  const row = (label: string, value: string | number | null | undefined) =>
    value != null ? (
      <div key={label} className="grid grid-cols-[140px_1fr] gap-2 py-2 border-b border-white/5">
        <dt className="text-xs text-gray-500">{label}</dt>
        <dd className="text-sm text-gray-200">{value}</dd>
      </div>
    ) : null;

  const duration = info.durationSeconds
    ? `${Math.floor(info.durationSeconds / 60)}m ${info.durationSeconds % 60}s`
    : undefined;

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          onClick={() => scanMutation.mutate()}
          disabled={isBusy}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-white/10 rounded disabled:opacity-40"
        >
          <Cpu size={11} className={isBusy ? "animate-pulse" : ""} /> {isBusy ? "Scanning..." : "Rescan"}
        </button>
      </div>
      <dl>
        {row("Container", info.container)}
        {row("Video Codec", info.videoCodec)}
        {row("Resolution", info.resolution)}
        {row("HDR", info.hdrFormat)}
        {row("Audio Codec", info.audioCodec)}
        {row("Audio Channels", info.audioChannels)}
        {row("Duration", duration)}
        {row("File", episode.filePath?.split("/").slice(-1)[0])}
      </dl>
    </div>
  );
}

function EpisodeSubtitlesTab({ episodeId }: { episodeId: string }) {
  const [language, setLanguage] = useState("en");
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const [queuedIds, setQueuedIds] = useState<Set<string>>(new Set());
  const [downloadErrors, setDownloadErrors] = useState<Record<string, string>>({});
  const queryClient = useQueryClient();

  const hasPending = (subs: SubtitleItem[] | undefined) =>
    subs?.some((s) => !s.filePath && queuedIds.has(s.id)) ?? false;

  const { data: subs, isLoading } = useQuery({
    queryKey: ["episode-subtitles", episodeId],
    queryFn: () => subtitleApi.episodeList(episodeId),
    refetchInterval: (query) => hasPending(query.state.data as SubtitleItem[] | undefined) ? 3000 : false,
  });

  useEffect(() => {
    if (!subs) return;
    const nowDownloaded = subs.filter((s) => s.filePath && queuedIds.has(s.id)).map((s) => s.id);
    if (nowDownloaded.length) {
      setQueuedIds((prev) => { const n = new Set(prev); nowDownloaded.forEach((id) => n.delete(id)); return n; });
    }
  }, [subs]);

  const searchMutation = useMutation({
    mutationFn: () => subtitleApi.episodeSearch(episodeId, language),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["episode-subtitles", episodeId] }),
  });

  async function handleDownload(subId: string) {
    setDownloadingIds((prev) => new Set(prev).add(subId));
    setDownloadErrors((prev) => { const n = { ...prev }; delete n[subId]; return n; });
    try {
      await subtitleApi.episodeDownload(episodeId, subId);
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
      <div className="flex gap-2">
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="bg-gray-800 border border-white/10 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {["en", "es", "fr", "de", "pt", "it", "nl", "ja", "ko", "zh"].map((l) => (
            <option key={l} value={l}>{l.toUpperCase()}</option>
          ))}
        </select>
        <button
          onClick={() => searchMutation.mutate()}
          disabled={searchMutation.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 rounded disabled:opacity-40"
        >
          <RefreshCw size={12} className={searchMutation.isPending ? "animate-spin" : ""} />
          {searchMutation.isPending ? "Searching..." : "Search"}
        </button>
        {searchMutation.isSuccess && (
          <span className="text-xs text-green-400 self-center">Found {searchMutation.data?.found ?? 0}</span>
        )}
        {searchMutation.isError && (
          <span className="text-xs text-red-400 self-center">{String(searchMutation.error)}</span>
        )}
      </div>

      {isLoading && <p className="text-sm text-gray-500">Loading...</p>}
      {!subs?.length && !isLoading && <p className="text-sm text-gray-500">No subtitles. Search above.</p>}

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
                {name && <div className="text-xs text-gray-200 truncate" title={name}>{name}</div>}
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
                {isQueued && <span className="text-xs text-blue-400 px-2">Queued</span>}
                {sub.filePath && <span className="text-xs text-green-400 px-2">✓ Done</span>}
                {sub.matchScore != null && <span className="text-xs text-gray-600">{sub.matchScore}%</span>}
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
