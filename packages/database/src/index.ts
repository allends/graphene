import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { join } from "path";
import { homedir } from "os";
import { mkdir } from "fs/promises";
import * as schema from "./schema";
import { sql } from "drizzle-orm";

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
    baseBranch: string,
    description?: string
  ) {
    return this.db
      .insert(schema.stacks)
      .values({
        name,
        base_branch: baseBranch,
        description,
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
    parentBranchId?: number
  ) {
    return this.db
      .insert(schema.branches)
      .values({
        name: branchName,
        stack_id: stackId,
        parent_branch_id: parentBranchId,
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

  public async addCommit(
    branchId: number,
    sha: string,
    message: string,
    author: string
  ) {
    return this.db
      .insert(schema.commits)
      .values({
        branch_id: branchId,
        sha,
        message,
        author,
      })
      .returning();
  }

  public async updateBranchStatus(
    branchId: number,
    status: "active" | "merged" | "abandoned"
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
}

export * from "./schema";
export { StackService } from "@graphene/core/services/stack";
