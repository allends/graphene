import { spawn } from "child_process";
import { eq } from "drizzle-orm";
import { DatabaseService, branches, stacks } from "@graphene/database";

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

  private constructor() {
    this.db = DatabaseService.getInstance();
  }

  public static getInstance(): BranchService {
    if (!BranchService.instance) {
      BranchService.instance = new BranchService();
    }
    return BranchService.instance;
  }

  public async listBranches(): Promise<{ [key: string]: StackedBranch[] }> {
    try {
      // Get current branch from git
      const gitProcess = spawn("git", ["branch", "--show-current"]);
      const currentBranch = await new Promise<string>((resolve) => {
        gitProcess.stdout.on("data", (data) => resolve(data.toString().trim()));
      });

      // Get branches from database with their stacks
      const result = await this.db
        .getDb()
        .select({
          branchName: branches.name,
          stackName: stacks.name,
        })
        .from(branches)
        .leftJoin(stacks, eq(branches.stack_id, stacks.id));

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

      return grouped;
    } catch (error) {
      throw new Error(
        `Failed to list branches: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }
}
