import { spawn } from "child_process";
import { Octokit } from "octokit";
import { CredentialsService } from "./credentials";

export class RepositoryService {
  private static instance: RepositoryService;

  private constructor() {}

  public static getInstance(): RepositoryService {
    if (!RepositoryService.instance) {
      RepositoryService.instance = new RepositoryService();
    }
    return RepositoryService.instance;
  }

  public async initRepository(): Promise<void> {
    try {
      // Execute git init command
      const process = spawn("git", ["init"]);

      // Check for errors
      const exitCode = await new Promise((resolve) => {
        process.on("close", resolve);
      });

      if (exitCode !== 0) {
        throw new Error("Failed to initialize repository");
      }

      // Create initial commit
      const initialCommitProcess = spawn("git", [
        "commit",
        "--allow-empty",
        "-m",
        "Initial commit",
      ]);

      const commitExitCode = await new Promise((resolve) => {
        initialCommitProcess.on("close", resolve);
      });

      if (commitExitCode !== 0) {
        throw new Error("Failed to create initial commit");
      }
    } catch (error) {
      throw new Error(
        `Failed to initialize repository: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  public async createGitHubRepository(
    name: string,
    description?: string,
    isPrivate: boolean = false
  ): Promise<string> {
    try {
      const credentialsService = CredentialsService.getInstance();
      const token = await credentialsService.getToken();

      if (!token) {
        throw new Error(
          "Not authenticated with GitHub. Please run 'graphite-local auth' first."
        );
      }

      const octokit = new Octokit({ auth: token });

      const { data: repo } =
        await octokit.rest.repos.createForAuthenticatedUser({
          name,
          description,
          private: isPrivate,
          auto_init: false,
        });

      // Add the remote to the local repository
      const addRemoteProcess = spawn("git", [
        "remote",
        "add",
        "origin",
        repo.ssh_url,
      ]);

      const exitCode = await new Promise((resolve) => {
        addRemoteProcess.on("close", resolve);
      });

      if (exitCode !== 0) {
        throw new Error("Failed to add remote");
      }

      return repo.html_url;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("name already exists")
      ) {
        throw new Error("A repository with this name already exists on GitHub");
      }
      throw new Error(
        `Failed to create GitHub repository: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }
}
