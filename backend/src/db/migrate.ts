import { migrate } from "drizzle-orm/node-postgres/migrator";
import { getDb, closeDb } from "./index.js";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runMigrations() {
  console.log("Running database migrations...");
  const db = getDb();
  await migrate(db, { migrationsFolder: path.join(__dirname, "migrations") });
  console.log("Migrations complete.");
  await closeDb();
}

runMigrations().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
