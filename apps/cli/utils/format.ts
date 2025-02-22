import type { StackedBranch } from "@allends/graphene-core/services/branches";
import chalk from "chalk";

type FormatBranchNameParams =
  | {
      branch: StackedBranch;
      indent?: boolean;
    }
  | {
      name: string;
      isCurrent: boolean;
      indent?: boolean;
    };

export const formatBranchName = (params: FormatBranchNameParams) => {
  if ("branch" in params) {
    const { branch, indent = false } = params;

    return `${indent ? "  " : ""}${
      branch.current ? "●" : "○"
    } ${branch.name.padEnd(30)}`;
  }

  const { name, isCurrent, indent = false } = params;

  return `${indent ? "  " : ""}${isCurrent ? "●" : "○"} ${name} ${chalk.blue(
    "(base)",
  )}`;
};
