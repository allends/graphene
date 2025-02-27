import { relations, sql } from "drizzle-orm";
import {
  integer,
  primaryKey,
  sqliteTable,
  text,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";
import { foreignKey } from "drizzle-orm/sqlite-core";

export const repositories = sqliteTable("repositories", {
  name: text("name").primaryKey(),
  base_branches: text("base_branches").notNull(),
  created_at: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$default(() => new Date()),
});

export const stacks = sqliteTable("stacks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  repository_name: text("repository_name")
    .notNull()
    .references(() => repositories.name, { onDelete: "cascade" }),
  base_branch: text("base_branch").notNull(),
  created_at: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$default(() => new Date()),
  updated_at: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$default(() => new Date()),
});

export const branches = sqliteTable("branches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  stack_id: integer("stack_id")
    .notNull()
    .references(() => stacks.id, { onDelete: "cascade" }),
  parent_id: integer("parent_id").references(
    (): AnySQLiteColumn => branches.id,
  ),
  position: integer("position").notNull(),
  status: text("status").notNull().default("active"),
  created_at: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$default(() => new Date()),
  updated_at: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$default(() => new Date()),
});

// Relations
export const stacksRelations = relations(stacks, ({ many }) => ({
  branches: many(branches),
}));

export const branchesRelations = relations(branches, ({ one, many }) => ({
  stack: one(stacks, {
    fields: [branches.stack_id],
    references: [stacks.id],
  }),
  parent: one(branches, {
    fields: [branches.parent_id],
    references: [branches.id],
  }),
}));
