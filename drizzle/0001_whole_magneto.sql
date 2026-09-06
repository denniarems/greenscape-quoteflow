CREATE TABLE `integration_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`proposalId` int NOT NULL,
	`destination` varchar(255) NOT NULL,
	`status` enum('sent','failed') NOT NULL,
	`httpStatus` int,
	`responseSnippet` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `integration_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `proposals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customerName` varchar(160) NOT NULL,
	`customerEmail` varchar(320),
	`customerPhone` varchar(40),
	`projectAddress` varchar(320) NOT NULL,
	`projectType` varchar(160) NOT NULL,
	`desiredStartDate` varchar(80),
	`budgetRange` varchar(80),
	`siteNotes` text NOT NULL,
	`status` enum('draft','approved') NOT NULL DEFAULT 'draft',
	`projectSummary` text NOT NULL,
	`lineItemsJson` text NOT NULL,
	`assumptionsJson` text NOT NULL,
	`exclusionsJson` text NOT NULL,
	`unansweredQuestionsJson` text NOT NULL,
	`riskFlagsJson` text NOT NULL,
	`customerMessage` text NOT NULL,
	`totalCents` int NOT NULL,
	`aiModel` varchar(80) NOT NULL,
	`promptTokens` int,
	`completionTokens` int,
	`version` int NOT NULL DEFAULT 1,
	`approvedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `proposals_id` PRIMARY KEY(`id`)
);
