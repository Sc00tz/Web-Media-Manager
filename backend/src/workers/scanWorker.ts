import { getDb } from "../db/index.js";
import { libraries } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { scanMovieLibrary, scanTvLibrary, type ScanProgress } from "../scanner/libraryScanner.js";
import type { JobPayload } from "./queue.js";

export async function scanLibraryHandler(payload: JobPayload["scan_library"]): Promise<void> {
  const db = getDb();
  const [library] = await db
    .select()
    .from(libraries)
    .where(eq(libraries.id, payload.libraryId));

  if (!library) {
    throw new Error(`Library not found: ${payload.libraryId}`);
  }

  const progress: ScanProgress = { scanned: 0, added: 0, updated: 0, errors: [] };

  console.log(`Scanning library: ${library.name} (${library.type}) at ${library.path}`);

  if (library.type === "movie") {
    await scanMovieLibrary(library.id, library.path, progress);
  } else {
    await scanTvLibrary(library.id, library.path, progress);
  }

  console.log(
    `Scan complete for "${library.name}": ${progress.scanned} scanned, ${progress.added} added, ${progress.updated} updated, ${progress.errors.length} errors`
  );

  if (progress.errors.length > 0) {
    console.warn("Scan errors:", progress.errors);
  }
}

export async function scanPathHandler(payload: JobPayload["scan_path"]): Promise<void> {
  const db = getDb();
  const [library] = await db
    .select()
    .from(libraries)
    .where(eq(libraries.id, payload.libraryId));

  if (!library) {
    throw new Error(`Library not found: ${payload.libraryId}`);
  }

  const progress: ScanProgress = { scanned: 0, added: 0, updated: 0, errors: [] };

  if (library.type === "movie") {
    await scanMovieLibrary(library.id, payload.path, progress);
  } else {
    await scanTvLibrary(library.id, payload.path, progress);
  }
}
