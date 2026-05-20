export type TaskType =
  | "scan_library"
  | "scan_path"
  | "scrape_movie"
  | "scrape_show"
  | "scrape_episode"
  | "download_artwork"
  | "search_subtitles"
  | "download_subtitle"
  | "rename_file"
  | "generate_nfo"
  | "extract_mediainfo";

export type TaskStatus = "pending" | "active" | "completed" | "failed" | "delayed";

export interface TaskProgress {
  current: number;
  total: number;
  message?: string;
}

export interface Task {
  id: string;
  type: TaskType;
  status: TaskStatus;
  payload: Record<string, unknown>;
  progress?: TaskProgress;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

export interface TaskEvent {
  taskId: string;
  type: TaskType;
  status: TaskStatus;
  progress?: TaskProgress;
  error?: string;
  timestamp: Date;
}
