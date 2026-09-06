import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const proposals = mysqlTable("proposals", {
  id: int("id").autoincrement().primaryKey(),
  customerName: varchar("customerName", { length: 160 }).notNull(),
  customerEmail: varchar("customerEmail", { length: 320 }),
  customerPhone: varchar("customerPhone", { length: 40 }),
  projectAddress: varchar("projectAddress", { length: 320 }).notNull(),
  projectType: varchar("projectType", { length: 160 }).notNull(),
  desiredStartDate: varchar("desiredStartDate", { length: 80 }),
  budgetRange: varchar("budgetRange", { length: 80 }),
  siteNotes: text("siteNotes").notNull(),
  status: mysqlEnum("status", ["draft", "approved"]).default("draft").notNull(),
  projectSummary: text("projectSummary").notNull(),
  lineItemsJson: text("lineItemsJson").notNull(),
  assumptionsJson: text("assumptionsJson").notNull(),
  exclusionsJson: text("exclusionsJson").notNull(),
  unansweredQuestionsJson: text("unansweredQuestionsJson").notNull(),
  riskFlagsJson: text("riskFlagsJson").notNull(),
  customerMessage: text("customerMessage").notNull(),
  totalCents: int("totalCents").notNull(),
  aiModel: varchar("aiModel", { length: 80 }).notNull(),
  promptTokens: int("promptTokens"),
  completionTokens: int("completionTokens"),
  version: int("version").default(1).notNull(),
  approvedAt: timestamp("approvedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const integrationEvents = mysqlTable("integration_events", {
  id: int("id").autoincrement().primaryKey(),
  proposalId: int("proposalId").notNull(),
  destination: varchar("destination", { length: 255 }).notNull(),
  status: mysqlEnum("status", ["sent", "failed"]).notNull(),
  httpStatus: int("httpStatus"),
  responseSnippet: text("responseSnippet"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type ProposalRow = typeof proposals.$inferSelect;
export type InsertProposal = typeof proposals.$inferInsert;
export type IntegrationEventRow = typeof integrationEvents.$inferSelect;
