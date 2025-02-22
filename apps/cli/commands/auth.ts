import { AuthenticationService } from "@allends/graphene-core";
import chalk from "chalk";
import type { Command } from "commander";

export function registerAuthCommands(program: Command) {
  program
    .command("login")
    .description("Login to GitHub")
    .action(async () => {
      try {
        const auth = AuthenticationService.getInstance();

        if (await auth.isAuthenticated()) {
          console.log(chalk.green("\n✓ Already logged in to GitHub\n"));
          return;
        }

        console.log(chalk.blue("\nAuthenticating with GitHub..."));
        await auth.authenticate();
        console.log(chalk.green("\n✓ Successfully logged in to GitHub\n"));
      } catch (error) {
        console.error(
          chalk.red("\nFailed to login:"),
          error instanceof Error ? error.message : "Unknown error"
        );
        process.exit(1);
      }
    });

  program
    .command("logout")
    .description("Log out and remove stored credentials")
    .action(async () => {
      try {
        const auth = AuthenticationService.getInstance();
        await auth.logout();
        console.log(chalk.green("\n✓ Successfully logged out\n"));
      } catch (error) {
        console.error(
          chalk.red("\nLogout failed:"),
          error instanceof Error ? error.message : "Unknown error"
        );
        process.exit(1);
      }
    });
}
