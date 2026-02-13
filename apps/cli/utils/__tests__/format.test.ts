import { describe, expect, test } from "bun:test";
import { formatBranchName } from "../format";

describe("formatBranchName", () => {
  describe("with StackedBranch object (branch variant)", () => {
    test("shows filled circle for current branch", () => {
      const result = formatBranchName({
        branch: {
          name: "feature-branch",
          current: true,
          stackName: "stack/my-stack",
        },
      });
      expect(result).toContain("●");
      expect(result).not.toContain("○");
    });

    test("shows empty circle for non-current branch", () => {
      const result = formatBranchName({
        branch: {
          name: "feature-branch",
          current: false,
          stackName: "stack/my-stack",
        },
      });
      expect(result).toContain("○");
      expect(result).not.toContain("●");
    });

    test("includes branch name", () => {
      const result = formatBranchName({
        branch: {
          name: "my-feature",
          current: false,
          stackName: "stack/my-stack",
        },
      });
      expect(result).toContain("my-feature");
    });

    test("pads branch name to 30 characters", () => {
      const result = formatBranchName({
        branch: {
          name: "short",
          current: false,
          stackName: "stack/my-stack",
        },
      });
      // "○ " + "short" padded to 30 = "○ short                         "
      // The name portion should be 30 chars (padEnd(30))
      expect(result).toContain("short");
      // After the circle and space, the name should be padded
      const afterIndicator = result.replace(/^[○●]\s/, "");
      expect(afterIndicator.length).toBe(30);
    });

    test("does not indent by default", () => {
      const result = formatBranchName({
        branch: {
          name: "feature-branch",
          current: false,
          stackName: "stack/my-stack",
        },
      });
      expect(result).not.toMatch(/^\s\s/);
    });

    test("indents when indent is true", () => {
      const result = formatBranchName({
        branch: {
          name: "feature-branch",
          current: false,
          stackName: "stack/my-stack",
        },
        indent: true,
      });
      expect(result).toMatch(/^\s\s/);
    });

    test("does not indent when indent is false", () => {
      const result = formatBranchName({
        branch: {
          name: "feature-branch",
          current: false,
          stackName: "stack/my-stack",
        },
        indent: false,
      });
      expect(result).not.toMatch(/^\s\s/);
    });
  });

  describe("with name/isCurrent variant (base branch display)", () => {
    test("shows filled circle for current branch", () => {
      const result = formatBranchName({
        name: "main",
        isCurrent: true,
      });
      expect(result).toContain("●");
      expect(result).not.toContain("○");
    });

    test("shows empty circle for non-current branch", () => {
      const result = formatBranchName({
        name: "main",
        isCurrent: false,
      });
      expect(result).toContain("○");
      expect(result).not.toContain("●");
    });

    test("includes branch name", () => {
      const result = formatBranchName({
        name: "main",
        isCurrent: false,
      });
      expect(result).toContain("main");
    });

    test("includes (base) suffix", () => {
      const result = formatBranchName({
        name: "main",
        isCurrent: false,
      });
      expect(result).toContain("(base)");
    });

    test("indents when indent is true", () => {
      const result = formatBranchName({
        name: "main",
        isCurrent: false,
        indent: true,
      });
      expect(result).toMatch(/^\s\s/);
    });

    test("does not indent by default", () => {
      const result = formatBranchName({
        name: "main",
        isCurrent: false,
      });
      expect(result).not.toMatch(/^\s\s/);
    });
  });
});
