CREATE TABLE `api_clients` (
	`id` text PRIMARY KEY NOT NULL,
	`description` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_clients_token_hash_unique` ON `api_clients` (`token_hash`);--> statement-breakpoint
ALTER TABLE `devices` ADD `revoked_at` integer;