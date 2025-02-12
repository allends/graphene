#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import {
  authenticateWithGitHub,
  logout,
  BranchService,
  RepositoryService,
  GitService,
  StackService,
} from "@graphene/core";
import open from "open";
import inquirer from "inquirer";

const program = new Command();

// Setup basic program information
program
  .name("graphite-local")
  .description("A local version of the Graphite CLI for Git branch management")
  .version("0.0.1");

// Add a default command to show basic information
program
  .command("info", { isDefault: true })
  .description("Display information about Graphite Local")
  .action(() => {
    console.log(chalk.bold.blue("\nGraphite Local CLI"));
    console.log(chalk.gray("A free, offline Git branch management tool\n"));
    console.log("Features:");
    console.log(chalk.green("✓"), "Interactive branch checkout");
    console.log(chalk.green("✓"), "Branch management");
    console.log(chalk.green("✓"), "GitHub integration");
    console.log(
      "\nRun",
      chalk.yellow("graphite-local --help"),
      "to see all available commands\n"
    );
  });

program
  .command("auth")
  .description("Authenticate with GitHub")
  .action(async () => {
    try {
      console.log(chalk.blue("\nStarting GitHub authentication..."));

      const octokit = await authenticateWithGitHub(async (verification) => {
        // Automatically open the verification URL in the default browser
        await open(verification.verification_uri);

        console.log(
          chalk.yellow(
            "\nIf the browser doesn't open automatically, please visit:"
          ),
          chalk.blue(verification.verification_uri)
        );
        console.log(
          chalk.yellow("Enter this code:"),
          chalk.green(verification.user_code)
        );
        console.log(
          chalk.gray(
            `\nCode expires in ${Math.floor(
              verification.expires_in / 60
            )} minutes`
          )
        );
        console.log(chalk.gray("\nWaiting for authentication..."));
      });

      const { data: user } = await octokit.rest.users.getAuthenticated();
      console.log(
        chalk.green(`\n✓ Successfully authenticated as ${user.login}\n`)
      );
    } catch (error) {
      console.error(
        chalk.red("\nAuthentication failed:"),
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
      await logout();
      console.log(chalk.green("\n✓ Successfully logged out\n"));
    } catch (error) {
      console.error(
        chalk.red("\nLogout failed:"),
        error instanceof Error ? error.message : "Unknown error"
      );
      process.exit(1);
    }
  });

program
  .command("branches")
  .description("List all branches grouped by stack")
  .action(async () => {
    try {
      const branchService = BranchService.getInstance();
      const groupedBranches = await branchService.listBranches();

      console.log(chalk.blue("\nBranches by stack:"));

      Object.entries(groupedBranches).forEach(([stackName, branches]) => {
        console.log(chalk.yellow(`\n${stackName}:`));
        branches.forEach((branch) => {
          const prefix = branch.current ? "* " : "  ";
          console.log(
            chalk.blue(prefix),
            branch.current ? chalk.green(branch.name) : chalk.blue(branch.name)
          );
        });
      });

      console.log(); // Empty line at the end
    } catch (error) {
      console.error(
        chalk.red("\nFailed to list branches:"),
        error instanceof Error ? error.message : "Unknown error"
      );
      process.exit(1);
    }
  });

program
  .command("init")
  .description("Initialize a new Git repository in the current directory")
  .action(async () => {
    try {
      const repoService = RepositoryService.getInstance();

      console.log(chalk.blue("\nInitializing new Git repository..."));

      await repoService.initRepository();

      console.log(chalk.green("\n✓ Repository initialized successfully"));
      console.log(
        chalk.gray("Created empty Git repository with initial commit")
      );
      console.log(chalk.gray("\nNext steps:"));
      console.log(chalk.gray("1."), "Add your files:", chalk.blue("git add ."));
      console.log(
        chalk.gray("2."),
        "Commit changes:",
        chalk.blue("git commit -m 'Initial files'")
      );
      console.log(
        chalk.gray("3."),
        "Create branches:",
        chalk.blue("graphite-local branch create <name>"),
        "\n"
      );
    } catch (error) {
      console.error(
        chalk.red("\nFailed to initialize repository:"),
        error instanceof Error ? error.message : "Unknown error"
      );
      process.exit(1);
    }
  });

program
  .command("git [args...]", { isDefault: true })
  .description("Execute Git commands directly")
  .allowUnknownOption()
  .action(async (args: string[]) => {
    // Only handle if args are provided
    if (!args || args.length === 0) return;

    try {
      const gitService = GitService.getInstance();
      const result = await gitService.executeGitCommand(args);

      // Print output if any
      if (result.output) {
        console.log(result.output);
      }

      // Print error if any
      if (result.error) {
        console.error(chalk.red(result.error));
      }

      // Exit with the same code as git
      if (result.exitCode !== 0) {
        process.exit(result.exitCode);
      }
    } catch (error) {
      console.error(
        chalk.red("\nFailed to execute git command:"),
        error instanceof Error ? error.message : "Unknown error"
      );
      process.exit(1);
    }
  });

program
  .command("branch")
  .description("Branch operations")
  .argument("<name>", "Name of the branch to create")
  .action(async (branchName: string) => {
    try {
      const stackService = StackService.getInstance();

      console.log(chalk.blue("\nCreating branch in stack..."));

      await stackService.createBranchInStack(branchName);

      console.log(
        chalk.green("\n✓ Successfully created branch:"),
        chalk.blue(branchName)
      );
      console.log(
        chalk.gray("Branch is now part of the stack and ready for commits\n")
      );
    } catch (error) {
      console.error(
        chalk.red("\nFailed to create branch:"),
        error instanceof Error ? error.message : "Unknown error"
      );
      process.exit(1);
    }
  });

program
  .command("checkout")
  .alias("co")
  .description("Interactively checkout a branch")
  .action(async () => {
    try {
      const branchService = BranchService.getInstance();
      const gitService = GitService.getInstance();
      const currentBranch = await gitService.getCurrentBranch();

      // Get branches grouped by stack
      const groupedBranches = await branchService.listBranches();

      // Format choices for inquirer
      const choices = Object.entries(groupedBranches).flatMap(
        ([stackName, branches]) => [
          new inquirer.Separator(chalk.yellow(`\n${stackName}`)),
          ...branches.map((branch) => ({
            name: `${branch.current ? chalk.green("* ") : "  "}${branch.name}`,
            value: branch.name,
            short: branch.name,
          })),
        ]
      );

      const { selectedBranch } = await inquirer.prompt([
        {
          type: "list",
          name: "selectedBranch",
          message: "Select branch to checkout:",
          default: currentBranch,
          pageSize: 20,
          choices,
        },
      ]);

      if (selectedBranch === currentBranch) {
        console.log(
          chalk.yellow("\nAlready on branch:"),
          chalk.blue(currentBranch)
        );
        return;
      }

      console.log(chalk.blue("\nChecking out branch..."));

      await gitService.checkoutBranch(selectedBranch);

      console.log(
        chalk.green("\n✓ Switched to branch:"),
        chalk.blue(selectedBranch),
        "\n"
      );
    } catch (error) {
      console.error(
        chalk.red("\nFailed to checkout branch:"),
        error instanceof Error ? error.message : "Unknown error"
      );
      process.exit(1);
    }
  });

// Parse command line arguments
program.parse();
