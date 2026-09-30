CREATE TABLE `receipts` (
	`device_id` text NOT NULL,
	`boot_id` text NOT NULL,
	`seq` text NOT NULL,
	`manifest_hash` text NOT NULL,
	`received_at` integer NOT NULL,
	PRIMARY KEY(`device_id`, `boot_id`, `seq`)
);
--> statement-breakpoint
CREATE INDEX `receipts_device_id_received_at` ON `receipts` (`device_id`,`received_at`);--> statement-breakpoint
-- Hand-written from here: each old row was a batch's receipt and the heartbeat it carried, so it
-- splits in two. The receipt keeps its key. The heartbeat is keyed by arrival, so two batches of
-- one device committed in the same millisecond keep one; no source was heard yet.
INSERT INTO `receipts` (`device_id`, `boot_id`, `seq`, `manifest_hash`, `received_at`)
SELECT `device_id`, `boot_id`, `seq`, `manifest_hash`, `received_at` FROM `heartbeats`;
--> statement-breakpoint
CREATE TABLE `__new_heartbeats` (
	`device_id` text NOT NULL,
	`received_at` integer NOT NULL,
	`boot_id` text NOT NULL,
	`uptime_seconds` integer NOT NULL,
	`buffer_depth` integer NOT NULL,
	`battery_percent` integer,
	`signal_percent` integer,
	`firmware_version` text,
	`sources_last_heard` text NOT NULL,
	PRIMARY KEY(`device_id`, `received_at`)
);
--> statement-breakpoint
INSERT OR IGNORE INTO `__new_heartbeats` (`device_id`, `received_at`, `boot_id`, `uptime_seconds`, `buffer_depth`, `battery_percent`, `signal_percent`, `firmware_version`, `sources_last_heard`)
SELECT `device_id`, `received_at`, `boot_id`, `uptime_seconds`, `buffer_depth`, `battery_percent`, `signal_percent`, `firmware_version`, '{}' FROM `heartbeats`
ORDER BY `device_id`, `received_at`, `boot_id`, `seq`;
--> statement-breakpoint
DROP TABLE `heartbeats`;--> statement-breakpoint
ALTER TABLE `__new_heartbeats` RENAME TO `heartbeats`;
