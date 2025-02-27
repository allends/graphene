import { eq, inArray, isNull } from "drizzle-orm";
import { PullRequestService } from "./pullRequest";
import { branches, DatabaseService, stacks } from "@allends/graphene-database";

/**
 * Deletes branches from the local database that have closed pull requests,
 * excluding any branches that are part of the base branches.
 *
 * @param baseBranches - Array of branch names to exclude from deletion
 * @returns Promise with the number of branches deleted
 */
export async function cleanupClosedPullRequestBranches(
  baseBranches: string[] = ["main", "master", "staging", "develop"]
): Promise<number> {
  try {
    // Initialize services
    const pullRequestService = PullRequestService.getInstance();
    const db = DatabaseService.getInstance();

    // Get all branches with closed PRs
    const closedPrBranches =
      await pullRequestService.getBranchesWithClosedPullRequests();

    if (!closedPrBranches.length) {
      console.log("No branches with closed pull requests found.");
      return 0;
    }

    // Filter out base branches
    const branchesToDelete = closedPrBranches.filter(
      (branch) => !baseBranches.includes(branch)
    );

    if (!branchesToDelete.length) {
      console.log("No branches to delete after filtering out base branches.");
      return 0;
    }

    console.log(branchesToDelete);

    // Delete branches from the database
    await db
      .getDb()
      .delete(branches)
      .where(inArray(branches.name, branchesToDelete));

    console.log(
      `Successfully deleted ${branchesToDelete.length} branches with closed pull requests from the database.`
    );

    // Delete any stacks that no longer have branches
    const orphanedStacks = await db
      .getDb()
      .select()
      .from(stacks)
      .leftJoin(branches, eq(stacks.id, branches.stack_id))
      .where(isNull(branches.id));

    const stacksToDelete = orphanedStacks
      .filter((stack) => !stack.branches)
      .map((stack) => stack.stacks.id);

    if (stacksToDelete.length > 0) {
      await db.getDb().delete(stacks).where(inArray(stacks.id, stacksToDelete));

      console.log(
        `Successfully deleted ${stacksToDelete.length} stacks with no remaining branches.`
      );
    }

    return branchesToDelete.length;
  } catch (error) {
    console.error(
      "Error cleaning up branches with closed pull requests:",
      error
    );
    throw error;
  }
}
