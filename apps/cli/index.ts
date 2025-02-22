#!/usr/bin/env bun

import { GitService } from "@allends/graphene-core";
import chalk from "chalk";

import { Command } from "commander";
import { registerStackCommands } from "./commands/stack";
import { registerBranchCommands } from "./commands/branch";
import { registerRepoCommands } from "./commands/repo";
import { registerAuthCommands } from "./commands/auth";

export const program = new Command();

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

// Register commands from separate files
registerAuthCommands(program);
registerStackCommands(program);
registerBranchCommands(program);
registerRepoCommands(program);

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

// Parse command line arguments
program.parse();
