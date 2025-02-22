#!/usr/bin/env bun

import { execSync } from "node:child_process";
import chalk from "chalk";

const PACKAGES = ["core", "database"];
const APPS = ["cli"];

async function main() {
  try {
    // Then build all packages
    console.log(chalk.blue("\nBuilding packages..."));
    execSync("bun run build", { stdio: "inherit" });

    // Finally publish packages in order (core -> database -> cli)
    console.log(chalk.blue("\nPublishing packages..."));

    for (const pkg of PACKAGES) {
      console.log(chalk.yellow(`\nPublishing ${pkg}...`));
      execSync(`cd packages/${pkg} && bun publish`, { stdio: "inherit" });
    }

    for (const app of APPS) {
      console.log(chalk.yellow(`\nPublishing ${app}...`));
      execSync(`cd apps/${app} && bun publish`, { stdio: "inherit" });
    }

    console.log(chalk.green("\n✓ Successfully published all packages\n"));
  } catch (error) {
    console.error(
      chalk.red("\nFailed to publish packages:"),
      error instanceof Error ? error.message : "Unknown error"
    );
    process.exit(1);
  }
}

main();
