# Graphene CLI

An offline, open-source version of the Graphite CLI for Git branch management. Graphene helps you manage complex branch workflows and stacks of changes with ease.

## Overview

Graphene is a command-line tool that helps developers manage their Git branches and pull requests more efficiently. It introduces the concept of "stacks" - groups of related branches that build upon each other, making it easier to work on and manage complex feature development.

## Features

✅ = Completed | 🚧 = In Progress | ⏳ = Planned

- ✅ Interactive branch checkout (`graphene checkout` or `graphene co`)
- ✅ Creating branches based off of other branches (`graphene branch <name>`)
- ✅ Listing branches with stack grouping (`graphene branches`)
- ✅ Local Git repository initialization (`graphene init`)
- ✅ GitHub authentication (`graphene auth`)
- ✅ Branch modification with auto-add (`graphene modify` or `graphene m`)
- ✅ Stack creation and management
- ✅ Branch position tracking in stacks
- ✅ Commit tracking per branch
- 🚧 Rebasing branches when there is a change on an upstream branch
- 🚧 Pushing branches to GitHub
- 🚧 Creating pull requests
- ⏳ Pulling branches from GitHub
- ⏳ Stack visualization
- ⏳ Interactive rebase management
- ⏳ Conflict resolution assistance

## Installation

```bash
# Install dependencies
bun install

# Link the CLI globally (optional)
bun link
```

## Usage

```bash
# Show help and available commands
graphene --help

# Initialize a new repository
`graphene init`

Creates a new repository in the current directory, adds all files to the staging area, and commits them.

# Create a new branch in a stack
`graphene create <name>`
# or
`graphene c <name>`

Commits all changes and creates a new branch in the current stack. If no stack is found, it will create a new stack.

# List all branches grouped by stack
`graphene list`
# or
`graphene ls`

Lists all branches grouped by stack. Only your stacks (local) are shown.

# Interactively checkout branches
`graphene checkout`
# or
`graphene co`

Interactively lists all branches and allows you to checkout a branch. Use jk and arrow keys to navigate.

TODO: press "f" to open up an input to filter through branches.

# Modify the current branch in a stack
`graphene modify [-a]`
# or
`graphene m [-a]`

Adds a new commit to the current branch. If `-a` is provided, it will amend the last commit.

# Execute Git commands directly
`graphene git <args...>`

# Search remote branches
graphene search
# or
graphene s

Type your search query and use arrow keys to select from matching branches.

# After resolving rebase conflicts
graphene continue

# The command will either:
# - Continue the rebase if all conflicts are resolved
# - Show remaining conflicts if any exist
```

## Commands

- `info` - Display information about Graphene CLI
- `init` - Initialize a new Git repository
- `auth` - Authenticate with GitHub
- `create <name>` - Create a new branch in a stack
- `list` - List all branches grouped by stack
- `checkout` - Interactively checkout a branch
- `search` - Search and checkout remote branches
- `modify` - Add or amend changes to the current branch
- `git [args...]` - Execute Git commands directly
- `continue` - Continue a rebase after resolving conflicts

## Development

This project uses:

- Bun as the JavaScript runtime
- SQLite for local database
- Commander.js for CLI interface
- Octokit for GitHub API integration
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
