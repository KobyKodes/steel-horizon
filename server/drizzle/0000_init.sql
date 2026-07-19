CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`username_lower` text NOT NULL,
	`password_hash` text NOT NULL,
	`password_salt` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`last_seen_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_lower_unique` ON `users` (`username_lower`);
--> statement-breakpoint
CREATE TABLE `auth_tokens` (
	`token` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`last_used_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `auth_tokens_user_id_idx` ON `auth_tokens` (`user_id`);
--> statement-breakpoint
CREATE TABLE `games` (
	`id` text PRIMARY KEY NOT NULL,
	`mode` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer NOT NULL,
	`winner_user_id` text,
	`winner_is_bot` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`winner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `game_results` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`user_id` text NOT NULL,
	`score` integer NOT NULL,
	`won` integer NOT NULL,
	`hits` integer NOT NULL,
	`misses` integer NOT NULL,
	`accuracy` integer NOT NULL,
	`ships_sunk` integer NOT NULL,
	`ships_lost` integer NOT NULL,
	`max_multiplier` real NOT NULL,
	`medals_earned` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `game_results_user_id_idx` ON `game_results` (`user_id`);
--> statement-breakpoint
CREATE INDEX `game_results_created_at_idx` ON `game_results` (`created_at`);
--> statement-breakpoint
CREATE TABLE `legacy_highscores` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`score` integer NOT NULL,
	`accuracy` integer NOT NULL,
	`max_multiplier` real NOT NULL,
	`ships_sunk` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `legacy_highscores_score_idx` ON `legacy_highscores` (`score`);
--> statement-breakpoint
CREATE TABLE `player_stats` (
	`user_id` text PRIMARY KEY NOT NULL,
	`games_played` integer DEFAULT 0 NOT NULL,
	`games_won` integer DEFAULT 0 NOT NULL,
	`total_points` integer DEFAULT 0 NOT NULL,
	`best_score` integer DEFAULT 0 NOT NULL,
	`total_hits` integer DEFAULT 0 NOT NULL,
	`total_misses` integer DEFAULT 0 NOT NULL,
	`total_ships_sunk` integer DEFAULT 0 NOT NULL,
	`current_win_streak` integer DEFAULT 0 NOT NULL,
	`best_win_streak` integer DEFAULT 0 NOT NULL,
	`bot_easy_played` integer DEFAULT 0 NOT NULL,
	`bot_easy_won` integer DEFAULT 0 NOT NULL,
	`bot_medium_played` integer DEFAULT 0 NOT NULL,
	`bot_medium_won` integer DEFAULT 0 NOT NULL,
	`bot_hard_played` integer DEFAULT 0 NOT NULL,
	`bot_hard_won` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
