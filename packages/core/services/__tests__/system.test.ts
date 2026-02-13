import {
  describe,
  expect,
  test,
  beforeEach,
  afterEach,
  mock,
  spyOn,
} from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { eq, isNull } from "drizzle-orm";
import { join } from "node:path";
import * as schema from "@allends/graphene-database/src/schema";
import {
  branches,
  stacks,
  repositories,
} from "@allends/graphene-database/src/schema";
// Must import from the same path that system.ts uses for spy to work
import { DatabaseService } from "@allends/graphene-database";
import { PullRequestService } from "../pullRequest";
import { cleanupClosedPullRequestBranches } from "../system";

let testDb: ReturnType<typeof drizzle>;

function createTestDb() {
  const sqlite = new Database(":memory:");
  testDb = drizzle(sqlite, { schema });
  migrate(testDb, {
    migrationsFolder: join(
      __dirname,
      "..",
      "..",
      "..",
      "..",
      "packages",
      "database",
      "src",
      "migrations"
    ),
  });
  return testDb;
}

const mockDbService = {
  getDb: () => testDb,
};

let mockClosedPrBranches: string[] = [];

// Spies are set up in beforeEach to avoid leaking across test files

function seedRepository(name = "owner/repo") {
  testDb
    .insert(repositories)
    .values({
      name,
      base_branches: JSON.stringify(["main"]),
      created_at: new Date(),
    })
    .run();
}

function seedStack(
  name: string,
  repoName = "owner/repo",
  baseBranch = "main"
) {
  const [stack] = testDb
    .insert(stacks)
    .values({
      name,
      repository_name: repoName,
      base_branch: baseBranch,
      created_at: new Date(),
      updated_at: new Date(),
    })
    .returning()
    .all();
  return stack;
}

function seedBranch(name: string, stackId: number, position: number) {
  const [branch] = testDb
    .insert(branches)
    .values({
      name,
      stack_id: stackId,
      position,
      status: "active",
      created_at: new Date(),
      updated_at: new Date(),
    })
    .returning()
    .all();
  return branch;
}

describe("cleanupClosedPullRequestBranches", () => {
  let prGetInstanceSpy: ReturnType<typeof spyOn>;
  let dbSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    createTestDb();
    seedRepository();

    mockClosedPrBranches = [];

    // Spy on dependency getInstance calls
    dbSpy = spyOn(DatabaseService, "getInstance").mockReturnValue(
      mockDbService as any
    );

    // Spy on PullRequestService.getInstance to return our mock
    prGetInstanceSpy = spyOn(PullRequestService, "getInstance").mockReturnValue(
      {
        getBranchesWithClosedPullRequests: mock(() =>
          Promise.resolve(mockClosedPrBranches)
        ),
      } as any
    );
  });

  afterEach(() => {
    dbSpy.mockRestore();
    prGetInstanceSpy.mockRestore();
  });

  test("returns 0 when no closed PRs exist", async () => {
    mockClosedPrBranches = [];

    const deleted = await cleanupClosedPullRequestBranches();
    expect(deleted).toBe(0);
  });

  test("deletes branches with closed PRs from database", async () => {
    const stack = seedStack("stack/feature");
    seedBranch("feature-1", stack.id, 0);
    seedBranch("feature-2", stack.id, 1);

    mockClosedPrBranches = ["feature-1"];

    const deleted = await cleanupClosedPullRequestBranches();
    expect(deleted).toBe(1);

    const remaining = testDb.select().from(branches).all();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].name).toBe("feature-2");
  });

  test("does not delete base branches", async () => {
    const stack = seedStack("stack/feature");
    seedBranch("main", stack.id, 0);
    seedBranch("feature-1", stack.id, 1);

    mockClosedPrBranches = ["main", "feature-1"];

    const deleted = await cleanupClosedPullRequestBranches([
      "main",
      "master",
      "staging",
      "develop",
    ]);
    expect(deleted).toBe(1);

    // main should still exist
    const remaining = testDb.select().from(branches).all();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].name).toBe("main");
  });

  test("cleans up orphaned stacks after branch deletion", async () => {
    const stack1 = seedStack("stack/feature-1");
    const stack2 = seedStack("stack/feature-2");
    seedBranch("feat-1", stack1.id, 0);
    seedBranch("feat-2", stack2.id, 0);

    // Only feat-1 has a closed PR - stack1 will become orphaned
    mockClosedPrBranches = ["feat-1"];

    await cleanupClosedPullRequestBranches();

    const remainingStacks = testDb.select().from(stacks).all();
    // stack1 should be deleted (no branches left), stack2 should remain
    expect(remainingStacks).toHaveLength(1);
    expect(remainingStacks[0].name).toBe("stack/feature-2");
  });

  test("handles partial cleanup (some branches closed, some open)", async () => {
    const stack = seedStack("stack/feature");
    seedBranch("feature-1", stack.id, 0);
    seedBranch("feature-2", stack.id, 1);
    seedBranch("feature-3", stack.id, 2);

    // Only feature-1 and feature-3 have closed PRs
    mockClosedPrBranches = ["feature-1", "feature-3"];

    const deleted = await cleanupClosedPullRequestBranches();
    expect(deleted).toBe(2);

    const remaining = testDb.select().from(branches).all();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].name).toBe("feature-2");

    // Stack should still exist since feature-2 is still in it
    const remainingStacks = testDb.select().from(stacks).all();
    expect(remainingStacks).toHaveLength(1);
  });

  test("handles custom base branches list", async () => {
    const stack = seedStack("stack/feature");
    seedBranch("develop", stack.id, 0);
    seedBranch("staging", stack.id, 1);
    seedBranch("feature-1", stack.id, 2);

    mockClosedPrBranches = ["develop", "staging", "feature-1"];

    const deleted = await cleanupClosedPullRequestBranches([
      "develop",
      "staging",
    ]);

    // develop and staging should be protected, only feature-1 deleted
    expect(deleted).toBe(1);

    const remaining = testDb.select().from(branches).all();
    expect(remaining).toHaveLength(2);
    const names = remaining.map((b) => b.name).sort();
    expect(names).toEqual(["develop", "staging"]);
  });

  test("returns 0 when all closed PR branches are base branches", async () => {
    const stack = seedStack("stack/feature");
    seedBranch("main", stack.id, 0);

    mockClosedPrBranches = ["main"];

    const deleted = await cleanupClosedPullRequestBranches();
    expect(deleted).toBe(0);
  });
});
