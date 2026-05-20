import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { libraryApi, type Library } from "../lib/api.js";
import { Tabs } from "../components/ui/Tabs.js";
import { Badge } from "../components/ui/Badge.js";
import { DirectoryPicker } from "../components/ui/DirectoryPicker.js";
import { FolderOpen, Check, X } from "lucide-react";

const SETTING_TABS = [
  { id: "libraries", label: "Libraries" },
  { id: "scrapers", label: "Scrapers" },
  { id: "about", label: "About" },
];

export function Settings() {
  const [activeTab, setActiveTab] = useState("libraries");

  return (
    <div className="p-6 max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <Tabs tabs={SETTING_TABS} active={activeTab} onChange={setActiveTab} />
      <div className="pt-2">
        {activeTab === "libraries" && <LibrariesTab />}
        {activeTab === "scrapers" && <ScrapersTab />}
        {activeTab === "about" && <AboutTab />}
      </div>
    </div>
  );
}

function LibrariesTab() {
  const queryClient = useQueryClient();
  const { data: libraries } = useQuery({ queryKey: ["libraries"], queryFn: libraryApi.list });
  const [newLib, setNewLib] = useState({ name: "", path: "", type: "movie" as "movie" | "tv" });
  const [pickerOpen, setPickerOpen] = useState(false);

  const createMutation = useMutation({
    mutationFn: libraryApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["libraries"] });
      setNewLib({ name: "", path: "", type: "movie" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: libraryApi.delete,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["libraries"] }),
  });

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {libraries?.map((lib) => (
          <LibraryRow
            key={lib.id}
            lib={lib}
            onDelete={() => deleteMutation.mutate(lib.id)}
          />
        ))}
        {libraries?.length === 0 && (
          <p className="text-sm text-gray-500">No libraries added yet.</p>
        )}
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); createMutation.mutate(newLib); }}
        className="bg-gray-900 border border-white/10 rounded-lg p-4 space-y-3"
      >
        <h3 className="text-sm font-medium">Add Library</h3>
        <div className="grid grid-cols-2 gap-3">
          <input
            type="text"
            placeholder="Name"
            value={newLib.name}
            onChange={(e) => setNewLib((s) => ({ ...s, name: e.target.value }))}
            className="bg-gray-800 border border-white/10 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <select
            value={newLib.type}
            onChange={(e) => setNewLib((s) => ({ ...s, type: e.target.value as "movie" | "tv" }))}
            className="bg-gray-800 border border-white/10 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="movie">Movies</option>
            <option value="tv">TV Shows</option>
          </select>
        </div>

        {/* Path field with browse button */}
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="/path/to/media"
            value={newLib.path}
            onChange={(e) => setNewLib((s) => ({ ...s, path: e.target.value }))}
            className="flex-1 bg-gray-800 border border-white/10 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
          />
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-gray-800 hover:bg-gray-700 border border-white/10 rounded flex-shrink-0"
          >
            <FolderOpen size={14} /> Browse
          </button>
        </div>

        {/* Directory picker inline panel */}
        {pickerOpen && (
          <div className="border border-white/10 rounded-lg overflow-hidden h-64 bg-gray-950">
            <DirectoryPicker
              value={newLib.path}
              onChange={(p) => setNewLib((s) => ({ ...s, path: p }))}
              onClose={() => setPickerOpen(false)}
            />
          </div>
        )}

        <button
          type="submit"
          disabled={createMutation.isPending || !newLib.name || !newLib.path}
          className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 rounded disabled:opacity-50"
        >
          {createMutation.isPending ? "Adding..." : "Add Library"}
        </button>
      </form>
    </div>
  );
}

