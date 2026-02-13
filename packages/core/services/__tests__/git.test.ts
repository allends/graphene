import { describe, expect, test, beforeEach, mock } from "bun:test";

// Import GitService directly from its source file to avoid mock.module contamination
import { GitService } from "../git";

type GitCommandResult = { output: string; error: string; exitCode: number };

/**
 * Helper to mock executeGitCommand on a GitService instance.
 */
function mockGitCommand(
  service: GitService,
  handler: (args: string[]) => GitCommandResult
) {
  const mockFn = mock(handler);
  (service as any).executeGitCommand = mockFn;
  return mockFn;
}

describe("GitService", () => {
  let git: GitService;

  beforeEach(() => {
    (GitService as any).instance = undefined;
    git = GitService.getInstance();
  });

  describe("getInstance", () => {
    test("returns same instance on multiple calls", () => {
      const instance1 = GitService.getInstance();
      const instance2 = GitService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe("getRepositoryName", () => {
    test("parses HTTPS remote URL correctly", async () => {
      mockGitCommand(git, () => ({
        output: "https://github.com/allends/graphene.git",
        error: "",
        exitCode: 0,
      }));

      const name = await git.getRepositoryName();
      expect(name).toBe("allends/graphene");
    });

    test("parses SSH remote URL correctly", async () => {
      mockGitCommand(git, () => ({
        output: "git@github.com:allends/graphene.git",
        error: "",
        exitCode: 0,
      }));

      const name = await git.getRepositoryName();
      expect(name).toBe("allends/graphene");
    });

    test("parses HTTPS URL without .git suffix", async () => {
      mockGitCommand(git, () => ({
        output: "https://github.com/allends/graphene",
        error: "",
        exitCode: 0,
      }));

      const name = await git.getRepositoryName();
      expect(name).toBe("allends/graphene");
    });

    test("throws on failed git command", async () => {
      mockGitCommand(git, () => ({
        output: "",
        error: "fatal: not a git repository",
        exitCode: 128,
      }));

      expect(git.getRepositoryName()).rejects.toThrow(
        "Failed to get repository name"
      );
    });

    test("throws on unparseable remote URL", async () => {
      mockGitCommand(git, () => ({
        output: "not-a-valid-url",
        error: "",
        exitCode: 0,
      }));

      expect(git.getRepositoryName()).rejects.toThrow(
        "Could not parse repository name from remote URL"
      );
    });
  });

  describe("getCurrentBranch", () => {
    test("returns trimmed branch name", async () => {
      mockGitCommand(git, () => ({
        output: "feature/my-branch",
        error: "",
        exitCode: 0,
      }));

      const branch = await git.getCurrentBranch();
      expect(branch).toBe("feature/my-branch");
    });

    test("throws on failure", async () => {
      mockGitCommand(git, () => ({
        output: "",
        error: "error",
        exitCode: 1,
      }));

      expect(git.getCurrentBranch()).rejects.toThrow(
        "Failed to get current branch"
      );
    });
  });

  describe("getBaseBranch", () => {
    test("returns main when main branch exists", async () => {
      mockGitCommand(git, (args) => {
        if (args.includes("rev-parse")) {
          return { output: "", error: "fatal", exitCode: 128 };
        }
        if (args.includes("--list")) {
          return { output: "  main\n", error: "", exitCode: 0 };
        }
        return { output: "", error: "", exitCode: 0 };
      });

      const base = await git.getBaseBranch();
      expect(base).toBe("main");
    });

    test("returns master when only master exists", async () => {
      mockGitCommand(git, (args) => {
        if (args.includes("rev-parse")) {
          return { output: "", error: "fatal", exitCode: 128 };
        }
        if (args.includes("--list")) {
          return { output: "  master\n", error: "", exitCode: 0 };
        }
        return { output: "", error: "", exitCode: 0 };
      });

      const base = await git.getBaseBranch();
      expect(base).toBe("master");
    });

    test("defaults to main when no branches found", async () => {
      mockGitCommand(git, (args) => {
        if (args.includes("rev-parse")) {
          return { output: "", error: "fatal", exitCode: 128 };
        }
        if (args.includes("--list")) {
          return { output: "\n", error: "", exitCode: 0 };
        }
        return { output: "", error: "", exitCode: 0 };
      });

      const base = await git.getBaseBranch();
      expect(base).toBe("main");
    });
  });

  describe("getLatestCommit", () => {
    test("parses commit info correctly", async () => {
      mockGitCommand(git, (args) => {
        if (args.includes("rev-parse")) {
          return { output: "abc123def", error: "", exitCode: 0 };
        }
        if (args.includes("log")) {
          return { output: "John Doe|Initial commit", error: "", exitCode: 0 };
        }
        return { output: "", error: "", exitCode: 0 };
      });

      const commit = await git.getLatestCommit();
      expect(commit.sha).toBe("abc123def");
      expect(commit.author).toBe("John Doe");
      expect(commit.message).toBe("Initial commit");
    });

    test("throws when rev-parse fails", async () => {
      mockGitCommand(git, () => ({
        output: "",
        error: "error",
        exitCode: 1,
      }));

      expect(git.getLatestCommit()).rejects.toThrow("Failed to get commit SHA");
    });
  });

  describe("rebaseBranches", () => {
    test("returns success when rebase succeeds", async () => {
      mockGitCommand(git, (args) => {
        if (args.includes("checkout")) {
          return { output: "", error: "", exitCode: 0 };
        }
        if (args.includes("rebase")) {
          return { output: "", error: "", exitCode: 0 };
        }
        return { output: "", error: "", exitCode: 0 };
      });

      const result = await git.rebaseBranches("feature", "main");
      expect(result.success).toBe(true);
      expect(result.conflicts).toBeUndefined();
    });

    test("returns conflicts when rebase fails", async () => {
      mockGitCommand(git, (args) => {
        if (args.includes("checkout")) {
          return { output: "", error: "", exitCode: 0 };
        }
        if (args.includes("rebase")) {
          return {
            output: "",
            error: "CONFLICT: merge conflict in file.ts",
            exitCode: 1,
          };
        }
        if (args.includes("diff")) {
          return { output: "file.ts\nother.ts", error: "", exitCode: 0 };
        }
        return { output: "", error: "", exitCode: 0 };
      });

      const result = await git.rebaseBranches("feature", "main");
      expect(result.success).toBe(false);
      expect(result.conflicts).toEqual(["file.ts", "other.ts"]);
    });

    test("throws when checkout fails", async () => {
      mockGitCommand(git, (args) => {
        if (args.includes("checkout")) {
          return {
            output: "",
            error: "error: pathspec 'nonexistent' did not match any file(s)",
            exitCode: 1,
          };
        }
        return { output: "", error: "", exitCode: 0 };
      });

      expect(git.rebaseBranches("nonexistent", "main")).rejects.toThrow(
        "Failed to rebase"
      );
    });
  });

  describe("isRebaseInProgress", () => {
    test("returns true when rebase is in progress", async () => {
      mockGitCommand(git, () => ({
        output:
          "interactive rebase in progress; onto abc123\nYou are currently rebasing branch 'feature' on 'abc123'.",
        error: "",
        exitCode: 0,
      }));

      expect(await git.isRebaseInProgress()).toBe(true);
    });

    test("returns false when no rebase", async () => {
      mockGitCommand(git, () => ({
        output: "On branch main\nnothing to commit, working tree clean",
        error: "",
        exitCode: 0,
      }));

      expect(await git.isRebaseInProgress()).toBe(false);
    });
  });

  describe("isMergeInProgress", () => {
    test("returns true when merge is in progress", async () => {
      mockGitCommand(git, () => ({
        output: "On branch feature\nmerge in progress",
        error: "",
        exitCode: 0,
      }));

      expect(await git.isMergeInProgress()).toBe(true);
    });

    test("returns false when no merge", async () => {
      mockGitCommand(git, () => ({
        output: "On branch main\nnothing to commit, working tree clean",
        error: "",
        exitCode: 0,
      }));

      expect(await git.isMergeInProgress()).toBe(false);
    });
  });

  describe("getAheadBehindCount", () => {
    test("parses ahead/behind output correctly", async () => {
      mockGitCommand(git, () => ({
        output: "3\t5",
        error: "",
        exitCode: 0,
      }));

      const result = await git.getAheadBehindCount("feature");
      expect(result.ahead).toBe(3);
      expect(result.behind).toBe(5);
    });

    test("returns zeros on failure", async () => {
      mockGitCommand(git, () => {
        throw new Error("no upstream");
      });

      const result = await git.getAheadBehindCount("feature");
      expect(result.ahead).toBe(0);
      expect(result.behind).toBe(0);
    });
  });

  describe("getModifiedFiles", () => {
    test("parses porcelain status output", async () => {
      mockGitCommand(git, () => ({
        output: " M src/file1.ts\n?? src/file2.ts\nA  src/file3.ts",
        error: "",
        exitCode: 0,
      }));

      const files = await git.getModifiedFiles();
      expect(files).toEqual(["src/file1.ts", "src/file2.ts", "src/file3.ts"]);
    });

    test("returns empty array for clean working directory", async () => {
      mockGitCommand(git, () => ({
        output: "",
        error: "",
        exitCode: 0,
      }));

      const files = await git.getModifiedFiles();
      expect(files).toEqual([]);
    });
  });

  describe("listLocalBranches", () => {
    test("parses branch list output", async () => {
      mockGitCommand(git, () => ({
        output: "main\nfeature-1\nfeature-2",
        error: "",
        exitCode: 0,
      }));

      const branches = await git.listLocalBranches();
      expect(branches).toEqual(["main", "feature-1", "feature-2"]);
    });

    test("filters out HEAD and empty lines", async () => {
      mockGitCommand(git, () => ({
        output: "main\nHEAD\nfeature-1\n",
        error: "",
        exitCode: 0,
      }));

      const branches = await git.listLocalBranches();
      expect(branches).toEqual(["main", "feature-1"]);
    });
  });

  describe("searchLocalBranches", () => {
    test("filters branches by case-insensitive query", async () => {
      mockGitCommand(git, () => ({
        output: "main\nfeature-auth\nfeature-ui\nbugfix-auth",
        error: "",
        exitCode: 0,
      }));

      const results = await git.searchLocalBranches("auth");
      expect(results).toEqual(["feature-auth", "bugfix-auth"]);
    });

    test("returns empty array for no matches", async () => {
      mockGitCommand(git, () => ({
        output: "main\nfeature-1",
        error: "",
        exitCode: 0,
      }));

      const results = await git.searchLocalBranches("nonexistent");
      expect(results).toEqual([]);
    });
  });

  describe("squashBranch", () => {
    test("uses provided message for squash commit", async () => {
      const calls: { args: string[] }[] = [];
      mockGitCommand(git, (args) => {
        calls.push({ args });
        if (args.includes("--show-current")) {
          return { output: "feature", error: "", exitCode: 0 };
        }
        if (args.includes("rev-parse") && args.includes("--abbrev-ref")) {
          return { output: "", error: "fatal", exitCode: 128 };
        }
        if (args.includes("--list")) {
          return { output: "  main\n", error: "", exitCode: 0 };
        }
        if (args.includes("merge-base")) {
          return { output: "abc123", error: "", exitCode: 0 };
        }
        if (args.includes("reset")) {
          return { output: "", error: "", exitCode: 0 };
        }
        if (args.includes("commit")) {
          return { output: "", error: "", exitCode: 0 };
        }
        return { output: "", error: "", exitCode: 0 };
      });

      await git.squashBranch("my squash message");

      const commitCall = calls.find(
        (c) => c.args.includes("commit") && c.args.includes("-m")
      );
      expect(commitCall).toBeDefined();
      expect(commitCall!.args).toContain("my squash message");
    });

    test("uses default message when none provided", async () => {
      const calls: { args: string[] }[] = [];
      mockGitCommand(git, (args) => {
        calls.push({ args });
        if (args.includes("--show-current")) {
          return { output: "feature", error: "", exitCode: 0 };
        }
        if (args.includes("rev-parse") && args.includes("--abbrev-ref")) {
          return { output: "", error: "fatal", exitCode: 128 };
        }
        if (args.includes("--list")) {
          return { output: "  main\n", error: "", exitCode: 0 };
        }
        if (args.includes("merge-base")) {
          return { output: "abc123", error: "", exitCode: 0 };
        }
        if (args.includes("reset")) {
          return { output: "", error: "", exitCode: 0 };
        }
        if (args.includes("commit")) {
          return { output: "", error: "", exitCode: 0 };
        }
        return { output: "", error: "", exitCode: 0 };
      });

      await git.squashBranch();

      const commitCall = calls.find(
        (c) => c.args.includes("commit") && c.args.includes("-m")
      );
      expect(commitCall).toBeDefined();
      expect(commitCall!.args).toContain("squash: combine all commits");
    });
  });

  describe("continueRebase", () => {
    test("returns success when continue succeeds", async () => {
      mockGitCommand(git, () => ({
        output: "",
        error: "",
        exitCode: 0,
      }));

      const result = await git.continueRebase();
      expect(result.success).toBe(true);
    });

    test("returns conflicts when continue finds more conflicts", async () => {
      mockGitCommand(git, (args) => {
        if (args.includes("--continue")) {
          return { output: "", error: "CONFLICT", exitCode: 1 };
        }
        if (args.includes("diff")) {
          return { output: "conflict-file.ts", error: "", exitCode: 0 };
        }
        return { output: "", error: "", exitCode: 0 };
      });

      const result = await git.continueRebase();
      expect(result.success).toBe(false);
      expect(result.conflicts).toEqual(["conflict-file.ts"]);
    });
  });

  describe("getCommitHistory", () => {
    test("returns array of commit lines", async () => {
      mockGitCommand(git, () => ({
        output: "'abc123  (HEAD -> feature)'\n'def456  (main)'\n'ghi789 '",
        error: "",
        exitCode: 0,
      }));

      const history = await git.getCommitHistory();
      expect(history).toHaveLength(3);
    });

    test("filters out empty lines", async () => {
      mockGitCommand(git, () => ({
        output: "'abc123  (feature)'\n\n'def456  (main)'",
        error: "",
        exitCode: 0,
      }));

      const history = await git.getCommitHistory();
      expect(history).toHaveLength(2);
    });
  });

  describe("getLastCommit", () => {
    test("parses log output into structured data", async () => {
      mockGitCommand(git, () => ({
        output: "abc123def456\nJohn Doe\nMon Feb 10 2025\nFix the bug",
        error: "",
        exitCode: 0,
      }));

      const commit = await git.getLastCommit("main");
      expect(commit.hash).toBe("abc123def456");
      expect(commit.author).toBe("John Doe");
      expect(commit.date).toBe("Mon Feb 10 2025");
      expect(commit.message).toBe("Fix the bug");
    });
  });

  describe("getTrackingBranch", () => {
    test("returns tracking branch name", async () => {
      mockGitCommand(git, () => ({
        output: "origin/feature",
        error: "",
        exitCode: 0,
      }));

      const tracking = await git.getTrackingBranch("feature");
      expect(tracking).toBe("origin/feature");
    });

    test("returns null when no tracking branch", async () => {
      mockGitCommand(git, () => {
        throw new Error("no upstream configured");
      });

      const tracking = await git.getTrackingBranch("feature");
      expect(tracking).toBeNull();
    });
  });

  describe("foldBranch", () => {
    test("returns success on successful merge", async () => {
      mockGitCommand(git, (args) => {
        if (args.includes("--show-current")) {
          return { output: "feature-2", error: "", exitCode: 0 };
        }
        if (args[0] === "checkout") {
          return { output: "", error: "", exitCode: 0 };
        }
        if (args.includes("merge")) {
          return { output: "Merge made", error: "", exitCode: 0 };
        }
        if (args.includes("branch") && args.includes("-d")) {
          return { output: "", error: "", exitCode: 0 };
        }
        return { output: "", error: "", exitCode: 0 };
      });

      const result = await git.foldBranch("feature-1");
      expect(result.success).toBe(true);
    });

    test("returns conflicts on merge failure", async () => {
      mockGitCommand(git, (args) => {
        if (args.includes("--show-current")) {
          return { output: "feature-2", error: "", exitCode: 0 };
        }
        if (args[0] === "checkout") {
          return { output: "", error: "", exitCode: 0 };
        }
        if (args.includes("merge")) {
          return { output: "", error: "CONFLICT", exitCode: 1 };
        }
        if (args.includes("diff")) {
          return {
            output: "conflicting-file.ts",
            error: "",
            exitCode: 0,
          };
        }
        return { output: "", error: "", exitCode: 0 };
      });

      const result = await git.foldBranch("feature-1");
      expect(result.success).toBe(false);
      expect(result.conflicts?.files).toEqual(["conflicting-file.ts"]);
    });
  });
});
