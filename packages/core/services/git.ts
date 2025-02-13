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

  /**
   * Gets the repository name from the remote URL.
   */
  public async getRepositoryName(): Promise<string> {
    const { output, exitCode } = await this.executeGitCommand([
      "config",
      "--get",
      "remote.origin.url",
    ]);

    if (exitCode !== 0) {
      throw new Error("Failed to get repository name");
    }

    // Extract owner and repo name from remote URL
    // Handles formats like:
    // https://github.com/owner/repo.git
    // git@github.com:owner/repo.git
    const match = output.match(/[\/:]([^\/]+?)\/([^\/]+?)(?:\.git)?$/);
    if (!match) {
      throw new Error("Could not parse repository name from remote URL");
    }
    const [_, owner, repo] = match;
    return `${owner}/${repo}`;
  }

  /**
   * Gets the current branch name
   */
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

  /**
   * Gets the base branch (main/master) for the repository
   */
  public async getBaseBranch(): Promise<string> {
    try {
      // First try to get the upstream branch
      const { output, exitCode } = await this.executeGitCommand([
        "rev-parse",
        "--abbrev-ref",
        "HEAD",
        "--symbolic-full-name",
        "@{",
      ]);

      if (exitCode === 0) {
        return output.split("/")[1];
      }

      // If no upstream, check for main/master
      const { output: branchList } = await this.executeGitCommand([
        "branch",
        "--list",
        "main",
        "master",
      ]);

      const branches = branchList
        .split("\n")
        .map((b) => b.trim().replace("* ", ""));
      return branches.find((b) => b) || "main";
    } catch (error) {
      throw new Error(
        `Failed to get base branch: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Creates a new branch and checks it out
   */
  public async createBranch(branchName: string): Promise<void> {
    const { exitCode, error } = await this.executeGitCommand([
      "checkout",
      "-b",
      branchName,
    ]);

    if (exitCode !== 0) {
      throw new Error(`Failed to create branch: ${error || "Unknown error"}`);
    }
  }

  /**
   * Checks out an existing branch
   */
  public async checkoutBranch(branchName: string): Promise<void> {
    const { exitCode, error } = await this.executeGitCommand([
      "checkout",
      branchName,
    ]);

    if (exitCode !== 0) {
      throw new Error(`Failed to checkout branch: ${error || "Unknown error"}`);
    }
  }

  /**
   * Gets the latest commit information
   */
  public async getLatestCommit(): Promise<{
    sha: string;
    author: string;
    message: string;
  }> {
    const { output: sha, exitCode: shaExitCode } = await this.executeGitCommand(
      ["rev-parse", "HEAD"]
    );

    if (shaExitCode !== 0) {
      throw new Error("Failed to get commit SHA");
    }

    const { output: commitInfo, exitCode: infoExitCode } =
      await this.executeGitCommand(["log", "-1", "--pretty=format:%an|%s"]);

    if (infoExitCode !== 0) {
      throw new Error("Failed to get commit info");
    }

    const [author, message] = commitInfo.split("|");
    return { sha, author, message };
  }

  /**
   * Creates a new commit with all changes in the working directory
   * @param message Optional commit message. If not provided, opens the default editor
   */
  public async commitAll(message?: string): Promise<void> {
    // Add all changes
    const addResult = await this.executeGitCommand(["add", "."]);
    if (addResult.exitCode !== 0) {
      throw new Error(
        `Failed to add changes: ${addResult.error || "Unknown error"}`
      );
    }

    // Create the commit
    const commitArgs = ["commit"];
    if (message) {
      commitArgs.push("-m", message);
    }

    // When no message is provided, we need to spawn git with proper TTY handling
    if (!message) {
      const editor = process.env.VISUAL || process.env.EDITOR || "vim";
      const child = spawn("git", commitArgs, {
        stdio: "inherit", // This connects the child process to the parent's TTY
        env: {
          ...process.env,
          GIT_EDITOR: editor,
        },
      });

      return new Promise((resolve, reject) => {
        child.on("exit", (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error("Failed to create commit"));
          }
        });
        child.on("error", reject);
      });
    }

    // If message was provided, use the normal executeGitCommand
    const commitResult = await this.executeGitCommand(commitArgs);
    if (commitResult.exitCode !== 0) {
      throw new Error(
        `Failed to create commit: ${commitResult.error || "Unknown error"}`
      );
    }
  }

  /**
   * Amends the last commit with all current changes in the working directory
   */
  public async amendCommit(): Promise<void> {
    // Add all changes
    const addResult = await this.executeGitCommand(["add", "."]);
    if (addResult.exitCode !== 0) {
      throw new Error(
        `Failed to add changes: ${addResult.error || "Unknown error"}`
      );
    }

    // Amend the commit with proper TTY handling
    const child = spawn("git", ["commit", "--amend"], {
      stdio: "inherit", // This connects the child process to the parent's TTY
      env: {
        ...process.env,
        GIT_EDITOR: process.env.VISUAL || process.env.EDITOR || "vim",
      },
    });

    return new Promise((resolve, reject) => {
      child.on("exit", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error("Failed to amend commit"));
        }
      });
      child.on("error", reject);
    });
  }

  /**
   * Rebases one branch onto another
   * @param sourceBranch The branch to be rebased
   * @param targetBranch The branch to rebase onto
   * @throws Error if the rebase fails or encounters conflicts
   */
  public async rebaseBranches(
    sourceBranch: string,
    targetBranch: string
  ): Promise<void> {
    // First checkout the source branch
    const checkoutResult = await this.executeGitCommand([
      "checkout",
      sourceBranch,
    ]);
    if (checkoutResult.exitCode !== 0) {
      throw new Error(
        `Failed to checkout source branch: ${
          checkoutResult.error || "Unknown error"
        }`
      );
    }

    // Perform the rebase with proper TTY handling for potential conflict resolution
    const child = spawn("git", ["rebase", targetBranch], {
      stdio: "inherit", // This connects the child process to the parent's TTY
      env: {
        ...process.env,
        GIT_EDITOR: process.env.VISUAL || process.env.EDITOR || "vim",
      },
    });

    return new Promise((resolve, reject) => {
      child.on("exit", (code) => {
        if (code === 0) {
          resolve();
        } else {
          // If rebase fails, attempt to abort it before rejecting
          this.executeGitCommand(["rebase", "--abort"]).finally(() => {
            reject(new Error("Rebase failed - conflicts encountered"));
          });
        }
      });
      child.on("error", (error) => {
        // If spawn fails, attempt to abort rebase before rejecting
        this.executeGitCommand(["rebase", "--abort"]).finally(() => {
          reject(new Error(`Failed to rebase: ${error.message}`));
        });
      });
    });
  }

  public async gitPassthrough(args: string[]): Promise<{
    output: string;
    error: string;
    exitCode: number;
  }> {
    return await this.executeGitCommand(args);
  }

  private async executeGitCommand(args: string[]): Promise<{
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
}
