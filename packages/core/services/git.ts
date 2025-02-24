import { spawn } from "node:child_process";

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
    try {
      // Create the commit
      const commitArgs = ["commit", "-a"];
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
    } catch (error) {
      throw new Error(
        `Failed to commit changes: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
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
   * @returns Object containing success status and any conflicts
   */
  public async rebaseBranches(
    sourceBranch: string,
    targetBranch: string
  ): Promise<{ success: boolean; conflicts?: string[] }> {
    try {
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

      // Perform the rebase
      const { exitCode, error } = await this.executeGitCommand([
        "rebase",
        targetBranch,
      ]);

      if (exitCode === 0) {
        return { success: true };
      }

      // If rebase failed, check for conflicts
      const { output: conflicts } = await this.executeGitCommand([
        "diff",
        "--name-only",
        "--diff-filter=U",
      ]);

      return {
        success: false,
        conflicts: conflicts.split("\n").filter(Boolean),
      };
    } catch (error) {
      throw new Error(
        `Failed to rebase: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  public async gitPassthrough(args: string[]): Promise<{
    output: string;
    error: string;
    exitCode: number;
  }> {
    return await this.executeGitCommand(args);
  }

  /**
   * Searches for branches in the local repository that match the given query
   * @param query The search query string
   * @returns Array of branch names that match the query
   */
  public async searchLocalBranches(query: string): Promise<string[]> {
    try {
      // Get all local branches
      const branches = await this.listLocalBranches();

      // Filter branches by query
      return branches.filter((branch) =>
        branch.toLowerCase().includes(query.toLowerCase())
      );
    } catch (error) {
      throw new Error(
        `Failed to search local branches: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Searches for branches in the remote repository that match the given query
   * @param query The search query string
   * @returns Array of branch names that match the query
   */
  public async searchRemoteBranches(query: string): Promise<string[]> {
    try {
      // First, fetch the latest from remote
      await this.executeGitCommand(["fetch", "origin"]);

      // Get all remote branches and filter by query
      const { output, exitCode } = await this.executeGitCommand([
        "branch",
        "-r", // Show remote branches
        "--format=%(refname:short)", // Only show branch names
        "--sort=-committerdate", // Sort by most recent commit
        "--list", // List mode
        `*${query}*`, // Match pattern
      ]);

      if (exitCode !== 0) {
        throw new Error("Failed to search remote branches");
      }

      // Process the output
      return (
        output
          .split("\n")
          .map((branch) => branch.trim())
          // Remove 'origin/' prefix and empty lines
          .filter((branch) => branch?.startsWith("origin/"))
          .map((branch) => branch.replace("origin/", ""))
          // Remove HEAD reference if present
          .filter((branch) => branch !== "HEAD")
      );
    } catch (error) {
      throw new Error(
        `Failed to search remote branches: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
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

  /**
   * Checks if a rebase is currently in progress
   * @returns true if a rebase is in progress
   */
  public async isRebaseInProgress(): Promise<boolean> {
    try {
      const { output } = await this.executeGitCommand(["status"]);
      return output.includes("rebase in progress");
    } catch (error) {
      throw new Error(
        `Failed to check rebase status: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Checks if a fold operation is currently in progress
   * @returns true if a fold is in progress
   */
  public async isMergeInProgress(): Promise<boolean> {
    try {
      const { output } = await this.executeGitCommand(["status"]);
      return output.includes("merge in progress");
    } catch (error) {
      throw new Error(
        `Failed to check fold status: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }
  /**
   * Continues a rebase in progress
   * @returns Object containing success status and any conflicts
   */
  public async continueRebase(): Promise<{
    success: boolean;
    conflicts?: string[];
  }> {
    try {
      const { exitCode, error } = await this.executeGitCommand([
        "rebase",
        "--continue",
      ]);

      if (exitCode === 0) {
        return { success: true };
      }

      // Get list of conflicting files
      const { output: conflicts } = await this.executeGitCommand([
        "diff",
        "--name-only",
        "--diff-filter=U",
      ]);

      return {
        success: false,
        conflicts: conflicts.split("\n").filter(Boolean),
      };
    } catch (error) {
      throw new Error(
        `Failed to continue rebase: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Lists all local branches
   */
  public async listLocalBranches(): Promise<string[]> {
    try {
      const { output, exitCode } = await this.executeGitCommand([
        "branch",
        "--format=%(refname:short)",
      ]);

      if (exitCode !== 0) {
        throw new Error("Failed to list local branches");
      }

      return output
        .split("\n")
        .map((branch) => branch.trim())
        .filter((branch) => branch && branch !== "HEAD");
    } catch (error) {
      throw new Error(
        `Failed to list local branches: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Lists all remote branches
   */
  public async listRemoteBranches(): Promise<string[]> {
    try {
      // First fetch to ensure we have latest
      await this.executeGitCommand(["fetch"]);

      const { output, exitCode } = await this.executeGitCommand([
        "branch",
        "-r",
        "--format=%(refname:short)",
      ]);

      if (exitCode !== 0) {
        throw new Error("Failed to list remote branches");
      }

      return output
        .split("\n")
        .map((branch) => branch.trim())
        .filter((branch) => branch && branch.startsWith("origin/"))
        .map((branch) => branch.replace("origin/", ""))
        .filter((branch) => branch !== "HEAD");
    } catch (error) {
      throw new Error(
        `Failed to list remote branches: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  public async getCommitHistory(): Promise<string[]> {
    const { output } = await this.executeGitCommand([
      "log",
      "--oneline",
      "--pretty=format:'%h %d'",
      "--decorate-refs=refs/heads",
    ]);
    return output.split("\n").filter(Boolean);
  }

  /**
   * Squashes all commits on the current branch into a single commit
   * @param message Optional commit message for the squashed commit
   */
  public async squashBranch(message?: string): Promise<void> {
    try {
      const currentBranch = await this.getCurrentBranch();
      const baseBranch = await this.getBaseBranch();

      // Get merge base commit with base branch
      const { output: mergeBase } = await this.executeGitCommand([
        "merge-base",
        baseBranch,
        currentBranch,
      ]);

      // Soft reset to merge base to unstage everything
      await this.executeGitCommand(["reset", "--soft", mergeBase.trim()]);

      // Create new commit with all changes
      const commitMessage = message || "squash: combine all commits";
      await this.executeGitCommand(["commit", "-m", commitMessage]);
    } catch (error) {
      throw new Error(
        `Failed to squash branch: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Merges the current branch into the branch below it
   * @param downstreamBranch Name of the branch below current branch
   * @returns Object indicating success or conflict details
   */
  public async foldBranch(downstreamBranch: string): Promise<{
    success: boolean;
    conflicts?: { branch: string; files: string[] };
  }> {
    try {
      const currentBranch = await this.getCurrentBranch();

      // First checkout the downstream branch
      await this.checkoutBranch(downstreamBranch);

      // Then merge the current branch into it
      const { exitCode, error, output } = await this.executeGitCommand([
        "merge",
        "--no-ff", // Preserve commit history
        currentBranch,
      ]);

      if (exitCode !== 0) {
        // Get list of conflicting files
        const { output: conflictOutput } = await this.executeGitCommand([
          "diff",
          "--name-only",
          "--diff-filter=U",
        ]);

        const conflicts = {
          branch: currentBranch,
          files: conflictOutput.split("\n").filter(Boolean),
        };

        return { success: false, conflicts };
      }

      // Delete the old branch since it's now merged
      await this.executeGitCommand(["branch", "-d", currentBranch]);
      return { success: true };
    } catch (error) {
      throw new Error(
        `Failed to fold branch: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Continues a fold operation after resolving conflicts
   * @param originalBranch The branch that was being folded
   */
  public async continueFold(originalBranch: string): Promise<void> {
    try {
      // Check if there are still unresolved conflicts
      const { output: statusOutput } = await this.executeGitCommand([
        "status",
        "--porcelain",
      ]);

      if (statusOutput.includes("U")) {
        throw new Error("There are still unresolved conflicts");
      }

      // Complete the merge
      await this.executeGitCommand(["commit", "--no-edit"]);

      // Delete the original branch
      await this.executeGitCommand(["branch", "-d", originalBranch]);
    } catch (error) {
      throw new Error(
        `Failed to continue fold: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Get fold branch information
   */
  public async getFoldBranchInfo(): Promise<{
    currentBranch: string;
    downstreamBranch: string;
  }> {
    try {
      // Get the branch being folded from the merge message
      const { output: mergeHead } = await this.executeGitCommand([
        "rev-parse",
        "MERGE_HEAD",
      ]);

      if (!mergeHead) {
        throw new Error("No fold operation in progress");
      }

      const { output: branchName } = await this.executeGitCommand([
        "name-rev",
        "--name-only",
        mergeHead.trim(),
      ]);

      return {
        currentBranch: branchName.trim(),
        downstreamBranch: branchName.trim().split("/")[1],
      };
    } catch (error) {
      throw new Error(
        `Failed to get fold branch info: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Checks if there are uncommitted changes in the working directory
   * @returns true if there are uncommitted changes
   */
  public async hasUncommittedChanges(): Promise<boolean> {
    const { output } = await this.executeGitCommand(["status", "--porcelain"]);
    return output.includes("Changes to be committed");
  }
}
