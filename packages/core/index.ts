import { createOAuthDeviceAuth } from "@octokit/auth-oauth-device";
import { Octokit } from "octokit";
import { CredentialsService } from "./services/credentials";
import { BranchService, type Branch } from "./services/branches";
import { RepositoryService } from "./services/repository";
import { GitService } from "./services/git";

export type VerificationData = {
  verification_uri: string;
  user_code: string;
  expires_in: number;
};

export async function authenticateWithGitHub(
  onVerification: (data: VerificationData) => void
): Promise<Octokit> {
  if (!process.env.GRAPHENE_CLIENT_ID) {
    throw new Error("GRAPHENE_CLIENT_ID is not set");
  }

  const credentialsService = CredentialsService.getInstance();

  // Check for existing token
  const existingToken = await credentialsService.getToken();
  if (existingToken) {
    return new Octokit({ auth: existingToken });
  }

  const auth = createOAuthDeviceAuth({
    clientId: process.env.GRAPHENE_CLIENT_ID,
    clientType: "oauth-app",
    scopes: [
      "repo", // Full control of repositories
      "workflow", // Access to GitHub workflows
    ],
    onVerification: (verification) => {
      onVerification(verification);
    },
  });

  const { token } = await auth({
    type: "oauth",
  });

  // Store the token securely
  await credentialsService.setToken(token);

  return new Octokit({
    auth: token,
  });
}

export async function logout(): Promise<void> {
  const credentialsService = CredentialsService.getInstance();
  await credentialsService.clearAllTokens();
}

export { BranchService, type Branch, RepositoryService, GitService };
