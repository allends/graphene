import { Command } from "commander";
import chalk from "chalk";
import { DatabaseService, GitService } from "@allends/graphene-core";
import { repositories } from "@allends/graphene-database";
import { eq } from "drizzle-orm";
import inquirer from "inquirer";

export function registerRepoCommands(program: Command) {
  program
    .command("init")
    .description("Initialize a new repository configuration")
    .action(async () => {
      try {
        const db = DatabaseService.getInstance();
        const gitService = GitService.getInstance();

        console.log(chalk.blue("\nInitializing repository configuration..."));

        // Get the repository name in owner/repo format
        const repoName = await gitService.getRepositoryName();
        if (!repoName) {
          throw new Error(
            "No repository name found. Please add a remote first."
          );
        }

        // Get available branches
        const remoteBranches = await gitService.listRemoteBranches();

        // Filter out common base branch names
        const commonBaseBranches = remoteBranches.filter((branch: string) =>
          ["main", "master", "develop", "development"].includes(branch)
        );

        // Check for existing configuration
        const existingRepo = await db
          .getDb()
          .select()
          .from(repositories)
          .where(eq(repositories.name, repoName))
          .limit(1);

        const existingBranches = existingRepo[0]?.base_branches
          ? JSON.parse(existingRepo[0].base_branches)
          : [];

        // Let user select base branches
        const { selectedBranches } = await inquirer.prompt({
          type: "checkbox",
          name: "selectedBranches",
          message: "Select base branches for this repository:",
          choices: remoteBranches.map((branch: string) => ({
            name: branch,
            value: branch,
            checked:
              existingBranches.includes(branch) ||
              commonBaseBranches.includes(branch),
          })),
          validate: (input) => {
            if (input.length === 0) {
              return "Please select at least one base branch";
            }
            return true;
          },
        });

        // Upsert repository entry
        await db
          .getDb()
          .insert(repositories)
          .values({
            name: repoName,
            base_branches: JSON.stringify(selectedBranches),
          })
          .onConflictDoUpdate({
            target: repositories.name,
            set: {
              base_branches: JSON.stringify(selectedBranches),
            },
          });

        const action = existingRepo.length > 0 ? "Updated" : "Initialized";
        console.log(
          chalk.green(
            `\n✓ Successfully ${action.toLowerCase()} repository with base branches:`
          ),
          selectedBranches.map((b: string) => chalk.blue(b)).join(", "),
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
}
