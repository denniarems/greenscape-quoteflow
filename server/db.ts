import { desc, eq } from "drizzle-orm";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../drizzle/schema";
import {
  InsertProposal,
  InsertUser,
  integrationEvents,
  proposals,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      const sql = neon(process.env.DATABASE_URL);
      _db = drizzle({ client: sql, schema });
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database is not configured");
  return db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await requireDb();
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};

  for (const field of ["name", "email", "loginMethod"] as const) {
    const value = user[field];
    if (value !== undefined) {
      values[field] = value ?? null;
      updateSet[field] = value ?? null;
    }
  }
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db
    .insert(users)
    .values(values)
    .onConflictDoUpdate({
      target: users.openId,
      set: updateSet,
    });
}

export async function getUserByOpenId(openId: string) {
  const db = await requireDb();
  const result = await db
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);
  return result[0];
}

export async function listProposalRows() {
  const db = await requireDb();
  return db.select().from(proposals).orderBy(desc(proposals.updatedAt));
}

export async function getProposalRow(id: number) {
  const db = await requireDb();
  const result = await db
    .select()
    .from(proposals)
    .where(eq(proposals.id, id))
    .limit(1);
  return result[0];
}

export async function createProposalRow(values: InsertProposal) {
  const db = await requireDb();
  const result = await db.insert(proposals).values(values).returning();
  return result[0];
}

export async function updateProposalRow(
  id: number,
  values: Partial<InsertProposal>
) {
  const db = await requireDb();
  const result = await db
    .update(proposals)
    .set(values)
    .where(eq(proposals.id, id))
    .returning();
  return result[0];
}

export async function deleteProposalRow(id: number) {
  const db = await requireDb();
  // integration_events has no FK constraint; remove audit rows first so a
  // deleted proposal leaves no orphans behind.
  await db
    .delete(integrationEvents)
    .where(eq(integrationEvents.proposalId, id));
  const result = await db
    .delete(proposals)
    .where(eq(proposals.id, id))
    .returning();
  return result[0] ?? null;
}

export async function createIntegrationEvent(values: {
  proposalId: number;
  destination: string;
  status: "sent" | "failed";
  httpStatus?: number | null;
  responseSnippet?: string | null;
}) {
  const db = await requireDb();
  await db.insert(integrationEvents).values(values);
}

export async function listIntegrationEvents(proposalId: number) {
  const db = await requireDb();
  return db
    .select()
    .from(integrationEvents)
    .where(eq(integrationEvents.proposalId, proposalId))
    .orderBy(desc(integrationEvents.createdAt));
}
