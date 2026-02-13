# Test Coverage Analysis

## Current State

The Graphene codebase has **zero test coverage**. There are no test files, no test framework configured, no test scripts in any `package.json`, and no test task in `turbo.json`. This document analyzes the codebase and proposes a prioritized testing strategy.

## Recommended Test Framework

**Bun's built-in test runner** (`bun test`) is the natural choice since the project already uses Bun as its runtime. It includes:
- A Jest-compatible `expect` API
- Built-in mocking (`mock.module`, `spyOn`)
- Snapshot testing
- Watch mode
- No additional dependencies required

## Architecture & Testability Challenges

All services use a **singleton pattern** (`static getInstance()`), which makes dependency injection difficult. The two main external dependencies are:

1. **Git CLI** — `GitService` spawns `git` subprocesses for every operation
2. **GitHub CLI (`gh`)** — `PullRequestService` and `AuthenticationService` spawn `gh` subprocesses

Testing these requires either mocking `spawn` calls or wrapping the subprocess layer behind an interface that can be swapped in tests.

The **database layer** uses SQLite at `~/.graphene/graphene.db`, which can be tested using an in-memory SQLite database or a temporary file.

## Proposed Test Areas (Prioritized)

### Priority 1: Core Service Logic (High Value, Moderate Effort)

These modules contain the most critical business logic and are where bugs would cause the most damage.

#### 1. `StackService` (`packages/core/services/stack.ts`)

| What to test | Why |
|---|---|
| `createBranchInStack` — position assignment, parent linking | Position off-by-one bugs would corrupt stack ordering |
| `rebaseStack` — sequential rebase orchestration | Most complex operation; a failure mid-stack leaves the repo in a broken state |
| `trackBranch` / `untrackBranch` — position reordering on remove | Removing a middle branch must decrement positions of all subsequent branches |
| `deleteStacks` — cascade behavior | Must clean up all associated branches |
| `createStackFromHistory` — commit history parsing | Parsing logic depends on specific git log output format |
| `getParentBranch` / `getUpstreamBranch` / `getDownstreamBranch` — traversal | Off-by-one in position lookups breaks stack navigation |

**Testing approach**: Mock `GitService` and use an in-memory SQLite database. This isolates the stack coordination logic from git operations.

#### 2. `GitService` (`packages/core/services/git.ts`)

| What to test | Why |
|---|---|
| `rebaseBranches` — conflict detection from stderr parsing | Incorrect parsing means silent rebase failures |
| `foldBranch` / `continueFold` — merge conflict flow | Multi-step operation with state carried across calls |
| `getRepositoryName` — remote URL parsing | Must handle both HTTPS and SSH remote formats |
| `getBaseBranch` — upstream detection with fallback | Fallback logic (upstream → origin/main → origin/master) has multiple code paths |
| `squashBranch` — commit message handling | Must preserve or generate appropriate messages |
| `getAheadBehindCount` — output parsing | Regex parsing of `git rev-list` output |

**Testing approach**: Use a temporary git repository (created in a temp directory with `git init`) for integration-style tests. For unit tests, mock `executeGitCommand` to return known stdout/stderr strings and verify parsing logic.

#### 3. `DatabaseService` (`packages/database/src/index.ts`)

| What to test | Why |
|---|---|
| `createStack` — "stack/" name prefixing | Ensures naming convention is enforced |
| `getBaseBranches` — JSON parsing with `["main"]` fallback | Malformed JSON in DB would crash without the fallback |
| `addBranchToStack` — position and parent_id assignment | Incorrect inserts corrupt stack structure |
| `getBranchesInStack` — ordering by position | Must return branches in correct stack order |
| Migration execution — schema creation | Ensures migrations apply cleanly to a fresh database |

**Testing approach**: Use in-memory SQLite (`new Database(":memory:")`) for fast, isolated tests. Each test gets a fresh database.

### Priority 2: Data Formatting & Display (High Value, Low Effort)

These are pure functions or near-pure functions that are easy to test and frequently touched.

#### 4. `formatBranchName` (`apps/cli/utils/format.ts`)

| What to test | Why |
|---|---|
| Current branch indicator (`●` vs `○`) | Visual correctness for the most-used command (`branch list`) |
| Base branch suffix rendering | Users rely on this to identify base branches |
| Padding/alignment | Affects readability of branch lists |

