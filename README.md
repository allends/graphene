# Graphene CLI

An offline, open-source version of the Graphite CLI for Git branch management. Graphene helps you manage complex branch workflows and stacks of changes with ease.

This is a work in progress and not all features are available yet. The goal of this project is to provide a simple and easy to use CLI for managing Git branches and pull requests.

## Overview

Graphene is a command-line tool that helps developers manage their Git branches and pull requests more efficiently. It introduces the concept of "stacks" - groups of related branches that build upon each other, making it easier to work on and manage complex feature development.

Features:

✅ = Completed | 🚧 = In Progress | ⏳ = Planned

- ✅ Interactive branch checkout (`graphene checkout` or `graphene co`)
- ✅ Creating branches based off of other branches (`graphene branch <name>`)
- ✅ Listing branches with stack grouping (`graphene branch list` or `graphene branch ls`)
- ✅ Local Git repository initialization (`graphene init`)
- ✅ GitHub authentication (`graphene login`)
- ✅ Branch modification with auto-add (`graphene modify`)
- ✅ Stack creation and management
- ✅ Branch position tracking in stacks
- ✅ Commit tracking per branch
- ✅ Rebasing branches when there is a change on an upstream branch
- ✅ Pushing branches to GitHub
- ✅ Creating pull requests
- ✅ Pulling branches from GitHub
- ✅ Stack visualization
- ✅ Interactive rebase management
- ⏳ Conflict resolution assistance

## Installation

```bash
# Install dependencies
bun install
```

## Usage

````bash
# Show help and available commands
graphene --help

# Initialize a new repository
`graphene init`

Creates a profile for the current directorys repository.

## Branch Commands

```bash
# List all branches grouped by stack
graphene branch list
graphene branch ls

# Create a new branch in the current stack
graphene branch create <name>
graphene branch c <name>

# Interactively checkout a branch
graphene branch checkout
graphene branch co

# Search and checkout remote branches
graphene branch search
graphene branch s

# Track a branch in the current stack
graphene branch track <branch>

# Remove a branch from its stack
graphene branch untrack <branch>

# Squash all commits on current branch
graphene branch squash [-m <message>]

# Merge current branch into branch below it
graphene branch fold

# Continue a fold operation after resolving conflicts
graphene branch continue
````

## Stack Commands

```bash
# Rename the current stack
graphene stack rename <name>

# Move up in the current stack
graphene stack up

# Move down in the current stack
graphene stack down

# Rebase the current stack onto its base branch
graphene stack restack

# Delete one or more stacks
graphene stack delete
graphene stack rm
```

## Technologies

- SQLite for local database
- Commander.js for CLI interface
- Inquirer.js for interactive prompts
- Chalk for colored output

## Commands

- `info` - Display information about Graphene CLI
- `init` - Initialize the current directory as a Graphene repository
- `login` - Authenticate with GitHub
- `create <name>` - Create a new branch in a stack
- `list` - List all branches grouped by stack
- `checkout` - Interactively checkout a branch
- `search` - Search and checkout remote branches
- `modify` - Add or amend changes to the current branch
- `git [args...]` - Execute Git commands directly
- `continue` - Continue a rebase after resolving conflicts
- `rename <name>` - Rename the current stack

## Development

This project uses:

- Bun as the JavaScript runtime
- SQLite for local database
- Commander.js for CLI interface
- Inquirer.js for interactive prompts
- Chalk for colored output

## Project Structure

```
graphene/
├── apps/
│   └── cli/          # CLI application
└── packages/
    ├── core/         # Core business logic
    └── database/     # Database operations
```

## Contributing

Contributions are welcome! This is an open-source project aimed at making Git branch management easier and more efficient.

## License

MIT

---

Built with [Bun](https://bun.sh) v1.2.1
