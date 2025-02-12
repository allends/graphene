import { spawn } from "child_process";

export class GitService {
  private static instance: GitService;

  private constructor() {}

  public static getInstance(): GitService {
    if (!GitService.instance) {
      GitService.instance = new GitService();
    }
    return GitService.instance;
  }

  public async executeGitCommand(args: string[]): Promise<{
    output: string;
    error: string;
    exitCode: number;
  }> {
    try {
      const process = spawn("git", args);
      let output = "";
      let error = "";

      // Collect stdout data
      process.stdout.on("data", (data) => {
        output += data.toString();
      });

      // Collect stderr data
      process.stderr.on("data", (data) => {
        error += data.toString();
      });

      // Wait for the process to complete
      const exitCode = await new Promise<number>((resolve) => {
        process.on("close", resolve);
      });

      return {
        output: output.trim(),
        error: error.trim(),
        exitCode,
      };
    } catch (error) {
      throw new Error(
        `Failed to execute git command: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  public async getCurrentBranch(): Promise<string> {
    const { output, exitCode } = await this.executeGitCommand([
      "branch",
      "--show-current",
    ]);

    if (exitCode !== 0) {
      throw new Error("Failed to get current branch");
    }

    return output;
  }

  public async checkoutBranch(
    branchName: string,
    create: boolean = false
  ): Promise<void> {
    const args = ["checkout"];
    if (create) {
      args.push("-b");
    }
    args.push(branchName);

    const { exitCode, error } = await this.executeGitCommand(args);

    if (exitCode !== 0) {
      throw new Error(`Failed to checkout branch: ${error || "Unknown error"}`);
    }
  }
}