function LibraryRow({ lib, onDelete }: { lib: Library; onDelete: () => void }) {
  const scanMutation = useMutation({ mutationFn: () => libraryApi.scan(lib.id) });

  return (
    <div className="flex items-center gap-3 bg-gray-900 border border-white/5 rounded-lg px-4 py-3">
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm">{lib.name}</div>
        <div className="text-xs text-gray-500 mt-0.5 truncate">{lib.type === "movie" ? "Movies" : "TV Shows"} · {lib.path}</div>
      </div>
      <button
        onClick={() => scanMutation.mutate()}
        disabled={scanMutation.isPending}
        className="text-xs px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-white/10 rounded disabled:opacity-40"
      >
        {scanMutation.isPending ? "Scanning..." : scanMutation.isSuccess ? "Queued ✓" : "Scan"}
      </button>
      <button onClick={onDelete} className="text-xs text-red-400 hover:text-red-300">Remove</button>
    </div>
  );
}

interface ScraperInfo {
  provider: string;
  type: string;
  available: boolean;
  priority: number;
  isPlugin: boolean;
  config: { apiKey?: string; enabled: boolean; priority: number } | null;
}

const SCRAPER_LABELS: Record<string, { label: string; hasUser?: boolean; keyLabel?: string }> = {
  tmdb: { label: "The Movie Database (TMDB)", keyLabel: "API Key (v3 Read Access Token)" },
  tvdb: { label: "TheTVDB v4", keyLabel: "API Key" },
  fanart: { label: "Fanart.tv", keyLabel: "API Key" },
  subdl: { label: "SubDL (recommended)", keyLabel: "API Key — register free at subdl.com" },
  opensubtitles: { label: "OpenSubtitles.org", hasUser: true, keyLabel: "API Key — register at opensubtitles.org" },
};

