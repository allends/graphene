#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import {
  authenticateWithGitHub,
  logout,
  BranchService,
  RepositoryService,
  GitService,
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
  .description("List all local branches")
  .action(async () => {
    try {
      const branchService = BranchService.getInstance();
      const branches = await branchService.listLocalBranches();

      console.log(chalk.blue("\nLocal branches:"));

      branches.forEach((branch) => {
        const prefix = branch.current ? "* " : "  ";
        console.log(
          chalk.blue(prefix),
          branch.current ? chalk.green(branch.name) : chalk.blue(branch.name)
        );
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
  .command("create")
  .description("Create a new GitHub repository")
  .action(async () => {
    try {
      const answers = await inquirer.prompt([
        {
          type: "input",
          name: "name",
          message: "Repository name:",
          validate: (input) => {
            if (input.trim().length === 0) {
              return "Repository name cannot be empty";
            }
            if (!/^[a-zA-Z0-9-_]+$/.test(input)) {
              return "Repository name can only contain letters, numbers, hyphens, and underscores";
            }
            return true;
          },
        },
        {
          type: "input",
          name: "description",
          message: "Repository description (optional):",
        },
        {
          type: "confirm",
          name: "isPrivate",
          message: "Make repository private?",
          default: false,
        },
      ]);

      const repoService = RepositoryService.getInstance();

      console.log(chalk.blue("\nCreating GitHub repository..."));

      const repoUrl = await repoService.createGitHubRepository(
        answers.name,
        answers.description || undefined,
        answers.isPrivate
      );

      console.log(chalk.green("\n✓ Repository created successfully"));
      console.log(chalk.gray("Repository URL:"), chalk.blue(repoUrl));
      console.log(chalk.gray("\nNext steps:"));
      console.log(
        chalk.gray("1."),
        "Push your code:",
        chalk.blue("git push -u origin main"),
        "\n"
      );
    } catch (error) {
      console.error(
        chalk.red("\nFailed to create repository:"),
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

// Parse command line arguments
program.parse();
