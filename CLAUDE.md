# CLAUDE.md

This file provides guidance for AI assistants working on the Graphene codebase.

## Project Overview

Graphene is an offline, open-source CLI tool for Git branch management, inspired by the Graphite CLI. It introduces "stacks" - groups of related branches that build upon each other - to help developers manage complex feature development and PR chains.

- **Runtime**: Bun v1.2.1
- **Language**: TypeScript (strict mode)
- **Architecture**: Monorepo with Bun workspaces + Turborepo

## Repository Structure

```
graphene/
├── apps/
│   └── cli/                    # CLI application (@allends/graphene-cli)
│       ├── commands/           # Command handlers (auth, branch, repo, stack)
│       ├── types/              # TypeScript type definitions
│       ├── utils/              # Formatting utilities (e.g., branch display)
│       └── index.ts            # Entry point - Commander.js program setup
├── packages/
│   ├── core/                   # Core business logic (@allends/graphene-core)
│   │   ├── services/
│   │   │   ├── git.ts          # Git operations wrapper (spawn-based)
│   │   │   ├── branches.ts     # Branch metadata & stack relationships
│   │   │   ├── stack.ts        # Stack coordination & rebase logic
│   │   │   ├── pullRequest.ts  # GitHub PR creation via `gh` CLI
│   │   │   ├── authentication.ts # GitHub auth via `gh` CLI
│   │   │   └── system.ts       # Cleanup & maintenance operations
│   │   └── index.ts            # Re-exports all services
│   └── database/               # Database layer (@allends/graphene-database)
│       ├── src/
│       │   ├── schema.ts       # Drizzle ORM table definitions
│       │   ├── index.ts        # DatabaseService singleton
│       │   └── migrate.ts      # Migration runner
│       ├── src/migrations/     # SQL migration files (0000-0005)
│       └── drizzle.config.ts   # Drizzle Kit configuration
├── biome.json                  # Linter & formatter config
├── turbo.json                  # Turborepo task definitions
├── tsconfig.json               # Root TypeScript configuration
└── package.json                # Workspace root
```

### Package Dependency Graph

```
cli -> core -> database
```

- `@allends/graphene-cli` depends on `@allends/graphene-core`
- `@allends/graphene-core` depends on `@allends/graphene-database`

## Common Commands

```bash
# Install dependencies
bun install

# Build all packages (via Turborepo)
bun run build

# Run CLI in development mode
bun run dev

# Format code
bun run format

# Lint code
bun run lint

# Database migrations
cd packages/database && bun run generate   # Generate new migration
cd packages/database && bun run migrate    # Apply migrations
cd packages/database && bun run studio     # Open Drizzle Studio
```

## Code Style & Conventions

### Formatting & Linting (Biome)

- **Formatter**: Space indentation, double quotes for JS/TS strings
- **Linter**: Biome recommended rules enabled; `noForEach` is disabled (forEach is allowed)
- **Import organization**: Enabled and auto-sorted
- **Scope**: Only `**/src/**/*` files are checked; `node_modules`, `dist`, `bun.lockb` are ignored
- Run `bun run format` before committing; run `bun run lint` to check for issues

### TypeScript

- Strict mode enabled globally
- Target: ESNext, module: ESNext, bundler module resolution
- `.ts` extension imports allowed (`allowImportingTsExtensions`)
- No emit (Bun handles execution directly)

### Architecture Patterns

- **Singleton services**: All services use a static `getInstance()` pattern (GitService, BranchService, StackService, DatabaseService, etc.)
- **Command registration**: Each feature area exports a `register*Commands(program)` function that adds subcommands to the Commander.js program
- **Git operations**: All git interactions go through `GitService` which spawns `git` subprocesses via `Bun.spawn`. No git library is used.
- **GitHub integration**: Uses the `gh` CLI tool (not the GitHub API directly) for authentication and PR operations
- **Database**: SQLite stored at `~/.graphene/graphene.db`, managed with Drizzle ORM. The `DatabaseService` auto-initializes and runs migrations on first use.

### Database Schema

Four tables with these relationships:
- `repositories` - tracks repos by name, stores base branches as JSON
- `stacks` - groups of branches, belongs to a repository, has a base branch
- `branches` - individual branches with position in stack, self-referencing parent_id
- Types are exported via Drizzle's `$inferSelect`: `Stack`, `Branch`, `Repository`

### Error Handling

- Commands use try/catch with descriptive error messages via `chalk.red()`
- Failed commands call `process.exit(1)`
- Error messages distinguish between `Error` instances and unknown errors

### CLI Conventions

- Commands use Commander.js with subcommand groups: `auth`, `branch`, `stack`, `repo`
- Interactive prompts use Inquirer.js
- Colored output uses Chalk
- Branch display formatting is centralized in `apps/cli/utils/`

## Versioning

- Uses [Changesets](https://github.com/changesets/changesets) for version management
- Base branch: `main`
- Access: restricted (npm private by default)
- Run `bunx @changesets/cli` to create a changeset for your changes

## Key Things to Know

1. **No test suite exists yet** - The project is in active early development and lacks automated tests
2. **`gh` CLI is a runtime dependency** - PR and auth features require GitHub CLI to be installed
3. **Database is local** - All state is stored in SQLite at `~/.graphene/graphene.db`; there is no remote/server component
4. **Build before linking** - The `clink` script builds then symlinks the CLI binary; always run `bun run build` first
5. **Turborepo caching** - Builds use Turbo with `dependsOn: ["^build"]` so packages build in dependency order
