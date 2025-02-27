PRAGMA foreign_keys = OFF;

--> statement-breakpoint
CREATE TABLE
	`__new_branches` (
		`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
		`name` text NOT NULL,
		`stack_id` integer NOT NULL,
		`parent_id` integer,
		`position` integer NOT NULL,
		`status` text DEFAULT 'active' NOT NULL,
		`created_at` integer NOT NULL,
		`updated_at` integer NOT NULL,
		FOREIGN KEY (`stack_id`) REFERENCES `stacks` (`id`) ON UPDATE no action ON DELETE cascade,
		FOREIGN KEY (`parent_id`) REFERENCES `branches` (`id`) ON UPDATE no action ON DELETE no action
	);

--> statement-breakpoint
INSERT INTO
	`__new_branches` (
		"id",
		"name",
		"stack_id",
		"parent_id",
		"position",
		"status",
		"created_at",
		"updated_at"
	)
SELECT
	"id",
	"name",
	"stack_id",
	"parent_branch_id",
	"position",
	"status",
	"created_at",
	"updated_at"
FROM
	`branches`;

--> statement-breakpoint
DROP TABLE `branches`;

--> statement-breakpoint
ALTER TABLE `__new_branches`
RENAME TO `branches`;

--> statement-breakpoint
PRAGMA foreign_keys = ON;

--> statement-breakpoint
CREATE TABLE
	`__new_commits` (
		`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
		`branch_id` integer NOT NULL,
		`sha` text NOT NULL,
		`message` text NOT NULL,
		`author` text NOT NULL,
		`created_at` integer NOT NULL,
		FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON UPDATE no action ON DELETE cascade
	);

--> statement-breakpoint
INSERT INTO
	`__new_commits` (
		"id",
		"branch_id",
		"sha",
		"message",
		"author",
		"created_at"
	)
SELECT
	"id",
	"branch_id",
	"sha",
	"message",
	"author",
	"created_at"
FROM
	`commits`;

--> statement-breakpoint
DROP TABLE `commits`;

--> statement-breakpoint
ALTER TABLE `__new_commits`
RENAME TO `commits`;

--> statement-breakpoint
CREATE TABLE
	`__new_repositories` (
		`name` text PRIMARY KEY NOT NULL,
		`base_branches` text DEFAULT '["main", "master"]',
		`created_at` integer NOT NULL
	);

--> statement-breakpoint
INSERT INTO
	`__new_repositories` ("name", "base_branches", "created_at")
SELECT
	"name",
	"base_branches",
	"created_at"
FROM
	`repositories`;

--> statement-breakpoint
DROP TABLE `repositories`;

--> statement-breakpoint
ALTER TABLE `__new_repositories`
RENAME TO `repositories`;

--> statement-breakpoint
CREATE TABLE
	`__new_stacks` (
		`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
		`name` text NOT NULL,
		`repository_name` text NOT NULL,
		`base_branch` text NOT NULL,
		`created_at` integer NOT NULL,
		`updated_at` integer NOT NULL,
		FOREIGN KEY (`repository_name`) REFERENCES `repositories` (`name`) ON UPDATE no action ON DELETE cascade
	);

--> statement-breakpoint
INSERT INTO
	`__new_stacks` (
		"id",
		"name",
		"repository_name",
		"base_branch",
		"created_at",
		"updated_at"
	)
SELECT
	"id",
	"name",
	"repository_name",
	"base_branch",
	"created_at",
	"updated_at"
FROM
	`stacks`;

--> statement-breakpoint
DROP TABLE `stacks`;

--> statement-breakpoint
ALTER TABLE `__new_stacks`
RENAME TO `stacks`;