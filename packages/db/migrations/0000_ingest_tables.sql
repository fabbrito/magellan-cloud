CREATE TABLE `devices` (
	`id` text PRIMARY KEY NOT NULL,
	`description` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `devices_token_hash_unique` ON `devices` (`token_hash`);--> statement-breakpoint
CREATE TABLE `heartbeats` (
	`device_id` text NOT NULL,
	`boot_id` text NOT NULL,
	`seq` text NOT NULL,
	`manifest_hash` text NOT NULL,
	`uptime_seconds` integer NOT NULL,
	`buffer_depth` integer NOT NULL,
	`battery_percent` integer,
	`signal_percent` integer,
	`firmware_version` text,
	`received_at` integer NOT NULL,
	PRIMARY KEY(`device_id`, `boot_id`, `seq`)
);
--> statement-breakpoint
CREATE TABLE `manifests` (
	`device_id` text NOT NULL,
	`hash` text NOT NULL,
	`body` text NOT NULL,
	`declared_at` integer NOT NULL,
	PRIMARY KEY(`device_id`, `hash`)
);
--> statement-breakpoint
CREATE TABLE `readings` (
	`device_id` text NOT NULL,
	`source` text NOT NULL,
	`ts` integer NOT NULL,
	`values` text NOT NULL,
	PRIMARY KEY(`device_id`, `source`, `ts`)
);
