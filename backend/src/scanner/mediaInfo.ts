import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import type { MediaInfo } from "@mediamanager/types";

const execAsync = promisify(exec);

// ─── Raw MediaInfo JSON types ─────────────────────────────────────────────────

interface RawTrack {
  "@type": string;
  // General
  Format?: string;
  Format_Profile?: string;
  Format_Version?: string;
  BitRate?: string;
  BitRate_Maximum?: string;
  Duration?: string;
  FileSize?: string;
  FrameRate?: string;
  // Video
  Width?: string;
  Height?: string;
  ScanType?: string;
  DisplayAspectRatio_String?: string;
  HDR_Format?: string;
  HDR_Format_Compatibility?: string;
  colour_primaries?: string;
  transfer_characteristics?: string;
  BitDepth?: string;
  // Audio
  Channels?: string;
  Channel_s_?: string;
  ChannelLayout?: string;
  Language?: string;
  Language_String?: string;
  Compression_Mode?: string;
  Format_Commercial_IfAny?: string;
  // Text
  Title?: string;
  Default?: string;
  Forced?: string;
  // Common
  StreamOrder?: string;
  ID?: string;
  UniqueID?: string;
  CodecID?: string;
}

interface RawMediaInfoJson {
  media?: {
    "@ref"?: string;
    track?: RawTrack[];
  };
}

// ─── Derived stream types ─────────────────────────────────────────────────────

export interface VideoStream {
  codec: string;
  profile?: string;
  width?: number;
  height?: number;
  resolution: string;
  bitDepth?: number;
  hdrFormat?: string;
  hdrCompatibility?: string;
  frameRate?: string;
  aspectRatio?: string;
  scanType?: string;
  bitrate?: number;
}

export interface AudioStream {
  codec: string;
  channels?: number;
  channelLayout?: string;
  language?: string;
  languageName?: string;
  bitrate?: number;
  default?: boolean;
  commercial?: string;
}

export interface SubtitleStream {
  codec: string;
  language?: string;
  languageName?: string;
  title?: string;
  default?: boolean;
  forced?: boolean;
}

export interface DetailedMediaInfo extends MediaInfo {
  videoStreams: VideoStream[];
  audioStreams: AudioStream[];
  subtitleStreams: SubtitleStream[];
  fileSize?: number;
  overallBitrate?: number;
  frameRate?: string;
}

// ─── Parsers ──────────────────────────────────────────────────────────────────

function parseNum(s: string | undefined): number | undefined {
  if (!s) return undefined;
  // MediaInfo sometimes gives "1 234 567" with spaces
  const n = parseInt(s.replace(/\s/g, ""), 10);
  return isNaN(n) ? undefined : n;
}

function parseFloat_(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const n = parseFloat(s.replace(/\s/g, ""));
  return isNaN(n) ? undefined : n;
}

function codecLabel(track: RawTrack): string {
  return track.Format_Commercial_IfAny || track.Format || track.CodecID || "Unknown";
}

function parseVideoStream(t: RawTrack): VideoStream {
  const w = parseNum(t.Width);
  const h = parseNum(t.Height);

  // Prefer commercial name for HDR (e.g. "Dolby Vision / HDR10+")
  const hdrFormat = t.HDR_Format
    ? t.HDR_Format + (t.HDR_Format_Compatibility ? ` / ${t.HDR_Format_Compatibility}` : "")
    : undefined;

  return {
    codec: t.Format || "Unknown",
    profile: t.Format_Profile,
    width: w,
    height: h,
    resolution: w && h ? `${w}×${h}` : "Unknown",
    bitDepth: parseNum(t.BitDepth),
    hdrFormat: hdrFormat,
    hdrCompatibility: t.HDR_Format_Compatibility,
    frameRate: t.FrameRate ? `${t.FrameRate} fps` : undefined,
    aspectRatio: t.DisplayAspectRatio_String,
    scanType: t.ScanType,
    bitrate: parseNum(t.BitRate) || parseNum(t.BitRate_Maximum),
  };
}

function parseAudioStream(t: RawTrack): AudioStream {
  const channels = parseNum(t.Channel_s_ ?? t.Channels);
  return {
    codec: codecLabel(t),
    channels,
    channelLayout: t.ChannelLayout,
    language: t.Language,
    languageName: t.Language_String,
    bitrate: parseNum(t.BitRate),
    default: t.Default === "Yes",
    commercial: t.Format_Commercial_IfAny,
  };
}

function parseSubtitleStream(t: RawTrack): SubtitleStream {
  return {
    codec: t.Format || t.CodecID || "Unknown",
    language: t.Language,
    languageName: t.Language_String,
    title: t.Title,
    default: t.Default === "Yes",
    forced: t.Forced === "Yes",
  };
}

