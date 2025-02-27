import { Database } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";

async function main() {
  const dbPath = join(homedir(), ".graphene", "graphene.db");
  await mkdir(join(homedir(), ".graphene"), { recursive: true });

  const sqlite = new Database(dbPath);
  const db = drizzle(sqlite);

  console.log("Running migrations...");

  await migrate(db, {
    migrationsFolder: "./src/migrations",
  });

  console.log("Migrations completed!");
}

main();
