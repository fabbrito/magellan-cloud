CREATE TABLE `layouts` (
	`device_id` text NOT NULL,
	`name` text NOT NULL,
	`body` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`device_id`, `name`)
);
--> statement-breakpoint
-- Hand-written: SQLite adds no NOT NULL column to a table with rows, so it is rebuilt. Each reading
-- takes its device's latest manifest; when this ran, every device had declared exactly one, so
-- latest is the one each was read under. A device with none fails the insert, and the migration.
CREATE TABLE `__new_readings` (
	`device_id` text NOT NULL,
	`source` text NOT NULL,
	`ts` integer NOT NULL,
	`manifest_hash` text NOT NULL,
	`values` text NOT NULL,
	PRIMARY KEY(`device_id`, `source`, `ts`)
);
--> statement-breakpoint
INSERT INTO `__new_readings` (`device_id`, `source`, `ts`, `manifest_hash`, `values`)
SELECT `r`.`device_id`, `r`.`source`, `r`.`ts`, (
	SELECT `m`.`hash` FROM `manifests` `m`
	WHERE `m`.`device_id` = `r`.`device_id`
	ORDER BY `m`.`declared_at` DESC LIMIT 1
), `r`.`values`
FROM `readings` `r`;
--> statement-breakpoint
DROP TABLE `readings`;
--> statement-breakpoint
ALTER TABLE `__new_readings` RENAME TO `readings`;
--> statement-breakpoint
CREATE INDEX `heartbeats_device_id_received_at` ON `heartbeats` (`device_id`,`received_at`);