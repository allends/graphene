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
- ⏳ Rebasing branches when there is a change on an upstream branch
- ⏳ Pushing branches to GitHub
- ⏳ Pulling branches from GitHub
- ⏳ Creating pull requests

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
graphene init

# Create a new branch in a stack
graphene branch feature/login

# List all branches grouped by stack
graphene branches

# Interactively checkout branches
graphene checkout
# or
graphene co
```

## Commands

- `info` - Display information about Graphene CLI
- `init` - Initialize a new Git repository
- `branch <name>` - Create a new branch in a stack
- `branches` - List all branches grouped by stack
- `checkout` - Interactively checkout a branch
- `git [args...]` - Execute Git commands directly

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
