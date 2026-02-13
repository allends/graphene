import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { join } from "node:path";
import * as schema from "../schema";

/**
 * Creates a fresh in-memory database with all migrations applied.
 * Each call returns an independent database instance for test isolation.
 */
export function createTestDatabase() {
  const sqlite = new Database(":memory:");
  // Enable foreign key enforcement (required for CASCADE deletes)
  sqlite.run("PRAGMA foreign_keys = ON;");

  const db = drizzle(sqlite, { schema });

  migrate(db, {
    migrationsFolder: join(__dirname, "..", "migrations"),
  });

  return { db, sqlite };
}
