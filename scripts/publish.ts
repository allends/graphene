#!/usr/bin/env bun

import { join } from "path";
import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import chalk from "chalk";

const PACKAGES = ["core", "database"];
const APPS = ["cli"];
const ALL_PACKAGES = [...PACKAGES, ...APPS];

function bumpMinorVersion(version: string): string {
  const [major, minor, patch] = version.split(".").map(Number);
  return `${major}.${minor}.${patch + 1}`;
}

function updatePackageVersion(packagePath: string): string {
  // Read package.json
  const packageJsonPath = join(packagePath, "package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));

  // Bump version
  const currentVersion = packageJson.version;
  const newVersion = bumpMinorVersion(currentVersion);
  packageJson.version = newVersion;

  // Write updated package.json
  writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + "\n");

  console.log(
    `Updated ${packagePath} version: ${currentVersion} -> ${newVersion}`
  );

  return newVersion;
}

async function main() {
  try {
    // First bump all package versions
    console.log(chalk.blue("\nBumping package versions..."));
    for (const pkg of PACKAGES) {
      updatePackageVersion(join("packages", pkg));
    }
    for (const app of APPS) {
      updatePackageVersion(join("apps", app));
    }

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
