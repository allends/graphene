import { GitService, StackService } from "@allends/graphene-core";
import chalk from "chalk";
import { Command } from "commander";

export const registerRestackCommands = (program: Command) => {
  program
    .command("restack")
    .description("Rebase the current stack onto its base branch")
    .action(async () => {
      try {
        const gitService = GitService.getInstance();
        const stackService = StackService.getInstance();

        // Get current branch
        const currentBranch = await gitService.getCurrentBranch();
        console.log(chalk.blue("\nDetecting current stack..."));

        // Find the stack for the current branch
        const stack = await stackService.getCurrentStack();

        // Get the base branch (main or master)
        const baseBranch = stack.base_branch;

        console.log(
          chalk.blue("\nRebasing stack"),
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
            chalk.red("\nRebase conflicts in branch:"),
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
            chalk.gray(
              "\nResolve conflicts and run 'graphene continue' again\n"
            )
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
};
