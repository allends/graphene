# @allends/graphene-database

Database layer for the Graphene CLI, handling persistence of branch stacks and relationships.

## Features

- SQLite database management
- Schema definitions
- Migration support
- Type-safe queries

## Schema

### Stacks

```typescript
export const stacks = sqliteTable("stacks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  repository_name: text("repository_name").notNull(),
  name: text("name").notNull(),
  base_branch: text("base_branch").notNull(),
  description: text("description"),
  created_at: integer("created_at", { mode: "timestamp" }),
  updated_at: integer("updated_at", { mode: "timestamp" }),
});
```

### Branches

```typescript
export const branches = sqliteTable("branches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  stack_id: integer("stack_id"),
  parent_branch_id: integer("parent_branch_id"),
  position: integer("position").notNull(),
  status: text("status").notNull(),
  latest_commit: text("latest_commit"),
  created_at: integer("created_at", { mode: "timestamp" }),
  updated_at: integer("updated_at", { mode: "timestamp" }),
});
```

## Usage

```typescript
import { DatabaseService } from "@allends/graphene-database";

const db = DatabaseService.getInstance();
await db.createStack("my-stack", "repo-name", "main");
```

## Development

Built with:

- Drizzle ORM
- SQLite
- Bun
