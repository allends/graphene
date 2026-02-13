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
import { eq } from "drizzle-orm";
import { join } from "node:path";
import * as schema from "@allends/graphene-database/src/schema";
import {
  branches,
  stacks,
  repositories,
} from "@allends/graphene-database/src/schema";
import { DatabaseService } from "@allends/graphene-database/src";
import { GitService } from "../git";
import { BranchService } from "../branches";

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

const mockGit = {
  getCurrentBranch: mock(() => Promise.resolve("feature-1")),
  getRepositoryName: mock(() => Promise.resolve("owner/repo")),
  getBaseBranch: mock(() => Promise.resolve("main")),
};

const mockDbService = {
  getDb: () => testDb,
};

// Spies are set up in beforeEach to avoid leaking across test files

function seedRepository(name = "owner/repo") {
  testDb
    .insert(repositories)
    .values({
      name,
      base_branches: JSON.stringify(["main", "master"]),
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

describe("BranchService", () => {
  let service: InstanceType<typeof BranchService>;
  let dbSpy: ReturnType<typeof spyOn>;
  let gitSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    createTestDb();
    seedRepository();

    // Spy on dependency getInstance calls BEFORE creating BranchService
    dbSpy = spyOn(DatabaseService, "getInstance").mockReturnValue(
      mockDbService as any
    );
    gitSpy = spyOn(GitService, "getInstance").mockReturnValue(mockGit as any);

    (BranchService as any).instance = undefined;
    service = BranchService.getInstance();
    (service as any).db = mockDbService;
    (service as any).git = mockGit;

    mockGit.getCurrentBranch.mockReset();
    mockGit.getRepositoryName.mockReset();
    mockGit.getBaseBranch.mockReset();

    mockGit.getCurrentBranch.mockImplementation(() =>
      Promise.resolve("feature-1")
    );
    mockGit.getRepositoryName.mockImplementation(() =>
      Promise.resolve("owner/repo")
    );
    mockGit.getBaseBranch.mockImplementation(() => Promise.resolve("main"));
  });

  afterEach(() => {
    dbSpy.mockRestore();
    gitSpy.mockRestore();
  });

  describe("getInstance", () => {
    test("returns same instance on multiple calls", () => {
      const a = BranchService.getInstance();
      const b = BranchService.getInstance();
      expect(a).toBe(b);
    });
  });

  describe("listBranches", () => {
    test("groups branches by stack name", async () => {
      const stack1 = seedStack("stack/feature-a");
      const stack2 = seedStack("stack/feature-b");
      seedBranch("feat-a1", stack1.id, 0);
      seedBranch("feat-a2", stack1.id, 1);
      seedBranch("feat-b1", stack2.id, 0);

      const result = await service.listBranches();

      expect(Object.keys(result)).toContain("stack/feature-a");
      expect(Object.keys(result)).toContain("stack/feature-b");
      expect(result["stack/feature-a"]).toHaveLength(2);
      expect(result["stack/feature-b"]).toHaveLength(1);
    });

    test("marks current branch correctly", async () => {
      const stack = seedStack("stack/feature");
      seedBranch("feature-1", stack.id, 0);
      seedBranch("feature-2", stack.id, 1);

      mockGit.getCurrentBranch.mockImplementation(() =>
        Promise.resolve("feature-1")
      );

      const result = await service.listBranches();
      const stackBranches = result["stack/feature"];

      const current = stackBranches.find((b) => b.name === "feature-1");
      const other = stackBranches.find((b) => b.name === "feature-2");

      expect(current?.current).toBe(true);
      expect(other?.current).toBe(false);
    });

    test("returns empty object when no tracked branches exist", async () => {
      const result = await service.listBranches();
      expect(Object.keys(result)).toHaveLength(0);
    });

    test("does not include 'No Stack' group when all branches have stacks", async () => {
      const stack = seedStack("stack/feature");
      seedBranch("feature-1", stack.id, 0);

      const result = await service.listBranches();
      expect(result["No Stack"]).toBeUndefined();
    });

    test("includes stackName on each branch", async () => {
      const stack = seedStack("stack/my-feature");
      seedBranch("feat-1", stack.id, 0);

      const result = await service.listBranches();
      expect(result["stack/my-feature"][0].stackName).toBe("stack/my-feature");
    });
  });

  describe("listBaseBranches", () => {
    test("returns base branches from repository config", async () => {
      const result = await service.listBaseBranches();
      expect(result).toEqual(["main", "master"]);
    });

    test("falls back to git base branch when no repo config", async () => {
      // Delete the repository config
      testDb
        .delete(repositories)
        .where(eq(repositories.name, "owner/repo"))
        .run();

      const result = await service.listBaseBranches();
      expect(result).toEqual(["main"]);
    });

    test("returns ['main'] when base_branches is null", async () => {
      // Update repository to have null-like base_branches
      testDb
        .update(repositories)
        .set({ base_branches: "" })
        .where(eq(repositories.name, "owner/repo"))
        .run();

      const result = await service.listBaseBranches();
      expect(result).toEqual(["main"]);
    });
  });
});
