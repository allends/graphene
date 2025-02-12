import { spawn } from "child_process";

export interface Branch {
  name: string;
  current: boolean;
}

export class BranchService {
  private static instance: BranchService;

  private constructor() {}

  public static getInstance(): BranchService {
    if (!BranchService.instance) {
      BranchService.instance = new BranchService();
    }
    return BranchService.instance;
  }

  public async listLocalBranches(): Promise<Branch[]> {
    try {
      const branches: Branch[] = [];

      // Execute git branch command
      const process = spawn("git", ["branch"]);

      // Convert the command output to string and process it
      for await (const chunk of process.stdout) {
        const output = chunk.toString();
        const branchLines = output.split("\n").filter(Boolean);

        // Process each line of output
        branchLines.forEach((line: string) => {
          const isCurrent = line.startsWith("*");
          const name = line.replace("*", "").trim();

          if (name) {
            branches.push({
              name,
              current: isCurrent,
            });
          }
        });
      }

      // Check for errors
      const exitCode = await new Promise((resolve) => {
        process.on("close", resolve);
      });

      if (exitCode !== 0) {
        throw new Error("Failed to list branches");
      }

      return branches;
    } catch (error) {
      throw new Error(
        `Failed to list branches: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }
}
