import type { StackedBranch } from "@graphene/core/services/branches";
import chalk from "chalk";

type FormatBranchNameParams =
  | {
      branch: StackedBranch;
    }
  | {
      name: string;
      isCurrent: boolean;
    };

export const formatBranchName = (params: FormatBranchNameParams) => {
  if ("branch" in params) {
    const { branch } = params;

    return `  ${branch.current ? "●" : "○"} ${branch.name.padEnd(30)}`;
  }

  const { name, isCurrent } = params;

  return `  ${isCurrent ? "●" : "○"} ${name} ${chalk.blue("(base)")}`;
};
