/**
 * Rename operation journal.
 *
 * Before any file rename executes, the old→new path mapping is recorded
 * in the database. On undo, we reverse each operation in reverse order.
 * A "batch" groups all renames from a single preview→execute run.
 *
 * Journal entries are kept for 30 days to allow undo.
 */
import fs from "fs/promises";
import path from "path";
import { getDb } from "../db/index.js";
import { settings, movies, episodes } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

export interface JournalEntry {
  id: string;
  oldPath: string;
  newPath: string;
  mediaId: string;
  mediaType: "movie" | "episode";
  executedAt: string;
  undoneAt?: string;
}

export interface JournalBatch {
  batchId: string;
  executedAt: string;
  entries: JournalEntry[];
  undoneAt?: string;
}

const JOURNAL_KEY = "rename_journal";

async function loadJournal(): Promise<JournalBatch[]> {
  const db = getDb();
  const [row] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, JOURNAL_KEY));
  if (!row) return [];
  return (row.value as JournalBatch[]) ?? [];
}

async function saveJournal(batches: JournalBatch[]): Promise<void> {
  const db = getDb();
  await db
    .insert(settings)
    .values({ key: JOURNAL_KEY, value: batches })
    .onConflictDoUpdate({ target: settings.key, set: { value: batches, updatedAt: new Date() } });
}

export async function recordBatch(entries: Omit<JournalEntry, "id" | "executedAt">[]): Promise<string> {
  const batchId = randomUUID();
  const now = new Date().toISOString();

  const journalEntries: JournalEntry[] = entries.map((e) => ({
    ...e,
    id: randomUUID(),
    executedAt: now,
  }));

  const batches = await loadJournal();
  batches.unshift({ batchId, executedAt: now, entries: journalEntries });

  // Keep only last 100 batches / 30 days
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const pruned = batches
    .filter((b) => new Date(b.executedAt).getTime() > cutoff)
    .slice(0, 100);

  await saveJournal(pruned);
  return batchId;
}

export async function undoBatch(batchId: string): Promise<{ undone: number; errors: string[] }> {
  const batches = await loadJournal();
  const batch = batches.find((b) => b.batchId === batchId);
  if (!batch) throw new Error(`Batch not found: ${batchId}`);
  if (batch.undoneAt) throw new Error("Batch already undone");

  const errors: string[] = [];
  let undone = 0;

  const db = getDb();

  // Reverse order to handle subdirectory renames correctly
  for (const entry of [...batch.entries].reverse()) {
    try {
      await fs.mkdir(path.dirname(entry.oldPath), { recursive: true });
      await fs.rename(entry.newPath, entry.oldPath);

      // Restore the file path in the DB so the library reflects the undone rename
      if (entry.mediaType === "movie") {
        await db.update(movies)
          .set({ filePath: entry.oldPath, updatedAt: new Date() })
          .where(eq(movies.id, entry.mediaId));
      } else {
        await db.update(episodes)
          .set({ filePath: entry.oldPath, updatedAt: new Date() })
          .where(eq(episodes.id, entry.mediaId));
      }

      undone++;
    } catch (err) {
      errors.push(`Failed to undo ${entry.newPath} → ${entry.oldPath}: ${String(err)}`);
    }
  }

  batch.undoneAt = new Date().toISOString();
  await saveJournal(batches);

  return { undone, errors };
}

export async function listBatches(): Promise<Omit<JournalBatch, "entries">[]> {
  const batches = await loadJournal();
  return batches.map(({ entries: _, ...b }) => b);
}

export async function getBatch(batchId: string): Promise<JournalBatch | null> {
  const batches = await loadJournal();
  return batches.find((b) => b.batchId === batchId) ?? null;
}
