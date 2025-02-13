CREATE TABLE `repositories` (
	`name` text PRIMARY KEY NOT NULL,
	`path` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `repositories_path_unique` ON `repositories` (`path`);--> statement-breakpoint
ALTER TABLE `stacks` ADD `repository_name` text NOT NULL REFERENCES repositories(name);