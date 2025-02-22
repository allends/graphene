import { Command } from "commander";
import chalk from "chalk";
import {
  StackService,
  GitService,
  BranchService,
  PullRequestService,
} from "@allends/graphene-core";

export function registerStackCommands(program: Command) {
  program
    .command("rename")
    .description("Rename the current stack")
    .argument("<name>", "New name for the stack")
    .action(async (newName: string) => {
      try {
        const stackService = StackService.getInstance();

        // Get current stack info for feedback
        const { stack_name: oldName } = await stackService.getCurrentStack();

        console.log(
          chalk.blue("\nRenaming stack:"),
          chalk.yellow(oldName),
          chalk.blue("→"),
          chalk.yellow(newName)
        );

        await stackService.renameCurrentStack(newName);

        console.log(
          chalk.green("\n✓ Successfully renamed stack:"),
          chalk.blue(`${oldName} → ${newName}\n`)
        );
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes("not part of a stack")
        ) {
          console.error(
            chalk.yellow("\nCannot rename stack:"),
            "Current branch is not part of a stack\n"
          );
        } else {
          console.error(
            chalk.red("\nFailed to rename stack:"),
            error instanceof Error ? error.message : "Unknown error",
            "\n"
          );
        }
        process.exit(1);
      }
    });

  program
    .command("up")
    .description("Checkout the branch above in the current stack")
    .action(async () => {
      try {
        const stackService = StackService.getInstance();
        const gitService = GitService.getInstance();
        const branchService = BranchService.getInstance();

        // Check if current branch is a base branch
        const baseBranches = await branchService.listBaseBranches();
        const currentBranch = await gitService.getCurrentBranch();

        if (baseBranches.includes(currentBranch)) {
          console.log(
            chalk.yellow("\nCannot move up:"),
            "Current branch is a base branch\n"
          );
          return;
        }

        const upstreamBranch = await stackService.getUpstreamBranch();

        if (!upstreamBranch) {
          console.log(
            chalk.yellow("\nCannot move up:"),
            "Already at the top of the stack\n"
          );
          return;
        }

        console.log(chalk.blue(`\nMoving up to branch: ${upstreamBranch}`));
        await gitService.checkoutBranch(upstreamBranch);
        console.log(chalk.green("\n✓ Successfully checked out branch\n"));
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes("not part of a stack")
        ) {
          console.error(
            chalk.yellow("\nCannot move up:"),
            "Current branch is not part of a stack\n"
          );
        } else {
          console.error(
            chalk.red("\nFailed to move up:"),
            error instanceof Error ? error.message : "Unknown error",
            "\n"
          );
        }
        process.exit(1);
      }
    });

  program
    .command("down")
    .description("Checkout the branch below in the current stack")
    .action(async () => {
      try {
        const stackService = StackService.getInstance();
        const gitService = GitService.getInstance();

        const downstreamBranch = await stackService.getDownstreamBranch();

        if (!downstreamBranch) {
          console.log(
            chalk.yellow("\nCannot move down:"),
            "Already at the bottom of the stack\n"
          );
          return;
        }

        console.log(chalk.blue(`\nMoving down to branch: ${downstreamBranch}`));
        await gitService.checkoutBranch(downstreamBranch);
        console.log(chalk.green("\n✓ Successfully checked out branch\n"));
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes("not part of a stack")
        ) {
          console.error(
            chalk.yellow("\nCannot move down:"),
            "Current branch is not part of a stack\n"
          );
        } else {
          console.error(
            chalk.red("\nFailed to move down:"),
            error instanceof Error ? error.message : "Unknown error",
            "\n"
          );
        }
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
        open(prUrl);

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
}
