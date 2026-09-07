import {
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("role", ["user", "admin"]);
export const proposalStatusEnum = pgEnum("proposal_status", [
  "draft",
  "approved",
]);
export const integrationStatusEnum = pgEnum("integration_status", [
  "sent",
  "failed",
]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: userRoleEnum("role").default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const proposals = pgTable("proposals", {
  id: serial("id").primaryKey(),
  customerName: varchar("customerName", { length: 160 }).notNull(),
  customerEmail: varchar("customerEmail", { length: 320 }),
  customerPhone: varchar("customerPhone", { length: 40 }),
  projectAddress: varchar("projectAddress", { length: 320 }).notNull(),
  projectType: varchar("projectType", { length: 160 }).notNull(),
  desiredStartDate: varchar("desiredStartDate", { length: 80 }),
  budgetRange: varchar("budgetRange", { length: 80 }),
  siteNotes: text("siteNotes").notNull(),
  status: proposalStatusEnum("status").default("draft").notNull(),
  projectSummary: text("projectSummary").notNull(),
  lineItemsJson: text("lineItemsJson").notNull(),
  assumptionsJson: text("assumptionsJson").notNull(),
  exclusionsJson: text("exclusionsJson").notNull(),
  unansweredQuestionsJson: text("unansweredQuestionsJson").notNull(),
  riskFlagsJson: text("riskFlagsJson").notNull(),
  customerMessage: text("customerMessage").notNull(),
  totalCents: integer("totalCents").notNull(),
  aiModel: varchar("aiModel", { length: 80 }).notNull(),
  promptTokens: integer("promptTokens"),
  completionTokens: integer("completionTokens"),
  version: integer("version").default(1).notNull(),
  approvedAt: timestamp("approvedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const integrationEvents = pgTable("integration_events", {
  id: serial("id").primaryKey(),
  proposalId: integer("proposalId").notNull(),
  destination: varchar("destination", { length: 255 }).notNull(),
  status: integrationStatusEnum("status").notNull(),
  httpStatus: integer("httpStatus"),
  responseSnippet: text("responseSnippet"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type ProposalRow = typeof proposals.$inferSelect;
export type InsertProposal = typeof proposals.$inferInsert;
export type IntegrationEventRow = typeof integrationEvents.$inferSelect;
