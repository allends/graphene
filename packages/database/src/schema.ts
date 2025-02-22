import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { foreignKey } from "drizzle-orm/sqlite-core";

export const stacks = sqliteTable("stacks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  repository_name: text("repository_name").notNull(),
  name: text("name").notNull(),
  base_branch: text("base_branch").notNull(), // e.g., 'main', 'develop'
  description: text("description"),
  created_at: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$default(() => new Date()),
  updated_at: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$default(() => new Date()),
});

export const branches = sqliteTable(
  "branches",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    stack_id: integer("stack_id"),
    parent_branch_id: integer("parent_branch_id"),
    position: integer("position").notNull(), // Order in the stack
    status: text("status").notNull().$type<"active" | "merged" | "abandoned">(), // Branch status
    latest_commit: text("latest_commit"), // SHA of latest commit
    created_at: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$default(() => new Date()),
    updated_at: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$default(() => new Date()),
  },
  (table) => ({
    stackReference: foreignKey({
      columns: [table.stack_id],
      foreignColumns: [stacks.id],
    }),
    parentReference: foreignKey({
      columns: [table.parent_branch_id],
      foreignColumns: [table.id],
    }),
  }),
);

export const commits = sqliteTable(
  "commits",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sha: text("sha").notNull(),
    branch_id: integer("branch_id"),
    message: text("message").notNull(),
    author: text("author").notNull(),
    created_at: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$default(() => new Date()),
  },
  (table) => ({
    branchReference: foreignKey({
      columns: [table.branch_id],
      foreignColumns: [branches.id],
    }),
  }),
);
