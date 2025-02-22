import { Command } from "commander";
import chalk from "chalk";
import { BranchService, GitService } from "@allends/graphene-core";
import { formatBranchName } from "../utils/format";
import inquirer from "inquirer";
import { createInterface } from "node:readline";
import { search } from "@inquirer/prompts";

export function registerBranchCommands(program: Command) {
  program
    .command("list")
    .alias("ls")
    .description("List all branches grouped by stack")
    .action(async () => {
      try {
        const branchService = BranchService.getInstance();
        const gitService = GitService.getInstance();
        const currentBranch = await gitService.getCurrentBranch();

        // Get branches grouped by stack
        const groupedBranches = await branchService.listBranches();

        // Get all configured base branches
        const baseBranches = await branchService.listBaseBranches();

        console.log(chalk.blue("\nBranches by stack:"));
        console.log(" ");

        // Format and display branches with consistent styling
        Object.entries(groupedBranches).forEach(([stackName, branches]) => {
          // Show branches in reverse order
          [...branches].reverse().forEach((branch) => {
            console.log(
              formatBranchName({
                branch,
                indent: true,
              })
            );
          });
          console.log(chalk.blue.bold(`  ${stackName}`));
          console.log(" ");
        });

        // Show all base branches at the bottom
        console.log(); // Empty line after section
        baseBranches.forEach((baseBranch) => {
          console.log(
            formatBranchName({
              name: baseBranch,
              isCurrent: baseBranch === currentBranch,
              indent: true,
            })
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

        // Get all configured base branches
        const baseBranches = await branchService.listBaseBranches();

        // Set up readline interface to handle 'q' keypress
        const rl = createInterface({
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
          choices: [
            ...Object.entries(groupedBranches).flatMap(
              ([stackName, branches]) => [
                ...branches.reverse().map((branch) => ({
                  name: formatBranchName({ branch }),
                  value: branch.name,
                  short: branch.name,
                })),
                new inquirer.Separator(chalk.blue.bold(`  ${stackName}`)),
                new inquirer.Separator(" "),
              ]
            ),
            ...baseBranches.map((baseBranch) => ({
              name: formatBranchName({
                name: baseBranch,
                isCurrent: baseBranch === currentBranch,
              }),
              value: baseBranch,
              short: baseBranch,
            })),
            new inquirer.Separator(" "),
          ],
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
    .command("search")
    .alias("s")
    .description("Search and checkout remote branches")
    .action(async () => {
      try {
        const gitService = GitService.getInstance();

        const selectedBranch = await search({
          message: "Select a branch to checkout",
          source: async (input, { signal }) => {
            if (!input) {
              return [];
            }

            const localBranches = await gitService.searchLocalBranches(input);

            if (localBranches.length > 0) {
              return localBranches.map((branch) => ({
                name: branch,
                value: branch,
              }));
            }

            const remoteBranches = await gitService.searchRemoteBranches(input);

            return remoteBranches.map((branch) => ({
              name: branch,
              value: branch,
            }));
          },
          theme: {
            style: {
              highlight: (text: string) => chalk.blue.bold(text),
            },
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
}
