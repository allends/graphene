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
}
