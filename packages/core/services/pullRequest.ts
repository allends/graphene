import { GitService } from "./git";
import { DatabaseService } from "@graphene/database/src";
import { and, eq } from "drizzle-orm";
import { branches } from "@graphene/database/src/schema";
import { Octokit } from "octokit";

export class PullRequestService {
  private static instance: PullRequestService;
  private db: DatabaseService;
  private git: GitService;
  private octokit: Octokit;

  private constructor() {
    this.db = DatabaseService.getInstance();
    this.git = GitService.getInstance();
    this.octokit = new Octokit({
      auth: process.env.GITHUB_TOKEN,
    });
  }

  public static getInstance(): PullRequestService {
    if (!PullRequestService.instance) {
      PullRequestService.instance = new PullRequestService();
    }
    return PullRequestService.instance;
  }

  /**
   * Creates a GitHub PR for a branch in a stack
   * @param branchName The branch to create a PR for
   * @throws Error if PR creation fails or prerequisites aren't met
   */
  public async createPullRequest(branchName: string): Promise<void> {
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

      if (!parentBranch) {
        throw new Error(
          "No parent branch found - cannot create PR for base of stack"
        );
      }

      // Check if parent branch has a PR
      const repo = await this.getGitHubRepo();
      const parentPRs = await this.octokit.rest.pulls.list({
        owner: repo.owner,
        repo: repo.name,
        head: `${repo.owner}:${parentBranch.name}`,
        state: "open",
      });

      if (parentPRs.data.length === 0) {
        throw new Error(
          "Parent branch must have an open PR before creating this PR"
        );
      }

      // Create the PR
      await this.octokit.rest.pulls.create({
        owner: repo.owner,
        repo: repo.name,
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
   * Gets the GitHub repository information for the current directory
   */
  private async getGitHubRepo(): Promise<{ owner: string; name: string }> {
    const remoteUrl = await this.git
      .gitPassthrough(["remote", "get-url", "origin"])
      .then((result) => result.output);

    const match = remoteUrl.match(/github\.com[:/]([^/]+)\/([^.]+)(?:\.git)?$/);
    if (!match) {
      throw new Error("Could not determine GitHub repository from remote URL");
    }

    return {
      owner: match[1],
      name: match[2],
    };
  }
}
