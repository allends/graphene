DROP TABLE `repositories`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_stacks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`repository_name` text NOT NULL,
	`name` text NOT NULL,
	`base_branch` text NOT NULL,
	`description` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_stacks`("id", "repository_name", "name", "base_branch", "description", "created_at", "updated_at") SELECT "id", "repository_name", "name", "base_branch", "description", "created_at", "updated_at" FROM `stacks`;--> statement-breakpoint
DROP TABLE `stacks`;--> statement-breakpoint
ALTER TABLE `__new_stacks` RENAME TO `stacks`;--> statement-breakpoint
PRAGMA foreign_keys=ON;