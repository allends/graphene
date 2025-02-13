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
  DatabaseService,
  PullRequestService,
} from "@graphene/core";
import open from "open";
import inquirer from "inquirer";
import { eq } from "drizzle-orm";
import { formatBranchName } from "./utils/format";

const program = new Command();

// Setup basic program information
program
  .name("graphene")
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
      chalk.yellow("graphene --help"),
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
  .description("Initialize a new Git repository")
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
        chalk.blue("graphene create <name>"),
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
  .command("create")
  .alias("c")
  .description("Create a new branch in a stack")
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
      const baseBranch = await gitService.getBaseBranch();

      console.log(
        chalk.blue(`\nRebasing stack`),
        chalk.yellow(stack.stack_name),
        chalk.blue("onto"),
        chalk.yellow(baseBranch),
        chalk.blue("...")
      );

      await stackService.rebaseStack(stack.stack_id, baseBranch);

      console.log(chalk.green("\n✓ Successfully rebased stack\n"));
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

      await prService.createPullRequest(currentBranch);

      console.log(
        chalk.green("\n✓ Successfully created pull request for:"),
        chalk.blue(currentBranch),
        "\n"
      );
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

// Parse command line arguments
program.parse();
