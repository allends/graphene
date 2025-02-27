import { GitService } from "@allends/graphene-core";
import { DatabaseService } from "@allends/graphene-database/src";
import { branches, stacks } from "@allends/graphene-database/src/schema";
import { and, desc, eq, inArray, sql } from "drizzle-orm";

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
    base_branch: string;
  }> {
    try {
      const currentBranch = await this.git.getCurrentBranch();

      const fallbackBranch = await this.git.getBaseBranch();

      // Find the stack for the current branch
      const [stackData] = await this.db
        .getDb()
        .select({
          stack_id: stacks.id,
          stack_name: stacks.name,
          branch_count: sql<number>`count(${branches.id})`.as("branch_count"),
          base_branch: stacks.base_branch,
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
        base_branch: stackData.base_branch || fallbackBranch,
      };
    } catch (error) {
      throw new Error(
        `Failed to get current stack: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  public async createBranchInStack({
    branchName,
  }: {
    branchName: string;
  }): Promise<void> {
    try {
      // Get repository name
      const repositoryName = await this.git.getRepositoryName();

      // Get current branch
      const currentBranch = await this.git.getCurrentBranch();

      // Check if current branch is in a stack
      const currentBranchData = await this.db
        .getDb()
        .select()
        .from(branches)
        .innerJoin(stacks, eq(branches.stack_id, stacks.id))
        .where(
          and(
            eq(branches.name, currentBranch),
            eq(stacks.repository_name, repositoryName)
          )
        )
        .limit(1);

      let stackId: number;
      let position: number;
      let parentBranchId: number | undefined;

      if (currentBranchData.length > 0) {
        // Branch is in a stack, use that stack
        stackId = currentBranchData[0].stacks.id;
        position = currentBranchData[0].branches.position + 1;
        parentBranchId = currentBranchData[0].branches.id;

        // Increment position of all branches after this one
        await this.db
          .getDb()
          .update(branches)
          .set({ position: sql`position + 1` })
          .where(
            and(
              eq(branches.stack_id, stackId),
              sql`position > ${currentBranchData[0].branches.position}`
            )
          );
      } else {
        // Create new stack based on current branch
        const [newStack] = await this.db.createStack(
          `stack/${branchName}`,
          repositoryName,
          currentBranch
        );
        stackId = newStack.id;
        position = 0;
      }

      // Create the new branch in git
      await this.git.createBranch(branchName);

      // Add branch to database
      await this.db.addBranchToStack(
        stackId,
        branchName,
        position,
        parentBranchId
      );

      // Get latest commit info
      const { sha, author, message } = await this.git.getLatestCommit();
    } catch (error) {
      throw new Error(
        `Failed to create branch in stack: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Rebases an entire stack sequentially, starting from the base branch up to the current branch
   * @param stackId The ID of the stack to rebase
   * @param baseBranch The branch to rebase the stack onto (e.g., 'main')
   * @param currentBranch The current branch to rebase onto the base branch
   */
  public async rebaseStack({
    stackId,
    baseBranch,
    currentBranch,
  }: {
    stackId: number;
    baseBranch: string;
    currentBranch?: string;
  }): Promise<{
    success: boolean;
    conflicts?: { branch: string; files: string[] };
  }> {
    try {
      // Check for uncommitted changes before proceeding
      const hasUncommittedChanges = await this.git.hasUncommittedChanges();
      if (hasUncommittedChanges) {
        throw new Error(
          "Cannot rebase stack with uncommitted changes. Please commit or stash your changes first."
        );
      }

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
        const firstRebase = await this.git.rebaseBranches(
          stackBranches[0].name,
          baseBranch
        );

        if (!firstRebase.success) {
          return {
            success: false,
            conflicts: {
              branch: stackBranches[0].name,
              files: firstRebase.conflicts || [],
            },
          };
        }

        // Then rebase each subsequent branch onto the previous one
        for (let i = 1; i < stackBranches.length; i++) {
          const rebasingBranch = stackBranches[i].name;
          const previousBranch = stackBranches[i - 1].name;

          const rebaseResult = await this.git.rebaseBranches(
            rebasingBranch,
            previousBranch
          );

          if (!rebaseResult.success) {
            return {
              success: false,
              conflicts: {
                branch: rebasingBranch,
                files: rebaseResult.conflicts || [],
              },
            };
          }

          if (currentBranch && rebasingBranch === currentBranch) {
            break;
          }
        }

        // Return to the original branch if no conflicts occurred
        await this.git.checkoutBranch(originalBranch);
        return { success: true };
      } catch (error) {
        const isRebaseInProgress = await this.git.isRebaseInProgress();

        // Only return to original branch if no rebase is in progress
        if (!isRebaseInProgress) {
          await this.git.checkoutBranch(originalBranch);
        }

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

  /**
   * Renames the current stack
   * @param newName The new name for the stack
   */
  public async renameCurrentStack(newName: string): Promise<void> {
    try {
      // Get current stack
      const { stack_id } = await this.getCurrentStack();

      // Update stack name in database
      await this.db
        .getDb()
        .update(stacks)
        .set({
          name: newName,
          updated_at: new Date(),
        })
        .where(eq(stacks.id, stack_id));
    } catch (error) {
      throw new Error(
        `Failed to rename stack: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Gets the branch above the current branch in the stack
   * @returns The name of the branch above or null if at top
   */
  public async getUpstreamBranch(): Promise<string | null> {
    try {
      const currentBranch = await this.git.getCurrentBranch();
      const { stack_id } = await this.getCurrentStack();

      // Get current branch position
      const [current] = await this.db
        .getDb()
        .select()
        .from(branches)
        .where(
          and(eq(branches.stack_id, stack_id), eq(branches.name, currentBranch))
        )
        .limit(1);

      if (!current) {
        throw new Error("Current branch not found in stack");
      }

      // Get branch with next highest position
      const [upstream] = await this.db
        .getDb()
        .select()
        .from(branches)
        .where(
          and(
            eq(branches.stack_id, stack_id),
            sql`position > ${current.position}`
          )
        )
        .orderBy(branches.position)
        .limit(1);

      return upstream?.name || null;
    } catch (error) {
      throw new Error(
        `Failed to get upstream branch: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Gets the branch below the current branch in the stack
   * @returns The name of the branch below or null if at bottom
   */
  public async getDownstreamBranch(): Promise<string | null> {
    try {
      const currentBranch = await this.git.getCurrentBranch();
      const { stack_id } = await this.getCurrentStack();

      // Get current branch position
      const [current] = await this.db
        .getDb()
        .select()
        .from(branches)
        .where(
          and(eq(branches.stack_id, stack_id), eq(branches.name, currentBranch))
        )
        .limit(1);

      if (!current) {
        throw new Error("Current branch not found in stack");
      }

      // Get branch with next lowest position
      const [downstream] = await this.db
        .getDb()
        .select()
        .from(branches)
        .where(
          and(
            eq(branches.stack_id, stack_id),
            sql`position < ${current.position}`
          )
        )
        .orderBy((branches) => [desc(branches.position)])
        .limit(1);

      return downstream?.name || null;
    } catch (error) {
      throw new Error(
        `Failed to get downstream branch: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Tracks a branch in the current stack
   * @param branchName Name of the branch to track
   */
  public async trackBranch(branchName: string): Promise<void> {
    try {
      const { stack_id } = await this.getCurrentStack();
      const repositoryName = await this.git.getRepositoryName();

      // Check if branch is already tracked
      const existingBranch = await this.db
        .getDb()
        .select()
        .from(branches)
        .innerJoin(stacks, eq(branches.stack_id, stacks.id))
        .where(
          and(
            eq(branches.name, branchName),
            eq(stacks.repository_name, repositoryName)
          )
        )
        .limit(1);

      if (existingBranch.length > 0) {
        throw new Error("Branch is already tracked");
      }

      // Get highest position in current stack
      const [maxPosition] = await this.db
        .getDb()
        .select({
          position: sql<number>`max(${branches.position})`.as("max_position"),
        })
        .from(branches)
        .where(eq(branches.stack_id, stack_id));

      // Add branch to stack
      await this.db
        .getDb()
        .insert(branches)
        .values({
          name: branchName,
          stack_id,
          status: "active",
          position: (maxPosition?.position || 0) + 1,
        });
    } catch (error) {
      throw new Error(
        `Failed to track branch: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Removes a branch from its stack
   * @param branchName Name of the branch to untrack
   */
  public async untrackBranch(branchName: string): Promise<void> {
    try {
      const repositoryName = await this.git.getRepositoryName();

      // Get branch info
      const [branchInfo] = await this.db
        .getDb()
        .select()
        .from(branches)
        .innerJoin(stacks, eq(branches.stack_id, stacks.id))
        .where(
          and(
            eq(branches.name, branchName),
            eq(stacks.repository_name, repositoryName)
          )
        )
        .limit(1);

      if (!branchInfo || !branchInfo.branches.stack_id) {
        throw new Error("Branch is not tracked");
      }

      // Remove branch from stack (commits will be deleted automatically)
      await this.db
        .getDb()
        .delete(branches)
        .where(eq(branches.name, branchName));

      // Update positions of remaining branches
      await this.db
        .getDb()
        .update(branches)
        .set({
          position: sql`${branches.position} - 1`,
        })
        .where(
          and(
            eq(branches.stack_id, branchInfo.branches.stack_id),
            sql`position > ${branchInfo.branches.position}`
          )
        );
    } catch (error) {
      throw new Error(
        `Failed to untrack branch: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Creates a stack from the current branch's commit history
   * @returns The ID of the created stack
   */
  public async createStackFromHistory(stackName: string): Promise<number> {
    try {
      const gitService = GitService.getInstance();
      const currentBranch = await gitService.getCurrentBranch();
      const repositoryName = await gitService.getRepositoryName();
      const baseBranches = await this.db.getBaseBranches(repositoryName);

      // Get commit history
      const history = await gitService.getCommitHistory();

      const branchNames: string[] = [];

      // Find the first base branch commit in history
      const baseBranch = history.find((commit) => {
        const branchMatch = commit.match(/\((.*?)\)/);

        if (!branchMatch) {
          return false;
        }

        const branchName = branchMatch.at(1);

        if (!branchName) {
          return false;
        }

        if (branchName.includes(",")) {
          throw new Error("Multiple branches found in commit history");
        }

        if (branchNames.includes(branchName)) {
          throw new Error("Duplicate branch name found in commit history");
        }

        if (baseBranches.includes(branchName)) {
          return true;
        }

        branchNames.push(branchName);

        return false;
      });

      if (!baseBranch) {
        throw new Error("No base branch found in commit history");
      }

      // Create new stack
      const [stack] = await this.db.createStack(
        `stack/${stackName}`,
        repositoryName,
        baseBranch
      );

      branchNames.reverse();

      // Add branches to stack in order
      for (let i = 0; i < branchNames.length; i++) {
        await this.db.getDb().insert(branches).values({
          name: branchNames[i],
          stack_id: stack.id,
          status: "active",
          position: i,
        });
      }

      return stack.id;
    } catch (error) {
      throw new Error(
        `Failed to create stack from history: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Deletes multiple stacks and their branches
   * @param stackIds Array of stack IDs to delete
   */
  public async deleteStacks(stackIds: number[]): Promise<void> {
    try {
      const db = this.db.getDb();

      // With cascade delete, we only need to delete the stacks
      // Branches and commits will be deleted automatically
      await db.delete(stacks).where(inArray(stacks.id, stackIds));
    } catch (error) {
      throw new Error(
        `Failed to delete stacks: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Lists all stacks in the current repository
   */
  public async listStacks(): Promise<
    Array<{
      id: number;
      name: string;
      branchCount: number;
    }>
  > {
    try {
      const repositoryName = await this.git.getRepositoryName();

      return await this.db
        .getDb()
        .select({
          id: stacks.id,
          name: stacks.name,
          branchCount: sql<number>`count(${branches.id})`.as("branch_count"),
        })
        .from(stacks)
        .leftJoin(branches, eq(branches.stack_id, stacks.id))
        .where(eq(stacks.repository_name, repositoryName))
        .groupBy(stacks.id, stacks.name);
    } catch (error) {
      throw new Error(
        `Failed to list stacks: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  public async getParentBranch(branchName: string): Promise<string | null> {
    const [branch] = await this.db
      .getDb()
      .select()
      .from(branches)
      .where(eq(branches.name, branchName))
      .limit(1);

    if (!branch || !branch.parent_id) {
      return null;
    }

    const [parent] = await this.db
      .getDb()
      .select()
      .from(branches)
      .where(eq(branches.id, branch.parent_id))
      .limit(1);

    return parent?.name || null;
  }

  public async getStackForBranch(branchName: string): Promise<string | null> {
    const [branch] = await this.db
      .getDb()
      .select()
      .from(branches)
      .innerJoin(stacks, eq(branches.stack_id, stacks.id))
      .where(eq(branches.name, branchName))
      .limit(1);

    return branch?.stacks.name || null;
  }
}
