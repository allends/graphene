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
import { join } from "node:path";
import * as schema from "@allends/graphene-database/src/schema";
import {
  branches,
  stacks,
  repositories,
} from "@allends/graphene-database/src/schema";
import { DatabaseService } from "@allends/graphene-database/src";
import { GitService } from "../git";
import { PullRequestService } from "../pullRequest";

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

describe("PullRequestService", () => {
  let service: InstanceType<typeof PullRequestService>;
  let dbSpy: ReturnType<typeof spyOn>;
  let gitSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    createTestDb();
    seedRepository();

    // Spy on dependency getInstance calls BEFORE creating PullRequestService
    dbSpy = spyOn(DatabaseService, "getInstance").mockReturnValue(
      mockDbService as any
    );
    gitSpy = spyOn(GitService, "getInstance").mockReturnValue(mockGit as any);

    (PullRequestService as any).instance = undefined;
    service = PullRequestService.getInstance();
    (service as any).db = mockDbService;
    (service as any).git = mockGit;

    mockGit.getBaseBranch.mockReset();
    mockGit.getBaseBranch.mockImplementation(() => Promise.resolve("main"));
  });

  afterEach(() => {
    dbSpy.mockRestore();
    gitSpy.mockRestore();
  });

  describe("getInstance", () => {
    test("returns same instance on multiple calls", () => {
      const a = PullRequestService.getInstance();
      const b = PullRequestService.getInstance();
      expect(a).toBe(b);
    });
  });

  describe("createPullRequest", () => {
    test("throws when branch is not in a stack", async () => {
      expect(service.createPullRequest("untracked")).rejects.toThrow(
        "not part of a stack"
      );
    });

    test("uses base branch for bottom-of-stack branch (position 0, no parent below)", async () => {
      const stack = seedStack("stack/feature");
      seedBranch("feature-1", stack.id, 0);

      // Mock the private createGitHubPR to avoid real gh calls
      const mockCreateGitHubPR = mock(() =>
        Promise.resolve("https://github.com/owner/repo/pull/1")
      );
      (service as any).createGitHubPR = mockCreateGitHubPR;

      const url = await service.createPullRequest("feature-1");
      expect(url).toBe("https://github.com/owner/repo/pull/1");

      // Should target the base branch (main)
      expect(mockCreateGitHubPR).toHaveBeenCalledWith({
        title: "feature-1",
        head: "feature-1",
        base: "main",
      });
    });

    test("targets parent branch for non-bottom branch when parent has PR", async () => {
      const stack = seedStack("stack/feature");
      seedBranch("feature-1", stack.id, 0);
      seedBranch("feature-2", stack.id, 1);

      // Mock checkPRExists to return true for parent
      const mockCheckPR = mock(() => Promise.resolve(true));
      (service as any).checkPRExists = mockCheckPR;

      // Mock createGitHubPR
      const mockCreateGitHubPR = mock(() =>
        Promise.resolve("https://github.com/owner/repo/pull/2")
      );
      (service as any).createGitHubPR = mockCreateGitHubPR;

      const url = await service.createPullRequest("feature-2");
      expect(url).toBe("https://github.com/owner/repo/pull/2");

      // Should check if parent has a PR
      expect(mockCheckPR).toHaveBeenCalledWith("feature-1");

      // Should target the parent branch
      expect(mockCreateGitHubPR).toHaveBeenCalledWith({
        title: "feature-2",
        head: "feature-2",
        base: "feature-1",
      });
    });

    test("throws when parent branch has no open PR", async () => {
      const stack = seedStack("stack/feature");
      seedBranch("feature-1", stack.id, 0);
      seedBranch("feature-2", stack.id, 1);

      // Mock checkPRExists to return false for parent
      const mockCheckPR = mock(() => Promise.resolve(false));
      (service as any).checkPRExists = mockCheckPR;

      expect(service.createPullRequest("feature-2")).rejects.toThrow(
        "Parent branch must have an open PR"
      );
    });
  });

  describe("checkPRExists", () => {
    test("is a function on the service", () => {
      expect(typeof service.checkPRExists).toBe("function");
    });
  });

  describe("getBranchesWithClosedPullRequests", () => {
    test("is a function on the service", () => {
      expect(typeof service.getBranchesWithClosedPullRequests).toBe("function");
    });
  });
});
