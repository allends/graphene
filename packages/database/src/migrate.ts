import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { Database } from "bun:sqlite";
import { join } from "path";
import { homedir } from "os";
import { mkdir } from "fs/promises";

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
