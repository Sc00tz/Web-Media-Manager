export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
}

export interface ApiSuccess<T = void> {
  success: true;
  data?: T;
}

export type SortDirection = "asc" | "desc";

export interface MovieFilters {
  search?: string;
  genres?: string[];
  year?: number;
  yearMin?: number;
  yearMax?: number;
  status?: "unmatched" | "matched" | "locked";
  missingArtwork?: boolean;
  missingMetadata?: boolean;
  resolution?: string;
  codec?: string;
  page?: number;
  pageSize?: number;
  sortBy?: "title" | "year" | "addedAt" | "rating";
  sortDirection?: SortDirection;
}

export interface ShowFilters {
  search?: string;
  genres?: string[];
  status?: string;
  missingArtwork?: boolean;
  missingPoster?: boolean;
  missingMetadata?: boolean;
  missingSubtitles?: boolean;
  page?: number;
  pageSize?: number;
  sortBy?: "title" | "firstAirDate" | "addedAt";
  sortDirection?: SortDirection;
}
