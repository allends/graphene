import { join } from "path";
import { homedir } from "os";
import { mkdir } from "fs/promises";
import type { Config } from "drizzle-kit";

const dbPath = join(homedir(), ".graphene", "graphene.db");

export default {
  schema: "./src/schema.ts",
  out: "./src/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: `file:${dbPath}`,
  },
} satisfies Config;
