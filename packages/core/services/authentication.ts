import { spawn } from "node:child_process";

export class AuthenticationService {
  private static instance: AuthenticationService;

  private constructor() {}

  public static getInstance(): AuthenticationService {
    if (!AuthenticationService.instance) {
      AuthenticationService.instance = new AuthenticationService();
    }
    return AuthenticationService.instance;
  }

  /**
   * Checks if user is authenticated with GitHub CLI
   */
  public async isAuthenticated(): Promise<boolean> {
    const child = spawn("gh", ["auth", "status"]);

    return new Promise((resolve) => {
      let error = "";

      child.stderr.on("data", (data) => {
        error += data.toString();
      });

      child.on("close", (code) => {
        resolve(code === 0);
      });
    });
  }

  /**
   * Authenticates user with GitHub CLI
   * @throws Error if authentication fails
   */
  public async authenticate(): Promise<void> {
    const child = spawn("gh", ["auth", "login"], {
      stdio: "inherit", // This connects the child process to the parent's TTY
    });

    return new Promise((resolve, reject) => {
      child.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error("Failed to authenticate with GitHub"));
        }
      });
    });
  }

  /**
   * Logs out the user from GitHub CLI
   */
  public async logout(): Promise<void> {
    const child = spawn("gh", ["auth", "logout"]);

    return new Promise((resolve, reject) => {
      child.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error("Failed to logout from GitHub"));
        }
      });
    });
  }
}
