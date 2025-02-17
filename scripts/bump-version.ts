#!/usr/bin/env bun

import { join } from "path";
import { readFileSync, writeFileSync } from "fs";

const PACKAGES = ["core", "database"];
const APPS = ["cli"];

function bumpMinorVersion(version: string): string {
  const [major, minor, patch] = version.split(".").map(Number);
  return `${major}.${minor}.${patch + 1}`;
}

function updatePackageVersion(packagePath: string): void {
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
}

// Get package name from command line args
const [, , target] = process.argv;

if (!target) {
  console.error("Please specify a package name (core, database, cli)");
  process.exit(1);
}

try {
  if (PACKAGES.includes(target)) {
    updatePackageVersion(join("packages", target));
  } else if (APPS.includes(target)) {
    updatePackageVersion(join("apps", target));
  } else {
    console.error(
      `Invalid package name. Must be one of: ${[...PACKAGES, ...APPS].join(
        ", "
      )}`
    );
    process.exit(1);
  }
} catch (error) {
  console.error("Failed to update version:", error);
  process.exit(1);
}
