import {
  DatabaseService,
  branches,
  stacks,
  repositories,
} from "@allends/graphene-database";
import { eq, or } from "drizzle-orm";
import { GitService } from "./git";

export interface Branch {
  name: string;
  current: boolean;
}

export interface StackedBranch {
  name: string;
  current: boolean;
  stackName: string | null;
}

export class BranchService {
  private static instance: BranchService;
  private db: DatabaseService;
  private git: GitService;

  private constructor() {
    this.db = DatabaseService.getInstance();
    this.git = GitService.getInstance();
  }

  public static getInstance(): BranchService {
    if (!BranchService.instance) {
      BranchService.instance = new BranchService();
    }
    return BranchService.instance;
  }

  public async listBranches(): Promise<{ [key: string]: StackedBranch[] }> {
    try {
      // Get repository name
      const repositoryName = await this.git.getRepositoryName();

      // Get current branch from git
      const currentBranch = await this.git.getCurrentBranch();

      // Get branches from database with their stacks
      const result = await this.db
        .getDb()
        .select({
          branchName: branches.name,
          stackName: stacks.name,
          repositoryName: stacks.repository_name,
        })
        .from(stacks)
        .innerJoin(branches, eq(stacks.id, branches.stack_id))
        .where(eq(stacks.repository_name, repositoryName));

      // Group branches by stack
      const grouped: { [key: string]: StackedBranch[] } = {
        "No Stack": [], // For branches not in a stack
      };

      result.forEach((row) => {
        const stackName = row.stackName || "No Stack";
        if (!grouped[stackName]) {
          grouped[stackName] = [];
        }

        grouped[stackName].push({
          name: row.branchName,
          current: row.branchName === currentBranch,
          stackName: row.stackName,
        });
      });

      if (grouped["No Stack"].length === 0) {
        delete grouped["No Stack"];
      }

      return grouped;
    } catch (error) {
      throw new Error(
        `Failed to list branches: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  public async listBaseBranches(): Promise<string[]> {
    try {
      const gitService = GitService.getInstance();
      const repoName = await gitService.getRepositoryName();

      // Get base branches from repository configuration
      const [repo] = await this.db
        .getDb()
        .select()
        .from(repositories)
        .where(eq(repositories.name, repoName))
        .limit(1);

      if (!repo) {
        // Fall back to default base branch if no configuration exists
        const defaultBase = await gitService.getBaseBranch();
        return [defaultBase];
      }

      return JSON.parse(repo.base_branches);
    } catch (error) {
      throw new Error(
        `Failed to get base branches: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }
}
