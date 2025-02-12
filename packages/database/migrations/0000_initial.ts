import type { Database } from "better-sqlite3";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { DatabaseService } from "../src";

const db = DatabaseService.getInstance().getDb();

export async function up() {
  await db.run(sql`
    CREATE TABLE stacks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE branches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      stack_id INTEGER REFERENCES stacks(id),
      parent_id INTEGER REFERENCES branches(id),
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

export async function down() {
  await db.run(sql`
    DROP TABLE branches;
    DROP TABLE stacks;
  `);
}