function ScraperConfigRow({ scraper }: { scraper: ScraperInfo }) {
  const queryClient = useQueryClient();
  const meta = SCRAPER_LABELS[scraper.provider] ?? { label: scraper.provider };
  const [apiKey, setApiKey] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [expanded, setExpanded] = useState(false);

  const saveMutation = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = { apiKey: apiKey || undefined, enabled: true };
      if (meta.hasUser && (username || password)) {
        body.options = { username, password };
      }
      return fetch(`/api/scrapers/${scraper.provider}/config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scrapers"] });
      setApiKey("");
      setUsername("");
      setPassword("");
      setExpanded(false);
    },
  });

  return (
    <div className="bg-gray-900 border border-white/5 rounded-lg overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{meta.label}</span>
            {scraper.isPlugin && <Badge variant="blue">plugin</Badge>}
          </div>
          <div className="text-xs text-gray-500 mt-0.5 capitalize">
            {scraper.type === "subtitle" ? "Subtitle / language" : scraper.type} scraper
          </div>
        </div>
        <div className="flex items-center gap-2">
          {scraper.available ? (
            <span className="flex items-center gap-1 text-xs text-green-400">
              <Check size={11} /> configured
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <X size={11} /> no key
            </span>
          )}
          <button
            onClick={() => setExpanded((e) => !e)}
            className="text-xs px-2 py-1 bg-gray-800 hover:bg-gray-700 border border-white/10 rounded"
          >
            {expanded ? "Cancel" : scraper.available ? "Update key" : "Add key"}
          </button>
        </div>
      </div>

      {expanded && (
        <form
          onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }}
          className="px-4 pb-4 space-y-2 border-t border-white/5 pt-3"
        >
          <div>
            <label className="block text-xs text-gray-400 mb-1">{meta.keyLabel ?? "API Key"}</label>
            <input
              type="password"
              placeholder={scraper.available ? "Enter new key to replace..." : "Paste API key..."}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full bg-gray-800 border border-white/10 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          {meta.hasUser && (
            <>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Username</label>
                <input
                  type="text"
                  placeholder="OpenSubtitles username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-gray-800 border border-white/10 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Password</label>
                <input
                  type="password"
                  placeholder="OpenSubtitles password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-gray-800 border border-white/10 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </>
          )}
          <button
            type="submit"
            disabled={(!apiKey && !username) || saveMutation.isPending}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 rounded disabled:opacity-50"
          >
            {saveMutation.isPending ? "Saving..." : "Save"}
          </button>
          {saveMutation.isSuccess && <span className="text-xs text-green-400 ml-2">Saved — active immediately</span>}
        </form>
      )}
    </div>
  );
}

function ScrapersTab() {
  const queryClient = useQueryClient();
  const { data: scrapers } = useQuery<ScraperInfo[]>({
    queryKey: ["scrapers"],
    queryFn: () => fetch("/api/scrapers").then((r) => r.json()) as Promise<ScraperInfo[]>,
  });

  const [pluginPath, setPluginPath] = useState("");
  const loadMutation = useMutation({
    mutationFn: (path: string) =>
      fetch("/api/scrapers/plugin/load", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modulePath: path }),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scrapers"] });
      setPluginPath("");
    },
  });

  return (
    <div className="space-y-3">
      {scrapers?.filter((s) => !s.isPlugin).map((s) => (
        <ScraperConfigRow key={s.provider} scraper={s} />
      ))}

      <div className="bg-gray-900 border border-white/10 rounded-lg p-3 text-xs text-gray-500 space-y-1">
        <p className="font-medium text-gray-400">About subtitle providers</p>
        <p><strong className="text-gray-300">SubDL</strong> (recommended) — 30 downloads/day free. Register at subdl.com. Used automatically if configured.</p>
        <p><strong className="text-gray-300">OpenSubtitles.org</strong> — only 5 downloads/day on the free tier. Used as fallback if SubDL is not configured.</p>
        <p className="text-gray-600">Other providers (Addic7ed, SubScene, Subscene) don't have public APIs and require web scraping. Plugin scrapers can add them in future.</p>
      </div>

      <div className="bg-gray-900 border border-white/10 rounded-lg p-4 space-y-3 mt-2">
        <h3 className="text-sm font-medium">Load Plugin Scraper</h3>
        <p className="text-xs text-gray-500">
          Load a custom scraper from an ES module file that exports a default scraper object.
        </p>
        <form
          onSubmit={(e) => { e.preventDefault(); if (pluginPath) loadMutation.mutate(pluginPath); }}
          className="flex gap-2"
        >
          <input
            type="text"
            placeholder="/path/to/my-scraper.js"
            value={pluginPath}
            onChange={(e) => setPluginPath(e.target.value)}
            className="flex-1 bg-gray-800 border border-white/10 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={!pluginPath || loadMutation.isPending}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 rounded disabled:opacity-50"
          >
            Load
          </button>
        </form>
        {loadMutation.isError && <p className="text-xs text-red-400">{String(loadMutation.error)}</p>}
      </div>
    </div>
  );
}

function AboutTab() {
  return (
    <div className="space-y-4 text-sm text-gray-300">
      <div className="bg-gray-900 border border-white/10 rounded-lg p-4 space-y-2">
        <div className="font-medium">MediaManager</div>
        <div className="text-xs text-gray-500">Version 0.1.0</div>
        <div className="text-xs text-gray-500">
          Self-hosted media management — movies, TV shows, artwork, subtitles, renaming, and NFO generation.
        </div>
      </div>
      <div className="bg-gray-900 border border-white/10 rounded-lg p-4 space-y-2">
        <div className="font-medium text-sm">Data Sources</div>
        <ul className="text-xs text-gray-400 space-y-1">
          <li>· The Movie Database (TMDB) — movie and TV metadata, artwork</li>
          <li>· TheTVDB — TV show metadata and artwork</li>
          <li>· Fanart.tv — high-quality artwork (logos, clearart, disc art)</li>
          <li>· OpenSubtitles — subtitle search and download</li>
          <li>· MediaInfo — technical file analysis</li>
        </ul>
      </div>
    </div>
  );
}
