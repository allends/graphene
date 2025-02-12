import keytar from "keytar";

const KEYCHAIN_SERVICE = "graphite-local";
const KEYCHAIN_ACCOUNT = "github-token";

export class CredentialsService {
  private static instance: CredentialsService;

  private constructor() {}

  public static getInstance(): CredentialsService {
    if (!CredentialsService.instance) {
      CredentialsService.instance = new CredentialsService();
    }
    return CredentialsService.instance;
  }

  public async getToken(): Promise<string | null> {
    return keytar.getPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
  }

  public async setToken(token: string): Promise<void> {
    await keytar.setPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, token);
  }

  public async removeToken(): Promise<boolean> {
    return keytar.deletePassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
  }

  public async clearAllTokens(): Promise<void> {
    try {
      // Find all credentials for our service
      const credentials = await keytar.findCredentials(KEYCHAIN_SERVICE);

      // Delete each credential
      await Promise.all(
        credentials.map((cred) =>
          keytar.deletePassword(KEYCHAIN_SERVICE, cred.account)
        )
      );
    } catch (error) {
      throw new Error(
        `Failed to clear credentials: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }
}
