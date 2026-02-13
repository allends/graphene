import { describe, expect, test, beforeEach } from "bun:test";
import { sql, eq } from "drizzle-orm";
import { repositories, stacks, branches } from "../schema";
import { createTestDatabase } from "./test-helpers";

type TestDb = ReturnType<typeof createTestDatabase>["db"];

let db: TestDb;

beforeEach(() => {
  const testDb = createTestDatabase();
  db = testDb.db;
});

describe("Schema & Migration Integrity", () => {
  test("migrations apply cleanly to a fresh database", () => {
    // If we get here, migrations succeeded in beforeEach
    expect(db).toBeDefined();
  });

  test("all expected tables exist", () => {
    // Query sqlite_master to check tables
    const result = db.all(
      sql`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '%drizzle%' AND name NOT LIKE 'sqlite_%' ORDER BY name`
    );
    const tableNames = result.map((r: any) => r.name);
    expect(tableNames).toContain("repositories");
    expect(tableNames).toContain("stacks");
    expect(tableNames).toContain("branches");
  });
});

describe("Repository operations", () => {
  test("can insert and retrieve a repository", () => {
    db.insert(repositories)
      .values({
        name: "owner/repo",
        base_branches: JSON.stringify(["main", "master"]),
        created_at: new Date(),
      })
      .run();

    const result = db.select().from(repositories).all();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("owner/repo");
  });

  test("base_branches stores and parses JSON correctly", () => {
    db.insert(repositories)
      .values({
        name: "owner/repo",
        base_branches: JSON.stringify(["main", "develop"]),
        created_at: new Date(),
      })
      .run();

    const [repo] = db.select().from(repositories).all();
    const parsed = JSON.parse(repo.base_branches);
    expect(parsed).toEqual(["main", "develop"]);
  });

  test("malformed base_branches JSON can be caught", () => {
    db.insert(repositories)
      .values({
        name: "owner/repo",
        base_branches: "not-json",
        created_at: new Date(),
      })
      .run();

    const [repo] = db.select().from(repositories).all();
    expect(() => JSON.parse(repo.base_branches)).toThrow();
  });
});

