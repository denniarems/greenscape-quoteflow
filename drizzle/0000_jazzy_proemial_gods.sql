CREATE TYPE "public"."integration_status" AS ENUM('sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."proposal_status" AS ENUM('draft', 'approved');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "integration_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"proposalId" integer NOT NULL,
	"destination" varchar(255) NOT NULL,
	"status" "integration_status" NOT NULL,
	"httpStatus" integer,
	"responseSnippet" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposals" (
	"id" serial PRIMARY KEY NOT NULL,
	"customerName" varchar(160) NOT NULL,
	"customerEmail" varchar(320),
	"customerPhone" varchar(40),
	"projectAddress" varchar(320) NOT NULL,
	"projectType" varchar(160) NOT NULL,
	"desiredStartDate" varchar(80),
	"budgetRange" varchar(80),
	"siteNotes" text NOT NULL,
	"status" "proposal_status" DEFAULT 'draft' NOT NULL,
	"projectSummary" text NOT NULL,
	"lineItemsJson" text NOT NULL,
	"assumptionsJson" text NOT NULL,
	"exclusionsJson" text NOT NULL,
	"unansweredQuestionsJson" text NOT NULL,
	"riskFlagsJson" text NOT NULL,
	"customerMessage" text NOT NULL,
	"totalCents" integer NOT NULL,
	"aiModel" varchar(80) NOT NULL,
	"promptTokens" integer,
	"completionTokens" integer,
	"version" integer DEFAULT 1 NOT NULL,
	"approvedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"role" "role" DEFAULT 'user' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);
