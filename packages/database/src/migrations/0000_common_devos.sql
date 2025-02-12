CREATE TABLE `branches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`stack_id` integer,
	`parent_branch_id` integer,
	`position` integer NOT NULL,
	`status` text NOT NULL,
	`latest_commit` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`stack_id`) REFERENCES `stacks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`parent_branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `commits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sha` text NOT NULL,
	`branch_id` integer,
	`message` text NOT NULL,
	`author` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `stacks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`base_branch` text NOT NULL,
	`description` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
