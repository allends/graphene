# @allends/graphene-core

Core business logic for the Graphene CLI, handling Git operations, branch management, and stack coordination.

## Features

- Git operations wrapper
- Branch management
- Stack coordination
- GitHub integration
- Authentication services

## Services

- `GitService` - Handles all Git operations
- `BranchService` - Manages branch operations and relationships
- `StackService` - Coordinates branch stacks and their relationships
- `PullRequestService` - Handles GitHub PR creation and management
- `AuthenticationService` - Manages GitHub authentication

## Usage

```typescript
import {
  GitService,
  BranchService,
  StackService,
} from "@allends/graphene-core";

// Get service instances
const git = GitService.getInstance();
const branches = BranchService.getInstance();
const stacks = StackService.getInstance();

// Use services
await git.createBranch("feature/123");
await branches.listBranches();
await stacks.createBranchInStack("feature/124");
```

## Development

Built with:

- TypeScript
- Drizzle ORM
- Octokit
