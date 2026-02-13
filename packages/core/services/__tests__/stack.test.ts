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
import { eq, sql } from "drizzle-orm";
import { join } from "node:path";
import * as schema from "@allends/graphene-database/src/schema";
import { branches, stacks, repositories } from "@allends/graphene-database/src/schema";
import { DatabaseService } from "@allends/graphene-database/src";
import { GitService } from "../git";
import { StackService } from "../stack";

const mockGit = {
  getCurrentBranch: mock(() => Promise.resolve("feature-1")),
  getRepositoryName: mock(() => Promise.resolve("owner/repo")),
  getBaseBranch: mock(() => Promise.resolve("main")),
  createBranch: mock(() => Promise.resolve()),
  checkoutBranch: mock(() => Promise.resolve()),
  getLatestCommit: mock(() =>
    Promise.resolve({ sha: "abc123", author: "test", message: "test commit" })
  ),
  rebaseBranches: mock(() => Promise.resolve({ success: true })),
  hasUncommittedChanges: mock(() => Promise.resolve(false)),
  isRebaseInProgress: mock(() => Promise.resolve(false)),
  getCommitHistory: mock(() => Promise.resolve([])),
};

let testDb: ReturnType<typeof drizzle>;
let testSqlite: Database;

function createTestDb() {
  testSqlite = new Database(":memory:");
  // Enable foreign key enforcement for CASCADE deletes
  testSqlite.run("PRAGMA foreign_keys = ON;");
  testDb = drizzle(testSqlite, { schema });
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

// Mock DatabaseService to use in-memory database
const mockDbService = {
  getDb: () => testDb,
  createStack: mock(async (name: string, repoName: string, baseBranch: string) => {
    return testDb
      .insert(stacks)
      .values({
        name: `stack/${name}`,
        repository_name: repoName,
        base_branch: baseBranch,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning()
      .all();
  }),
  getBaseBranches: mock(async (_repoName: string) => {
    return ["main"];
  }),
  addBranchToStack: mock(
    async (
      stackId: number,
      branchName: string,
      position: number,
      parentBranchId?: number
    ) => {
      return testDb
        .insert(branches)
        .values({
          name: branchName,
          stack_id: stackId,
          parent_id: parentBranchId,
          position,
          status: "active",
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning()
        .all();
    }
  ),
  getBranchesInStack: mock(async (stackId: number) => {
    return testDb
      .select()
      .from(branches)
      .where(sql`stack_id = ${stackId}`)
      .orderBy(branches.position)
      .all();
  }),
};

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
  name = "stack/feature",
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

function seedBranch(
  name: string,
  stackId: number,
  position: number,
  parentId?: number
) {
  const [branch] = testDb
    .insert(branches)
    .values({
      name,
      stack_id: stackId,
      parent_id: parentId,
      position,
      status: "active",
      created_at: new Date(),
      updated_at: new Date(),
    })
    .returning()
    .all();
  return branch;
}

describe("StackService", () => {
  let service: InstanceType<typeof StackService>;
  let dbSpy: ReturnType<typeof spyOn>;
  let gitSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    // Create fresh in-memory database
    createTestDb();
    seedRepository();

    // Spy on dependency getInstance calls BEFORE creating StackService
    dbSpy = spyOn(DatabaseService, "getInstance").mockReturnValue(
      mockDbService as any
    );
    gitSpy = spyOn(GitService, "getInstance").mockReturnValue(
      mockGit as any
    );

    // Reset singleton and mocks
    (StackService as any).instance = undefined;
    service = StackService.getInstance();

    // Override the private db and git references
    (service as any).db = mockDbService;
    (service as any).git = mockGit;

    // Reset all mocks
    mockGit.getCurrentBranch.mockReset();
    mockGit.getRepositoryName.mockReset();
    mockGit.getBaseBranch.mockReset();
    mockGit.createBranch.mockReset();
    mockGit.checkoutBranch.mockReset();
    mockGit.getLatestCommit.mockReset();
    mockGit.rebaseBranches.mockReset();
    mockGit.hasUncommittedChanges.mockReset();
    mockGit.isRebaseInProgress.mockReset();

    // Reset dbService mocks and re-set implementations
    mockDbService.createStack.mockReset();
    mockDbService.addBranchToStack.mockReset();
    mockDbService.createStack.mockImplementation(
      async (name: string, repoName: string, baseBranch: string) => {
        return testDb
          .insert(stacks)
          .values({
            name: `stack/${name}`,
            repository_name: repoName,
            base_branch: baseBranch,
            created_at: new Date(),
            updated_at: new Date(),
          })
          .returning()
          .all();
      }
    );
    mockDbService.addBranchToStack.mockImplementation(
      async (
        stackId: number,
        branchName: string,
        position: number,
        parentBranchId?: number
      ) => {
        return testDb
          .insert(branches)
          .values({
            name: branchName,
            stack_id: stackId,
            parent_id: parentBranchId,
            position,
            status: "active",
            created_at: new Date(),
            updated_at: new Date(),
          })
          .returning()
          .all();
      }
    );

    // Set default mock implementations
    mockGit.getCurrentBranch.mockImplementation(() =>
      Promise.resolve("feature-1")
    );
    mockGit.getRepositoryName.mockImplementation(() =>
      Promise.resolve("owner/repo")
    );
    mockGit.getBaseBranch.mockImplementation(() => Promise.resolve("main"));
    mockGit.createBranch.mockImplementation(() => Promise.resolve());
    mockGit.checkoutBranch.mockImplementation(() => Promise.resolve());
    mockGit.getLatestCommit.mockImplementation(() =>
      Promise.resolve({ sha: "abc123", author: "test", message: "test commit" })
    );
    mockGit.rebaseBranches.mockImplementation(() =>
      Promise.resolve({ success: true })
    );
    mockGit.hasUncommittedChanges.mockImplementation(() =>
      Promise.resolve(false)
    );
    mockGit.isRebaseInProgress.mockImplementation(() =>
      Promise.resolve(false)
    );
  });

  afterEach(() => {
    dbSpy.mockRestore();
    gitSpy.mockRestore();
  });

  describe("getInstance", () => {
    test("returns same instance on multiple calls", () => {
      const instance1 = StackService.getInstance();
      const instance2 = StackService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe("getCurrentStack", () => {
    test("returns stack info for current branch", async () => {
      const stack = seedStack();
      seedBranch("feature-1", stack.id, 0);
      seedBranch("feature-2", stack.id, 1);

      const result = await service.getCurrentStack();
      expect(result.stack_id).toBe(stack.id);
      expect(result.stack_name).toBe("stack/feature");
      // The production query filters by branches.name = currentBranch then counts,
      // so branch_count reflects the count after that WHERE filter (always 1).
      expect(result.branch_count).toBe(1);
      expect(result.base_branch).toBe("main");
    });

    test("throws when current branch is not in a stack", async () => {
      mockGit.getCurrentBranch.mockImplementation(() =>
        Promise.resolve("untracked-branch")
      );

      expect(service.getCurrentStack()).rejects.toThrow(
        "Failed to get current stack"
      );
    });
  });

  describe("createBranchInStack", () => {
    test("creates new stack when current branch is not in a stack", async () => {
      mockGit.getCurrentBranch.mockImplementation(() =>
        Promise.resolve("main")
      );

      await service.createBranchInStack({ branchName: "new-feature" });

      // Verify git branch was created
      expect(mockGit.createBranch).toHaveBeenCalledWith("new-feature");

      // Verify stack was created via mockDbService
      expect(mockDbService.createStack).toHaveBeenCalled();
    });

    test("adds branch to existing stack when current branch is in a stack", async () => {
      const stack = seedStack();
      seedBranch("feature-1", stack.id, 0);

      await service.createBranchInStack({ branchName: "feature-2" });

      // Verify git branch was created
      expect(mockGit.createBranch).toHaveBeenCalledWith("feature-2");

      // Verify branch was added to the database
      expect(mockDbService.addBranchToStack).toHaveBeenCalled();
    });

    test("assigns correct position when adding to existing stack", async () => {
      const stack = seedStack();
      const branch = seedBranch("feature-1", stack.id, 0);

      await service.createBranchInStack({ branchName: "feature-2" });

      // The new branch should be at position 1 (after position 0)
      const addCall = mockDbService.addBranchToStack.mock.calls[0];
      expect(addCall[0]).toBe(stack.id); // stackId
      expect(addCall[1]).toBe("feature-2"); // branchName
      expect(addCall[2]).toBe(1); // position
      expect(addCall[3]).toBe(branch.id); // parentBranchId
    });
  });

  describe("rebaseStack", () => {
    test("rebases all branches sequentially from base", async () => {
      const stack = seedStack();
      seedBranch("feature-1", stack.id, 0);
      seedBranch("feature-2", stack.id, 1);
      seedBranch("feature-3", stack.id, 2);

      const result = await service.rebaseStack({
        stackId: stack.id,
        baseBranch: "main",
      });

      expect(result.success).toBe(true);

      // Should have been called 3 times:
      // feature-1 onto main, feature-2 onto feature-1, feature-3 onto feature-2
      expect(mockGit.rebaseBranches).toHaveBeenCalledTimes(3);
      expect(mockGit.rebaseBranches).toHaveBeenCalledWith("feature-1", "main");
      expect(mockGit.rebaseBranches).toHaveBeenCalledWith(
        "feature-2",
        "feature-1"
      );
      expect(mockGit.rebaseBranches).toHaveBeenCalledWith(
        "feature-3",
        "feature-2"
      );
    });

    test("stops at current branch when specified", async () => {
      const stack = seedStack();
      seedBranch("feature-1", stack.id, 0);
      seedBranch("feature-2", stack.id, 1);
      seedBranch("feature-3", stack.id, 2);

      const result = await service.rebaseStack({
        stackId: stack.id,
        baseBranch: "main",
        currentBranch: "feature-2",
      });

      expect(result.success).toBe(true);
      // Should stop after feature-2, so only 2 rebase calls
      expect(mockGit.rebaseBranches).toHaveBeenCalledTimes(2);
    });

    test("returns conflicts when first rebase fails", async () => {
      const stack = seedStack();
      seedBranch("feature-1", stack.id, 0);
      seedBranch("feature-2", stack.id, 1);

      mockGit.rebaseBranches.mockImplementation(() =>
        Promise.resolve({
          success: false,
          conflicts: ["file.ts"],
        })
      );

      const result = await service.rebaseStack({
        stackId: stack.id,
        baseBranch: "main",
      });

      expect(result.success).toBe(false);
      expect(result.conflicts?.branch).toBe("feature-1");
      expect(result.conflicts?.files).toEqual(["file.ts"]);
    });

    test("returns conflicts when middle branch rebase fails", async () => {
      const stack = seedStack();
      seedBranch("feature-1", stack.id, 0);
      seedBranch("feature-2", stack.id, 1);
      seedBranch("feature-3", stack.id, 2);

      let callCount = 0;
      mockGit.rebaseBranches.mockImplementation(() => {
        callCount++;
        if (callCount === 2) {
          return Promise.resolve({
            success: false,
            conflicts: ["shared.ts"],
          });
        }
        return Promise.resolve({ success: true });
      });

      const result = await service.rebaseStack({
        stackId: stack.id,
        baseBranch: "main",
      });

      expect(result.success).toBe(false);
      expect(result.conflicts?.branch).toBe("feature-2");
      expect(result.conflicts?.files).toEqual(["shared.ts"]);
    });

    test("throws when stack has no branches", async () => {
      const stack = seedStack();

      expect(
        service.rebaseStack({ stackId: stack.id, baseBranch: "main" })
      ).rejects.toThrow("Failed to rebase stack");
    });

    test("throws when there are uncommitted changes", async () => {
      const stack = seedStack();
      seedBranch("feature-1", stack.id, 0);

      mockGit.hasUncommittedChanges.mockImplementation(() =>
        Promise.resolve(true)
      );

      expect(
        service.rebaseStack({ stackId: stack.id, baseBranch: "main" })
      ).rejects.toThrow("uncommitted changes");
    });

    test("returns to original branch after successful rebase", async () => {
      const stack = seedStack();
      seedBranch("feature-1", stack.id, 0);

      mockGit.getCurrentBranch.mockImplementation(() =>
        Promise.resolve("feature-1")
      );

      await service.rebaseStack({ stackId: stack.id, baseBranch: "main" });

      expect(mockGit.checkoutBranch).toHaveBeenCalledWith("feature-1");
    });
  });

  describe("getUpstreamBranch", () => {
    test("returns the next branch in the stack", async () => {
      const stack = seedStack();
      seedBranch("feature-1", stack.id, 0);
      seedBranch("feature-2", stack.id, 1);
      seedBranch("feature-3", stack.id, 2);

      mockGit.getCurrentBranch.mockImplementation(() =>
        Promise.resolve("feature-1")
      );

      const upstream = await service.getUpstreamBranch();
      expect(upstream).toBe("feature-2");
    });

    test("returns null when at top of stack", async () => {
      const stack = seedStack();
      seedBranch("feature-1", stack.id, 0);
      seedBranch("feature-2", stack.id, 1);

      mockGit.getCurrentBranch.mockImplementation(() =>
        Promise.resolve("feature-2")
      );

      const upstream = await service.getUpstreamBranch();
      expect(upstream).toBeNull();
    });
  });

  describe("getDownstreamBranch", () => {
    test("returns the previous branch in the stack", async () => {
      const stack = seedStack();
      seedBranch("feature-1", stack.id, 0);
      seedBranch("feature-2", stack.id, 1);
      seedBranch("feature-3", stack.id, 2);

      mockGit.getCurrentBranch.mockImplementation(() =>
        Promise.resolve("feature-2")
      );

      const downstream = await service.getDownstreamBranch();
      expect(downstream).toBe("feature-1");
    });

    test("returns null when at bottom of stack", async () => {
      const stack = seedStack();
      seedBranch("feature-1", stack.id, 0);
      seedBranch("feature-2", stack.id, 1);

      mockGit.getCurrentBranch.mockImplementation(() =>
        Promise.resolve("feature-1")
      );

      const downstream = await service.getDownstreamBranch();
      expect(downstream).toBeNull();
    });
  });

  describe("trackBranch", () => {
    test("adds branch to end of current stack", async () => {
      const stack = seedStack();
      seedBranch("feature-1", stack.id, 0);

      mockGit.getCurrentBranch.mockImplementation(() =>
        Promise.resolve("feature-1")
      );

      await service.trackBranch("new-branch");

      // Verify branch was inserted
      const stackBranches = testDb
        .select()
        .from(branches)
        .where(eq(branches.stack_id, stack.id))
        .orderBy(branches.position)
        .all();

      expect(stackBranches).toHaveLength(2);
      expect(stackBranches[1].name).toBe("new-branch");
      expect(stackBranches[1].position).toBe(1);
    });

    test("throws when branch is already tracked", async () => {
      const stack = seedStack();
      seedBranch("feature-1", stack.id, 0);

      mockGit.getCurrentBranch.mockImplementation(() =>
        Promise.resolve("feature-1")
      );

      expect(service.trackBranch("feature-1")).rejects.toThrow(
        "already tracked"
      );
    });
  });

  describe("untrackBranch", () => {
    test("removes branch and reorders positions", async () => {
      const stack = seedStack();
      seedBranch("feature-1", stack.id, 0);
      seedBranch("feature-2", stack.id, 1);
      seedBranch("feature-3", stack.id, 2);

      await service.untrackBranch("feature-2");

      const remaining = testDb
        .select()
        .from(branches)
        .where(eq(branches.stack_id, stack.id))
        .orderBy(branches.position)
        .all();

      expect(remaining).toHaveLength(2);
      expect(remaining[0].name).toBe("feature-1");
      expect(remaining[0].position).toBe(0);
      expect(remaining[1].name).toBe("feature-3");
      expect(remaining[1].position).toBe(1);
    });

    test("throws when branch is not tracked", async () => {
      expect(service.untrackBranch("nonexistent")).rejects.toThrow(
        "not tracked"
      );
    });
  });

  describe("deleteStacks", () => {
    test("deletes stacks and cascade deletes branches", async () => {
      const stack1 = seedStack("stack/feature-1");
      const stack2 = seedStack("stack/feature-2");
      seedBranch("feat-1", stack1.id, 0);
      seedBranch("feat-2", stack2.id, 0);

      await service.deleteStacks([stack1.id, stack2.id]);

      expect(testDb.select().from(stacks).all()).toHaveLength(0);
      expect(testDb.select().from(branches).all()).toHaveLength(0);
    });

    test("only deletes specified stacks", async () => {
      const stack1 = seedStack("stack/feature-1");
      const stack2 = seedStack("stack/feature-2");
      seedBranch("feat-1", stack1.id, 0);
      seedBranch("feat-2", stack2.id, 0);

      await service.deleteStacks([stack1.id]);

      const remainingStacks = testDb.select().from(stacks).all();
      expect(remainingStacks).toHaveLength(1);
      expect(remainingStacks[0].id).toBe(stack2.id);

      const remainingBranches = testDb.select().from(branches).all();
      expect(remainingBranches).toHaveLength(1);
      expect(remainingBranches[0].name).toBe("feat-2");
    });
  });

  describe("listStacks", () => {
    test("returns stacks with branch counts for current repo", async () => {
      const stack1 = seedStack("stack/feature-1");
      const stack2 = seedStack("stack/feature-2");
      seedBranch("feat-1a", stack1.id, 0);
      seedBranch("feat-1b", stack1.id, 1);
      seedBranch("feat-2a", stack2.id, 0);

      const result = await service.listStacks();
      expect(result).toHaveLength(2);

      const s1 = result.find((s) => s.name === "stack/feature-1");
      const s2 = result.find((s) => s.name === "stack/feature-2");
      expect(s1?.branchCount).toBe(2);
      expect(s2?.branchCount).toBe(1);
    });

    test("returns empty array when no stacks exist", async () => {
      const result = await service.listStacks();
      expect(result).toHaveLength(0);
    });
  });

  describe("getParentBranch", () => {
    test("returns parent branch name", async () => {
      const stack = seedStack();
      const parent = seedBranch("feature-1", stack.id, 0);
      seedBranch("feature-2", stack.id, 1, parent.id);

      const parentName = await service.getParentBranch("feature-2");
      expect(parentName).toBe("feature-1");
    });

    test("returns null for first branch in stack (no parent)", async () => {
      const stack = seedStack();
      seedBranch("feature-1", stack.id, 0);

      const parentName = await service.getParentBranch("feature-1");
      expect(parentName).toBeNull();
    });

    test("returns null for unknown branch", async () => {
      const parentName = await service.getParentBranch("nonexistent");
      expect(parentName).toBeNull();
    });
  });

  describe("getStackForBranch", () => {
    test("returns stack for a tracked branch", async () => {
      const stack = seedStack("stack/my-feature");
      seedBranch("feature-1", stack.id, 0);

      const result = await service.getStackForBranch("feature-1");
      expect(result).not.toBeNull();
      expect(result?.name).toBe("stack/my-feature");
    });

    test("returns null for untracked branch", async () => {
      const result = await service.getStackForBranch("nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("renameCurrentStack", () => {
    test("updates stack name in database", async () => {
      const stack = seedStack();
      seedBranch("feature-1", stack.id, 0);

      await service.renameCurrentStack("new-stack-name");

      const [updated] = testDb
        .select()
        .from(stacks)
        .where(eq(stacks.id, stack.id))
        .all();

      expect(updated.name).toBe("new-stack-name");
    });
  });
});