function buildDetailedInfo(raw: RawMediaInfoJson): DetailedMediaInfo {
  const tracks = raw.media?.track ?? [];
  const general = tracks.find((t) => t["@type"] === "General");
  const videoTracks = tracks.filter((t) => t["@type"] === "Video");
  const audioTracks = tracks.filter((t) => t["@type"] === "Audio");
  const textTracks = tracks.filter((t) => t["@type"] === "Text");

  const videoStreams = videoTracks.map(parseVideoStream);
  const audioStreams = audioTracks.map(parseAudioStream);
  const subtitleStreams = textTracks.map(parseSubtitleStream);

  const primary = videoStreams[0];
  const primaryAudio = audioStreams[0];

  return {
    // Legacy flat fields for backward compat
    videoCodec: primary?.codec,
    audioCodec: primaryAudio?.codec,
    audioChannels: primaryAudio?.channels,
    hdrFormat: primary?.hdrFormat,
    resolution: primary ? `${primary.width}x${primary.height}` : undefined,
    width: primary?.width,
    height: primary?.height,
    bitrate: parseNum(general?.BitRate),
    container: general?.Format,
    durationSeconds: general?.Duration ? Math.round(parseFloat_(general.Duration) ?? 0) : undefined,
    subtitleTracks: subtitleStreams.map((s) => s.language ?? "und"),
    // Detailed per-stream info
    videoStreams,
    audioStreams,
    subtitleStreams,
    fileSize: parseNum(general?.FileSize),
    overallBitrate: parseNum(general?.BitRate),
    frameRate: general?.FrameRate ? `${general.FrameRate} fps` : undefined,
    rawJson: raw,
  };
}

// ─── XML fallback ─────────────────────────────────────────────────────────────

async function findExistingXml(filePath: string): Promise<string | null> {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath, path.extname(filePath));
  const xmlPath = path.join(dir, `${base}-mediainfo.xml`);
  try { await fs.access(xmlPath); return xmlPath; } catch { return null; }
}

async function parseMediaInfoXmlFallback(xmlPath: string): Promise<DetailedMediaInfo | null> {
  let xml: string;
  try { xml = await fs.readFile(xmlPath, "utf-8"); } catch { return null; }

  function xmlTag(name: string): string | undefined {
    const m = xml.match(new RegExp(`<${name}[^>]*>([^<]*)</${name}>`, "i"));
    return m?.[1]?.trim() || undefined;
  }

  const videoCodec = xmlTag("Video_Format_List")?.split(" / ")[0];
  const audioCodec = xmlTag("Audio_Format_List")?.split(" / ")[0];
  const container = xmlTag("Format");
  const width = xmlTag("Width") ? parseInt(xmlTag("Width")!, 10) : undefined;
  const height = xmlTag("Height") ? parseInt(xmlTag("Height")!, 10) : undefined;
  const durationStr = xmlTag("Duration");
  const durationSeconds = durationStr ? Math.round(parseFloat(durationStr)) : undefined;
  const hdrFormat = xmlTag("HDR_Format");
  const audioChannelsStr = xmlTag("Audio_Channels_Total") ?? xmlTag("Channels");
  const audioChannels = audioChannelsStr ? parseInt(audioChannelsStr, 10) : undefined;
  const bitDepthStr = xmlTag("BitDepth");
  const bitDepth = bitDepthStr ? parseInt(bitDepthStr, 10) : undefined;

  const textLangList = xmlTag("Text_Language_List");
  const subtitleLangs = textLangList ? textLangList.split(" / ").map((s) => s.trim()) : [];
  const audioLangList = xmlTag("Audio_Language_List");
  const audioLangs = audioLangList ? audioLangList.split(" / ").map((s) => s.trim()) : [];

  const audioFormatList = xmlTag("Audio_Format_List") ?? "";
  const audioFormats = audioFormatList.split(" / ").map((s) => s.trim());

  const videoStreams: VideoStream[] = videoCodec ? [{
    codec: videoCodec,
    width, height,
    resolution: width && height ? `${width}×${height}` : "Unknown",
    bitDepth, hdrFormat,
  }] : [];

  const audioStreams: AudioStream[] = audioLangs.map((lang, i) => ({
    codec: audioFormats[i] ?? audioCodec ?? "Unknown",
    language: lang,
    languageName: lang,
    channels: i === 0 ? audioChannels : undefined,
  }));

  const subtitleStreams: SubtitleStream[] = subtitleLangs.map((lang) => ({
    codec: "PGS",
    language: lang,
    languageName: lang,
  }));

  if (!videoCodec && !container) return null;

  return {
    videoCodec, audioCodec, audioChannels, hdrFormat,
    resolution: width && height ? `${width}x${height}` : undefined,
    width, height, container, durationSeconds,
    subtitleTracks: subtitleLangs,
    videoStreams, audioStreams, subtitleStreams,
    rawJson: { source: "xml", path: xmlPath },
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function extractMediaInfo(filePath: string): Promise<DetailedMediaInfo> {
  // Prefer existing XML
  const xmlPath = await findExistingXml(filePath);
  if (xmlPath) {
    const parsed = await parseMediaInfoXmlFallback(xmlPath);
    if (parsed) return parsed;
  }

  // Run CLI
  let stdout: string;
  try {
    const result = await execAsync(`mediainfo --Output=JSON "${filePath}"`, { timeout: 30000 });
    stdout = result.stdout;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("not found") || msg.includes("command not found")) {
      throw new Error("mediainfo is not installed");
    }
    throw new Error(`mediainfo failed: ${msg}`);
  }

  let raw: RawMediaInfoJson;
  try { raw = JSON.parse(stdout) as RawMediaInfoJson; } catch {
    throw new Error("Failed to parse mediainfo JSON output");
  }

  return buildDetailedInfo(raw);
}
