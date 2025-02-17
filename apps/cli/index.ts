#!/usr/bin/env bun

import {
  AuthenticationService,
  BranchService,
  DatabaseService,
  GitService,
  PullRequestService,
  StackService,
} from "@allends/graphene-core";
import chalk from "chalk";
import { Command } from "commander";
import inquirer from "inquirer";
import { search } from "@inquirer/prompts";
import open from "open";
import { formatBranchName } from "./utils/format";

const program = new Command();

// Setup basic program information
program
  .name("graphene")
  .description("A local version of the Graphite CLI for Git branch management")
  .version("0.0.10");

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
      chalk.yellow("graphene --help"),
      "to see all available commands\n"
    );
  });

program
  .command("auth")
  .description("Authenticate with GitHub")
  .action(async () => {
    try {
      const auth = AuthenticationService.getInstance();

      if (await auth.isAuthenticated()) {
        console.log(chalk.green("\n✓ Already logged in to GitHub\n"));
        return;
      }

      console.log(chalk.blue("\nStarting GitHub authentication..."));
      await auth.authenticate();
      console.log(chalk.green("\n✓ Successfully authenticated with GitHub\n"));
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

program
  .command("list")
  .alias("ls")
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
  .command("create")
  .alias("c")
  .description("Create a new branch in a stack")
  .argument("<name>", "Name of the branch to create")
  .action(async (branchName: string) => {
    try {
      const stackService = StackService.getInstance();

      console.log(chalk.blue("\nCreating branch in stack..."));

      await stackService.createBranchInStack({ branchName });

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

      // Get the base branch (main or master)
      const baseBranch = await gitService.getBaseBranch();

      // Format choices for inquirer with better visual alignment
      const choices = [
        ...Object.entries(groupedBranches).flatMap(([stackName, branches]) => [
          ...branches.reverse().map((branch) => ({
            name: formatBranchName({ branch }),
            value: branch.name,
            short: branch.name,
          })),
          new inquirer.Separator(chalk.blue.bold(`  ${stackName}`)),
          new inquirer.Separator(" "),
        ]),
        {
          name: formatBranchName({
            name: baseBranch,
            isCurrent: baseBranch === currentBranch,
          }),
          value: baseBranch,
          short: baseBranch,
        },
        new inquirer.Separator(" "),
      ];

      // Set up readline interface to handle 'q' keypress
      const rl = require("readline").createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      // Handle 'q' keypress
      process.stdin.on("keypress", (str, key) => {
        if (key.name === "q") {
          console.log(chalk.gray("\nCheckout cancelled\n"));
          rl.close();
          process.exit(0);
        }
      });

      // Enable keypress events
      process.stdin.setRawMode(true);
      process.stdin.resume();

      const { selectedBranch } = await inquirer.prompt({
        type: "list",
        name: "selectedBranch",
        message: "Select branch to checkout (press 'q' to quit):",
        default: currentBranch,
        pageSize: 20,
        choices,
      });

      // Clean up readline interface
      rl.close();
      process.stdin.setRawMode(false);
      process.stdin.pause();

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

program
  .command("modify")
  .alias("m")
  .description("Add or amend changes to the current branch")
  .option("-a, --amend", "Amend the last commit instead of creating a new one")
  .option(
    "-m, --message <message>",
    "Commit message (opens editor if not provided)"
  )
  .action(async (options: { amend?: boolean; message?: string }) => {
    try {
      const gitService = GitService.getInstance();

      if (options.amend) {
        console.log(chalk.blue("\nAmending last commit..."));
        await gitService.amendCommit();
        console.log(chalk.green("\n✓ Successfully amended last commit\n"));
      } else {
        console.log(chalk.blue("\nCreating new commit..."));
        await gitService.commitAll(options.message);
        console.log(chalk.green("\n✓ Successfully created new commit\n"));
      }
    } catch (error) {
      console.error(
        chalk.red("\nFailed to modify branch:"),
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
      const result = await gitService.gitPassthrough(args);

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
  .command("restack")
  .description("Rebase the current stack onto its base branch")
  .action(async () => {
    try {
      const gitService = GitService.getInstance();
      const stackService = StackService.getInstance();
      const db = DatabaseService.getInstance();

      // Get current branch
      const currentBranch = await gitService.getCurrentBranch();
      console.log(chalk.blue("\nDetecting current stack..."));

      // Find the stack for the current branch
      const stack = await stackService.getCurrentStack();

      // Get the base branch (main or master)
      const baseBranch = stack.base_branch;

      console.log(
        chalk.blue(`\nRebasing stack`),
        chalk.yellow(stack.stack_name),
        chalk.blue("onto"),
        chalk.yellow(baseBranch),
        chalk.blue("...")
      );

      const result = await stackService.rebaseStack({
        stackId: stack.stack_id,
        baseBranch,
        currentBranch,
      });

      if (result.success) {
        console.log(chalk.green("\n✓ Successfully rebased stack\n"));
      } else {
        console.error(
          chalk.red(`\nRebase conflicts in branch:`),
          chalk.yellow(result.conflicts?.branch)
        );
        console.error(chalk.red("\nConflicting files:"));
        result.conflicts?.files.forEach((file) => {
          console.log(chalk.yellow(`- ${file}`));
        });
        console.log(
          chalk.gray(
            "\nResolve conflicts and run 'graphene continue' to proceed\n"
          )
        );
        process.exit(1);
      }
    } catch (error) {
      console.error(
        chalk.red("\nFailed to rebase stack:"),
        error instanceof Error ? error.message : "Unknown error"
      );
      process.exit(1);
    }
  });

program
  .command("submit")
  .description("Create a pull request for the current branch")
  .action(async () => {
    try {
      const gitService = GitService.getInstance();
      const prService = PullRequestService.getInstance();

      // Get current branch
      const currentBranch = await gitService.getCurrentBranch();
      console.log(chalk.blue("\nCreating pull request..."));

      const prUrl = await prService.createPullRequest(currentBranch);

      // Open the PR in the browser
      await open(prUrl);

      console.log(
        chalk.green("\n✓ Successfully created pull request for:"),
        chalk.blue(currentBranch)
      );
      console.log(chalk.gray("Opening in browser:"), chalk.blue(prUrl), "\n");
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes("Parent branch must have an open PR")) {
          console.error(
            chalk.yellow("\nCannot create pull request:"),
            "The branch below this one in the stack needs a PR first\n"
          );
        } else if (error.message.includes("not part of a stack")) {
          console.error(
            chalk.yellow("\nCannot create pull request:"),
            "Current branch is not part of a stack\n"
          );
        } else if (error.message.includes("base of stack")) {
          console.error(
            chalk.yellow("\nCannot create pull request:"),
            "This is the base branch of the stack\n"
          );
        } else {
          console.error(
            chalk.red("\nFailed to create pull request:"),
            error.message,
            "\n"
          );
        }
      } else {
        console.error(
          chalk.red("\nFailed to create pull request:"),
          "Unknown error",
          "\n"
        );
      }
      process.exit(1);
    }
  });

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
  .command("search")
  .alias("s")
  .description("Search and checkout remote branches")
  .action(async () => {
    try {
      const gitService = GitService.getInstance();
      let searchResults: string[] = [];

      const selectedBranch = await search({
        message: "Select a branch to checkout",
        source: async (input, { signal }) => {
          if (!input) {
            return [];
          }

          const remoteBranches = await gitService.searchRemoteBranches(input);

          return remoteBranches.map((branch) => ({
            name: branch,
            value: branch,
          }));
        },
      });

      if (selectedBranch) {
        console.log(chalk.blue(`\nChecking out branch: ${selectedBranch}`));
        await gitService.checkoutBranch(selectedBranch);
        console.log(
          chalk.green("\n✓ Successfully checked out branch:"),
          chalk.blue(selectedBranch),
          "\n"
        );
      }
    } catch (error) {
      console.error(
        chalk.red("\nFailed to search branches:"),
        error instanceof Error ? error.message : "Unknown error"
      );
      process.exit(1);
    }
  });

program
  .command("continue")
  .description("Continue a rebase after resolving conflicts")
  .action(async () => {
    try {
      const gitService = GitService.getInstance();

      const isRebaseInProgress = await gitService.isRebaseInProgress();

      // Check if we're in a rebase using the new method
      if (!isRebaseInProgress) {
        console.log(chalk.yellow("\nNo rebase in progress.\n"));
        return;
      }

      console.log(chalk.blue("\nContinuing rebase..."));

      // Use the new continueRebase method
      const result = await gitService.continueRebase();

      if (result.success) {
        console.log(chalk.green("\n✓ Successfully continued rebase\n"));
      } else {
        // Show remaining conflicts
        console.error(chalk.red("\nRebase conflicts still exist in:"));
        result.conflicts?.forEach((file) => {
          console.log(chalk.yellow(`- ${file}`));
        });
        console.log(
          chalk.gray("\nResolve conflicts and run 'graphene continue' again\n")
        );
        process.exit(1);
      }
    } catch (error) {
      console.error(
        chalk.red("\nFailed to continue rebase:"),
        error instanceof Error ? error.message : "Unknown error"
      );
      process.exit(1);
    }
  });

// Parse command line arguments
program.parse();
