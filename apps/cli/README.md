# @allends/graphene-cli

Command-line interface for Graphene, providing Git branch stack management tools.

## Features

- Interactive branch checkout
- Branch stack management
- Remote branch search
- GitHub integration
- Commit management

## Commands

- `graphene list` (alias: `ls`) - List branches by stack
- `graphene checkout` (alias: `co`) - Interactive branch checkout
- `graphene create <name>` (alias: `c`) - Create branch in stack
- `graphene search` (alias: `s`) - Search remote branches
- `graphene modify` (alias: `m`) - Modify current branch
- `graphene auth` - GitHub authentication
- `graphene git <args...>` - Direct Git commands

## Installation

```bash
# Install globally
bun install -g @allends/graphene-cli

# Or link locally
bun link
```

## Development

Built with:

- Commander.js
- Inquirer
- Chalk
- Bun