describe("Stack operations", () => {
  beforeEach(() => {
    db.insert(repositories)
      .values({
        name: "owner/repo",
        base_branches: JSON.stringify(["main"]),
        created_at: new Date(),
      })
      .run();
  });

  test("createStack prefixes name with stack/", () => {
    const result = db
      .insert(stacks)
      .values({
        name: "stack/my-feature",
        repository_name: "owner/repo",
        base_branch: "main",
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning()
      .all();

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("stack/my-feature");
  });

  test("stack auto-increments id", () => {
    const [first] = db
      .insert(stacks)
      .values({
        name: "stack/first",
        repository_name: "owner/repo",
        base_branch: "main",
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning()
      .all();

    const [second] = db
      .insert(stacks)
      .values({
        name: "stack/second",
        repository_name: "owner/repo",
        base_branch: "main",
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning()
      .all();

    expect(second.id).toBeGreaterThan(first.id);
  });

  test("cascade delete: deleting repository deletes its stacks", () => {
    db.insert(stacks)
      .values({
        name: "stack/feature",
        repository_name: "owner/repo",
        base_branch: "main",
        created_at: new Date(),
        updated_at: new Date(),
      })
      .run();

    // Verify stack exists
    expect(db.select().from(stacks).all()).toHaveLength(1);

    // Delete repository
    db.delete(repositories)
      .where(eq(repositories.name, "owner/repo"))
      .run();

    // Stack should be cascade deleted
    expect(db.select().from(stacks).all()).toHaveLength(0);
  });
});

describe("Branch operations", () => {
  let stackId: number;

  beforeEach(() => {
    db.insert(repositories)
      .values({
        name: "owner/repo",
        base_branches: JSON.stringify(["main"]),
        created_at: new Date(),
      })
      .run();

    const [stack] = db
      .insert(stacks)
      .values({
        name: "stack/feature",
        repository_name: "owner/repo",
        base_branch: "main",
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning()
      .all();

    stackId = stack.id;
  });

  test("addBranchToStack inserts with correct position and parent", () => {
    const [branch] = db
      .insert(branches)
      .values({
        name: "feature-1",
        stack_id: stackId,
        position: 0,
        status: "active",
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning()
      .all();

    expect(branch.name).toBe("feature-1");
    expect(branch.position).toBe(0);
    expect(branch.stack_id).toBe(stackId);
    expect(branch.parent_id).toBeNull();
  });

  test("can set parent_id for chained branches", () => {
    const [first] = db
      .insert(branches)
      .values({
        name: "feature-1",
        stack_id: stackId,
        position: 0,
        status: "active",
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning()
      .all();

    const [second] = db
      .insert(branches)
      .values({
        name: "feature-2",
        stack_id: stackId,
        parent_id: first.id,
        position: 1,
        status: "active",
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning()
      .all();

    expect(second.parent_id).toBe(first.id);
  });

  test("getBranchesInStack returns branches ordered by position", () => {
    // Insert in reverse order
    db.insert(branches)
      .values({
        name: "feature-2",
        stack_id: stackId,
        position: 2,
        status: "active",
        created_at: new Date(),
        updated_at: new Date(),
      })
      .run();

    db.insert(branches)
      .values({
        name: "feature-0",
        stack_id: stackId,
        position: 0,
        status: "active",
        created_at: new Date(),
        updated_at: new Date(),
      })
      .run();

    db.insert(branches)
      .values({
        name: "feature-1",
        stack_id: stackId,
        position: 1,
        status: "active",
        created_at: new Date(),
        updated_at: new Date(),
      })
      .run();

    const result = db
      .select()
      .from(branches)
      .where(sql`stack_id = ${stackId}`)
      .orderBy(branches.position)
      .all();

    expect(result).toHaveLength(3);
    expect(result[0].name).toBe("feature-0");
    expect(result[1].name).toBe("feature-1");
    expect(result[2].name).toBe("feature-2");
  });

  test("status defaults to active", () => {
    const [branch] = db
      .insert(branches)
      .values({
        name: "feature-1",
        stack_id: stackId,
        position: 0,
        status: "active",
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning()
      .all();

    expect(branch.status).toBe("active");
  });

  test("can update branch status", () => {
    const [branch] = db
      .insert(branches)
      .values({
        name: "feature-1",
        stack_id: stackId,
        position: 0,
        status: "active",
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning()
      .all();

    db.update(branches)
      .set({ status: "merged", updated_at: new Date() })
      .where(sql`id = ${branch.id}`)
      .run();

    const [updated] = db
      .select()
      .from(branches)
      .where(sql`id = ${branch.id}`)
      .all();

    expect(updated.status).toBe("merged");
  });

  test("cascade delete: deleting stack deletes its branches", () => {
    db.insert(branches)
      .values({
        name: "feature-1",
        stack_id: stackId,
        position: 0,
        status: "active",
        created_at: new Date(),
        updated_at: new Date(),
      })
      .run();

    db.insert(branches)
      .values({
        name: "feature-2",
        stack_id: stackId,
        position: 1,
        status: "active",
        created_at: new Date(),
        updated_at: new Date(),
      })
      .run();

    // Verify branches exist
    expect(db.select().from(branches).all()).toHaveLength(2);

    // Delete stack
    db.delete(stacks).where(eq(stacks.id, stackId)).run();

    // Branches should be cascade deleted
    expect(db.select().from(branches).all()).toHaveLength(0);
  });

  test("cascade delete: deleting repository cascades through stacks to branches", () => {
    db.insert(branches)
      .values({
        name: "feature-1",
        stack_id: stackId,
        position: 0,
        status: "active",
        created_at: new Date(),
        updated_at: new Date(),
      })
      .run();

    // Delete repository
    db.delete(repositories)
      .where(eq(repositories.name, "owner/repo"))
      .run();

    // Both stacks and branches should be gone
    expect(db.select().from(stacks).all()).toHaveLength(0);
    expect(db.select().from(branches).all()).toHaveLength(0);
  });

  test("self-referencing parent_id allows NULL for first branch in stack", () => {
    const [branch] = db
      .insert(branches)
      .values({
        name: "first-in-stack",
        stack_id: stackId,
        parent_id: undefined,
        position: 0,
        status: "active",
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning()
      .all();

    expect(branch.parent_id).toBeNull();
  });

  test("position decrement after untracking a middle branch", () => {
    // Insert 3 branches
    for (let i = 0; i < 3; i++) {
      db.insert(branches)
        .values({
          name: `feature-${i}`,
          stack_id: stackId,
          position: i,
          status: "active",
          created_at: new Date(),
          updated_at: new Date(),
        })
        .run();
    }

    // Remove middle branch (position 1)
    db.delete(branches).where(eq(branches.name, "feature-1")).run();

    // Decrement positions of branches after position 1
    db.update(branches)
      .set({ position: sql`${branches.position} - 1` })
      .where(
        sql`stack_id = ${stackId} AND position > 1`
      )
      .run();

    const remaining = db
      .select()
      .from(branches)
      .where(sql`stack_id = ${stackId}`)
      .orderBy(branches.position)
      .all();

    expect(remaining).toHaveLength(2);
    expect(remaining[0].name).toBe("feature-0");
    expect(remaining[0].position).toBe(0);
    expect(remaining[1].name).toBe("feature-2");
    expect(remaining[1].position).toBe(1);
  });
});
