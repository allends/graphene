import { spawn } from "node:child_process";
import { DatabaseService } from "@allends/graphene-database/src";
import { branches } from "@allends/graphene-database/src/schema";
import { and, eq } from "drizzle-orm";
import { GitService } from "./git";

export class PullRequestService {
  private static instance: PullRequestService;
  private db: DatabaseService;
  private git: GitService;

  private constructor() {
    this.db = DatabaseService.getInstance();
    this.git = GitService.getInstance();
  }

  public static getInstance(): PullRequestService {
    if (!PullRequestService.instance) {
      PullRequestService.instance = new PullRequestService();
    }
    return PullRequestService.instance;
  }

  /**
   * Creates a GitHub PR using the gh CLI
   */
  private async createGitHubPR(params: {
    title: string;
    head: string;
    base: string;
  }): Promise<string> {
    const child = spawn("gh", [
      "pr",
      "create",
      "--fill",
      "--head",
      params.head,
      "--base",
      params.base,
    ]);

    return new Promise((resolve, reject) => {
      let output = "";
      let error = "";

      child.stdout.on("data", (data) => {
        output += data.toString();
      });

      child.stderr.on("data", (data) => {
        error += data.toString();
      });

      child.on("close", (code) => {
        if (code === 0) {
          const prUrl = output.trim().split("\n")[0];
          console.log("PR created:", prUrl);
          resolve(prUrl);
        } else {
          reject(new Error(error.trim() || "Failed to create PR"));
        }
      });
    });
  }

  public async createPullRequest(branchName: string): Promise<string> {
    try {
      // Get branch info from database
      const [branchData] = await this.db
        .getDb()
        .select({
          stack_id: branches.stack_id,
          position: branches.position,
        })
        .from(branches)
        .where(eq(branches.name, branchName))
        .limit(1);

      if (!branchData?.stack_id) {
        throw new Error("Branch is not part of a stack");
      }

      // Get the parent branch (branch below in stack)
      const [parentBranch] = await this.db
        .getDb()
        .select({
          name: branches.name,
        })
        .from(branches)
        .where(
          and(
            eq(branches.stack_id, branchData.stack_id),
            eq(branches.position, branchData.position - 1)
          )
        )
        .limit(1);

      // If no parent branch found, this is the bottom of the stack
      if (!parentBranch) {
        const baseBranch = await this.git.getBaseBranch();
        return this.createGitHubPR({
          title: branchName,
          head: branchName,
          base: baseBranch,
        });
      }

      // For non-bottom branches, check if parent has a PR
      const parentPR = await this.checkPRExists(parentBranch.name);
      if (!parentPR) {
        throw new Error(
          "Parent branch must have an open PR before creating this PR"
        );
      }

      // Create the PR targeting the parent branch
      return this.createGitHubPR({
        title: branchName,
        head: branchName,
        base: parentBranch.name,
      });
    } catch (error) {
      throw new Error(
        `Failed to create pull request: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Checks if a PR exists for a branch using gh CLI
   */
  async checkPRExists(branchName: string): Promise<boolean> {
    const child = spawn("gh", [
      "pr",
      "list",
      "--head",
      branchName,
      "--state",
      "open",
    ]);

    return new Promise((resolve) => {
      let output = "";

      child.stdout.on("data", (data) => {
        output += data.toString();
      });

      child.on("close", () => {
        resolve(output.trim().length > 0);
      });
    });
  }

  public async getBranchesWithClosedPullRequests(): Promise<string[]> {
    const child = spawn("gh", ["pr", "list", "--state", "closed"]);

    return new Promise((resolve, reject) => {
      let output = "";
      let error = "";

      child.stdout.on("data", (data) => {
        output += data.toString();
      });

      child.stderr.on("data", (data) => {
        error += data.toString();
      });

      child.on("close", (code) => {
        if (code === 0) {
          const prs = output.trim().split("\n");
          resolve(prs);
        } else {
          reject(new Error(error.trim() || "Failed to create PR"));
        }
      });
    });
  }
}
