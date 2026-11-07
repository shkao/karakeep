CREATE TABLE `bookmarkVideoArticles` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`title` text,
	`content` text,
	`caption` text,
	`transcript` text,
	`error` text,
	`createdAt` integer NOT NULL,
	`modifiedAt` integer,
	FOREIGN KEY (`id`) REFERENCES `bookmarks`(`id`) ON UPDATE no action ON DELETE cascade
);
