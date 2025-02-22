import { homedir } from "node:os";
import { join } from "node:path";
import type { Config } from "drizzle-kit";
import { mkdir } from "node:fs/promises";

const dbPath = join(homedir(), ".graphene", "graphene.db");

export default {
  schema: "./src/schema.ts",
  out: "./src/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: `file:${dbPath}`,
  },
} satisfies Config;
