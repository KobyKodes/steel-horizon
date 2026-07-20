CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"username_lower" text NOT NULL,
	"password_hash" text NOT NULL,
	"password_salt" text NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_lower_unique" UNIQUE("username_lower")
);
--> statement-breakpoint
CREATE TABLE "auth_tokens" (
	"token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_tokens_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX "auth_tokens_user_id_idx" ON "auth_tokens" ("user_id");
--> statement-breakpoint
CREATE TABLE "games" (
	"id" text PRIMARY KEY NOT NULL,
	"mode" text NOT NULL,
	"started_at" timestamp(3) with time zone NOT NULL,
	"finished_at" timestamp(3) with time zone NOT NULL,
	"winner_user_id" text,
	"winner_is_bot" boolean DEFAULT false NOT NULL,
	CONSTRAINT "games_winner_user_id_fk" FOREIGN KEY ("winner_user_id") REFERENCES "users"("id") ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE "game_results" (
	"id" text PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"user_id" text NOT NULL,
	"score" integer NOT NULL,
	"won" boolean NOT NULL,
	"hits" integer NOT NULL,
	"misses" integer NOT NULL,
	"accuracy" integer NOT NULL,
	"ships_sunk" integer NOT NULL,
	"ships_lost" integer NOT NULL,
	"max_multiplier" real NOT NULL,
	"medals_earned" integer NOT NULL,
	"created_at" timestamp(3) with time zone NOT NULL,
	CONSTRAINT "game_results_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "game_results_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX "game_results_user_id_idx" ON "game_results" ("user_id");
--> statement-breakpoint
CREATE INDEX "game_results_created_at_idx" ON "game_results" ("created_at");
--> statement-breakpoint
CREATE TABLE "legacy_highscores" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"score" integer NOT NULL,
	"accuracy" integer NOT NULL,
	"max_multiplier" real NOT NULL,
	"ships_sunk" integer NOT NULL,
	"created_at" timestamp(3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "legacy_highscores_score_idx" ON "legacy_highscores" ("score");
--> statement-breakpoint
CREATE TABLE "player_stats" (
	"user_id" text PRIMARY KEY NOT NULL,
	"games_played" integer DEFAULT 0 NOT NULL,
	"games_won" integer DEFAULT 0 NOT NULL,
	"total_points" integer DEFAULT 0 NOT NULL,
	"best_score" integer DEFAULT 0 NOT NULL,
	"total_hits" integer DEFAULT 0 NOT NULL,
	"total_misses" integer DEFAULT 0 NOT NULL,
	"total_ships_sunk" integer DEFAULT 0 NOT NULL,
	"current_win_streak" integer DEFAULT 0 NOT NULL,
	"best_win_streak" integer DEFAULT 0 NOT NULL,
	"bot_easy_played" integer DEFAULT 0 NOT NULL,
	"bot_easy_won" integer DEFAULT 0 NOT NULL,
	"bot_medium_played" integer DEFAULT 0 NOT NULL,
	"bot_medium_won" integer DEFAULT 0 NOT NULL,
	"bot_hard_played" integer DEFAULT 0 NOT NULL,
	"bot_hard_won" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_stats_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON UPDATE no action ON DELETE cascade
);