**Testing approach**: Pure function — pass in different branch objects and assert on string output. No mocking needed.

#### 5. `BranchService` (`packages/core/services/branches.ts`)

| What to test | Why |
|---|---|
| `listBranches` — grouping by stack, marking current | Drives the main branch list display |
| `listBaseBranches` — fallback when no config exists | Must default gracefully for unconfigured repos |

**Testing approach**: Mock `GitService` and use in-memory database.

### Priority 3: CLI Command Integration (Medium Value, Higher Effort)

These tests verify that commands wire services together correctly.

#### 6. Stack Commands (`apps/cli/commands/stack.ts`)

| What to test | Why |
|---|---|
| `submit` — push + PR existence check + create flow | Most complex user-facing workflow; incorrect ordering breaks PRs |
| `restack` — conflict handling and continuation | Users encounter this during daily workflow |
| `up` / `down` — edge cases (base branch, top of stack) | Should produce clear error messages, not crash |
| `delete` — empty selection validation | Should handle edge case gracefully |

#### 7. Branch Commands (`apps/cli/commands/branch.ts`)

| What to test | Why |
|---|---|
| `track` — error handling for "already tracked" and "not in stack" | Specific error messages matter for UX |
| `fold` / `continue` — conflict recovery flow | Multi-step operation spanning multiple command invocations |
| `modify` — amend vs. new commit decision | Flag-based branching logic |

**Testing approach**: Mock all service singletons. Test that commands call the right service methods with the right arguments, and that error paths produce appropriate exit codes and messages.

### Priority 4: Edge Cases & Error Handling (Medium Value, Medium Effort)

#### 8. `PullRequestService` (`packages/core/services/pullRequest.ts`)

| What to test | Why |
|---|---|
| `createPullRequest` — base branch selection (parent vs. base) | Bottom-of-stack branches need different base branch logic |
| `checkPRExists` — output parsing | Must correctly distinguish "exists" from "not found" |
| `getBranchesWithClosedPullRequests` — filtering | Drives the cleanup workflow |

#### 9. `cleanupClosedPullRequestBranches` (`packages/core/services/system.ts`)

| What to test | Why |
|---|---|
| Orphaned stack detection after branch deletion | Stacks with zero remaining branches should be cleaned up |
| Partial cleanup (some branches closed, some open) | Must not delete branches that still have open PRs |

### Priority 5: Schema & Migration Integrity (Low Frequency, Important Safety Net)

#### 10. Database Schema (`packages/database/src/schema.ts`)

| What to test | Why |
|---|---|
| Cascade deletes (repo → stacks → branches) | Incorrect cascade config could leave orphaned records or delete too much |
| Self-referencing `parent_id` with NULL for first branch | NULL handling in foreign keys is a common source of bugs |
| Default values (`status = "active"`, timestamps) | Ensures ORM defaults are applied correctly |

## Recommended Implementation Order

1. **Set up test infrastructure** — Add `"test": "bun test"` scripts to each `package.json`, add a `test` task to `turbo.json`, create test directories
2. **Start with `formatBranchName`** — Pure function, zero dependencies, builds confidence in the test setup
3. **Add `DatabaseService` tests with in-memory SQLite** — Validates the data layer independently
4. **Add `StackService` tests with mocked git** — Highest-value tests covering the most complex logic
5. **Add `GitService` parsing tests** — Unit test the output parsing without spawning git
6. **Add `GitService` integration tests** — Use temp git repos for end-to-end git operation verification
7. **Add CLI command tests** — Verify wiring and error handling at the command level

## Structural Recommendations

To improve testability long-term:

1. **Extract `executeGitCommand` behind an interface** — Allow tests to substitute a mock implementation without patching internals
2. **Accept database instances via constructor** — Instead of always reading from `~/.graphene/graphene.db`, allow passing an in-memory DB for tests
3. **Avoid singleton coupling in tests** — Consider a factory or DI pattern that lets tests create fresh service instances with controlled dependencies
4. **Separate output parsing from subprocess execution in `GitService`** — Extract functions like `parseRebaseConflict(stderr: string): boolean` that can be tested as pure functions
