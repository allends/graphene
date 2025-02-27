import { Database } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "./schema";

export class DatabaseService {
  private static instance: DatabaseService;
  private db: ReturnType<typeof drizzle>;
  private sqlite: Database;

  private constructor() {
    const dbPath = join(homedir(), ".graphene", "graphene.db");

    // Ensure the directory exists
    mkdir(join(homedir(), ".graphene"), { recursive: true });

    this.sqlite = new Database(dbPath);
    this.db = drizzle(this.sqlite, { schema });

    // Run migrations
    migrate(this.db, {
      migrationsFolder: join(__dirname, "migrations"),
    });
  }

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  public getDb() {
    return this.db;
  }

  public async createStack(
    name: string,
    repositoryName: string,
    baseBranch: string,
    description?: string,
  ) {
    return this.db
      .insert(schema.stacks)
      .values({
        name: `stack/${name}`,
        repository_name: repositoryName,
        base_branch: baseBranch,
      })
      .returning();
  }

  public async getStacks() {
    return this.db.select().from(schema.stacks);
  }

  public async addBranchToStack(
    stackId: number,
    branchName: string,
    position: number,
    parentBranchId?: number,
  ) {
    return this.db
      .insert(schema.branches)
      .values({
        name: branchName,
        stack_id: stackId,
        parent_id: parentBranchId,
        position,
        status: "active",
      })
      .returning();
  }

  public async getBranchesInStack(stackId: number) {
    return this.db
      .select()
      .from(schema.branches)
      .where(sql`stack_id = ${stackId}`)
      .orderBy(schema.branches.position);
  }

  public async updateBranchStatus(
    branchId: number,
    status: "active" | "merged" | "abandoned",
  ) {
    return this.db
      .update(schema.branches)
      .set({
        status,
        updated_at: new Date(),
      })
      .where(sql`id = ${branchId}`)
      .returning();
  }

  public async getBaseBranches(repositoryName: string): Promise<string[]> {
    return this.db
      .select()
      .from(schema.repositories)
      .where(sql`name = ${repositoryName}`)
      .then((res) =>
        res[0].base_branches ? JSON.parse(res[0].base_branches) : ["main"],
      );
  }
}

export * from "./schema";
export { StackService } from "@allends/graphene-core/services/stack";
