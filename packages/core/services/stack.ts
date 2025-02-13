import { GitService } from "@graphene/core";
import { DatabaseService } from "@graphene/database/src";
import { eq, sql, and } from "drizzle-orm";
import { branches, stacks } from "@graphene/database/src/schema";

export class StackService {
  private static instance: StackService;
  private db: DatabaseService;
  private git: GitService;

  private constructor() {
    this.db = DatabaseService.getInstance();
    this.git = GitService.getInstance();
  }

  public static getInstance(): StackService {
    if (!StackService.instance) {
      StackService.instance = new StackService();
    }
    return StackService.instance;
  }

  /**
   * Gets the current stack based on the current branch
   * @returns The stack information or null if not in a stack
   */
  public async getCurrentStack(): Promise<{
    stack_id: number;
    stack_name: string;
    branch_count: number;
  }> {
    try {
      const currentBranch = await this.git.getCurrentBranch();

      // Find the stack for the current branch
      const [stackData] = await this.db
        .getDb()
        .select({
          stack_id: stacks.id,
          stack_name: stacks.name,
          branch_count: sql<number>`count(${branches.id})`.as("branch_count"),
        })
        .from(branches)
        .leftJoin(stacks, eq(branches.stack_id, stacks.id))
        .where(eq(branches.name, currentBranch))
        .groupBy(stacks.id, stacks.name)
        .limit(1);

      if (!stackData.stack_id || !stackData.stack_name) {
        throw new Error("current branch is not part of a stack");
      }

      return {
        stack_id: stackData.stack_id,
        stack_name: stackData.stack_name,
        branch_count: Number(stackData.branch_count),
      };
    } catch (error) {
      throw new Error(
        `Failed to get current stack: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  public async createBranchInStack(branchName: string): Promise<void> {
    try {
      // Get current branch
      const currentBranch = await this.git.getCurrentBranch();

      // Check if current branch is in a stack
      const currentBranchData = await this.db
        .getDb()
        .select()
        .from(branches)
        .where(eq(branches.name, currentBranch))
        .limit(1);

      let stackId: number;
      let position: number;
      let parentBranchId: number | undefined;

      if (currentBranchData.length > 0) {
        // Branch is in a stack, use that stack
        stackId = currentBranchData[0].stack_id!;
        position = currentBranchData[0].position + 1;
        parentBranchId = currentBranchData[0].id;

        // Increment position of all branches after this one
        await this.db
          .getDb()
          .update(branches)
          .set({ position: sql`position + 1` })
          .where(
            and(
              eq(branches.stack_id, stackId),
              sql`position > ${currentBranchData[0].position}`
            )
          );
      } else {
        // Create new stack based on current branch
        const [newStack] = await this.db.createStack(
          `stack/${branchName}`,
          currentBranch
        );
        stackId = newStack.id;
        position = 0;
      }

      // Create the new branch in git
      await this.git.executeGitCommand(["checkout", "-b", branchName]);

      // Add branch to database
      await this.db.addBranchToStack(
        stackId,
        branchName,
        position,
        parentBranchId
      );

      // Get latest commit info
      const { output: sha } = await this.git.executeGitCommand([
        "rev-parse",
        "HEAD",
      ]);
      const { output: commitInfo } = await this.git.executeGitCommand([
        "log",
        "-1",
        "--pretty=format:%an|%s",
      ]);
      const [author, message] = commitInfo.split("|");

      // Add initial commit info
      if (sha && author && message) {
        const [branch] = await this.db
          .getDb()
          .select()
          .from(branches)
          .where(eq(branches.name, branchName))
          .limit(1);

        await this.db.addCommit(branch.id, sha, message, author);
      }
    } catch (error) {
      throw new Error(
        `Failed to create branch in stack: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Rebases an entire stack sequentially, starting from the base branch
   * @param stackId The ID of the stack to rebase
   * @param baseBranch The branch to rebase the stack onto (e.g., 'main')
   */
  public async rebaseStack(stackId: number, baseBranch: string): Promise<void> {
    try {
      // Get all branches in the stack, ordered by position
      const stackBranches = await this.db
        .getDb()
        .select()
        .from(branches)
        .where(eq(branches.stack_id, stackId))
        .orderBy(branches.position);

      if (stackBranches.length === 0) {
        throw new Error("No branches found in stack");
      }

      // Store the current branch to return to it later
      const originalBranch = await this.git.getCurrentBranch();

      try {
        // Start with rebasing the first branch onto the base branch
        await this.git.rebaseBranches(stackBranches[0].name, baseBranch);

        // Then rebase each subsequent branch onto the previous one
        for (let i = 1; i < stackBranches.length; i++) {
          const currentBranch = stackBranches[i].name;
          const previousBranch = stackBranches[i - 1].name;
          await this.git.rebaseBranches(currentBranch, previousBranch);
        }

        // Return to the original branch
        await this.git.checkoutBranch(originalBranch);
      } catch (error) {
        // If any rebase fails, return to original branch before throwing
        await this.git.checkoutBranch(originalBranch);
        throw error;
      }
    } catch (error) {
      throw new Error(
        `Failed to rebase stack: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }
}
