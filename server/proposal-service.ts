import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type {
  EditableProposalFields,
  Proposal,
  ProposalLineItem,
  RiskFlag,
} from "../shared/types";
import type { ProposalRow } from "../drizzle/schema";
import {
  createIntegrationEvent,
  createProposalRow,
  getProposalRow,
  updateProposalRow,
} from "./db";
import { invokeLLM } from "./_core/llm";

const MODEL = "gpt-5-mini";
const DEMO_WEBHOOK_URL = "https://ntfy.sh/greenscape-quoteflow-assessment";

const lineItemSchema = z.object({
  category: z.string().min(2).max(80),
  description: z.string().min(4).max(300),
  quantity: z.number().positive().max(100000),
  unit: z.string().min(1).max(40),
  unitPriceCents: z.number().int().positive().max(10_000_000),
  sourceNote: z.string().min(2).max(300),
});

const riskFlagSchema = z.object({
  severity: z.enum(["low", "medium", "high"]),
  message: z.string().min(4).max(300),
});

const generatedProposalSchema = z.object({
  projectSummary: z.string().min(40).max(1800),
  lineItems: z.array(lineItemSchema).min(1).max(20),
  assumptions: z.array(z.string().min(3).max(300)).max(10),
  exclusions: z.array(z.string().min(3).max(300)).max(10),
  unansweredQuestions: z.array(z.string().min(3).max(300)).max(8),
  riskFlags: z.array(riskFlagSchema).max(10),
  customerMessage: z.string().min(60).max(1800),
});

const generatedSchema = {
  type: "object",
  properties: {
    projectSummary: { type: "string" },
    lineItems: {
      type: "array",
      items: {
        type: "object",
        properties: {
          category: { type: "string" },
          description: { type: "string" },
          quantity: { type: "number" },
          unit: { type: "string" },
          unitPriceCents: { type: "integer" },
          sourceNote: { type: "string" },
        },
        required: ["category", "description", "quantity", "unit", "unitPriceCents", "sourceNote"],
        additionalProperties: false,
      },
    },
    assumptions: { type: "array", items: { type: "string" } },
    exclusions: { type: "array", items: { type: "string" } },
    unansweredQuestions: { type: "array", items: { type: "string" } },
    riskFlags: {
      type: "array",
      items: {
        type: "object",
        properties: {
          severity: { type: "string", enum: ["low", "medium", "high"] },
          message: { type: "string" },
        },
        required: ["severity", "message"],
        additionalProperties: false,
      },
    },
    customerMessage: { type: "string" },
  },
  required: [
    "projectSummary",
    "lineItems",
    "assumptions",
    "exclusions",
    "unansweredQuestions",
    "riskFlags",
    "customerMessage",
  ],
  additionalProperties: false,
} as const;

export const proposalInputSchema = z.object({
  customerName: z.string().min(2).max(160),
  customerEmail: z.string().email().optional().or(z.literal("")),
  customerPhone: z.string().max(40).optional(),
  projectAddress: z.string().min(8).max(320),
  projectType: z.string().min(3).max(160),
  desiredStartDate: z.string().max(80).optional(),
  budgetRange: z.string().max(80).optional(),
  siteNotes: z.string().min(80).max(12000),
});

const editableSchema = z.object({
  projectSummary: z.string().min(40).max(1800),
  lineItems: z.array(lineItemSchema).min(1).max(20),
  assumptions: z.array(z.string().min(3).max(300)).max(10),
  exclusions: z.array(z.string().min(3).max(300)).max(10),
  unansweredQuestions: z.array(z.string().min(3).max(300)).max(8),
  riskFlags: z.array(riskFlagSchema).max(10),
  customerMessage: z.string().min(60).max(1800),
});

export function calculateTotal(lineItems: ProposalLineItem[]) {
  return lineItems.reduce(
    (sum, item) => sum + Math.round(item.quantity * item.unitPriceCents),
    0,
  );
}

export function evaluateGuardrails(
  lineItems: ProposalLineItem[],
  unansweredQuestions: string[],
  modelFlags: RiskFlag[] = [],
): RiskFlag[] {
  const flags: RiskFlag[] = modelFlags.map(flag => {
    const warrantsBlock = /(safety|hazard|structural failure|gas line|electrical hazard|contradict)/i.test(flag.message);
    return flag.severity === "high" && !warrantsBlock
      ? { ...flag, severity: "medium" as const }
      : flag;
  });
  const total = calculateTotal(lineItems);
  if (lineItems.length === 0) flags.push({ severity: "high", message: "No billable scope items were generated." });
  if (total < 800_000) flags.push({ severity: "high", message: "Draft total is below Greenscape Pro's typical $8,000 project floor." });
  if (total > 12_000_000) flags.push({ severity: "medium", message: "Draft total exceeds the historical $120,000 project range; verify pricing." });
  if (unansweredQuestions.length > 0) flags.push({ severity: "medium", message: `${unansweredQuestions.length} open question${unansweredQuestions.length === 1 ? "" : "s"} should be reviewed before approval.` });
  lineItems.forEach((item, index) => {
    if (!Number.isFinite(item.quantity) || !Number.isInteger(item.unitPriceCents)) {
      flags.push({ severity: "high", message: `Line ${index + 1} contains invalid numeric pricing data.` });
    }
  });
  const deduped = new Map(flags.map(flag => [`${flag.severity}:${flag.message}`, flag]));
  return Array.from(deduped.values());
}

function safeParseArray<T>(value: string): T[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function hydrateProposal(row: ProposalRow): Proposal {
  return {
    id: row.id,
    customerName: row.customerName,
    customerEmail: row.customerEmail,
    customerPhone: row.customerPhone,
    projectAddress: row.projectAddress,
    projectType: row.projectType,
    desiredStartDate: row.desiredStartDate,
    budgetRange: row.budgetRange,
    siteNotes: row.siteNotes,
    status: row.status,
    projectSummary: row.projectSummary,
    lineItems: safeParseArray<ProposalLineItem>(row.lineItemsJson),
    assumptions: safeParseArray<string>(row.assumptionsJson),
    exclusions: safeParseArray<string>(row.exclusionsJson),
    unansweredQuestions: safeParseArray<string>(row.unansweredQuestionsJson),
    riskFlags: safeParseArray<RiskFlag>(row.riskFlagsJson),
    customerMessage: row.customerMessage,
    totalCents: row.totalCents,
    aiModel: row.aiModel,
    promptTokens: row.promptTokens,
    completionTokens: row.completionTokens,
    version: row.version,
    approvedAt: row.approvedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function requestStructuredProposal(input: z.infer<typeof proposalInputSchema>) {
  const system = `You are the proposal operations copilot for Greenscape Pro, a premium Phoenix landscape and hardscape design-build firm. Convert site-walk notes into a precise proposal draft. Never claim a permit, HOA approval, engineering result, or measurement that is not in the notes. Use realistic Phoenix premium-contractor allowances when exact catalog pricing is unavailable and disclose each allowance in assumptions. Use high severity only for a genuine safety, legal, or internally contradictory issue; ordinary missing details belong in unansweredQuestions. Write concise, warm customer-facing prose. Return only schema-valid JSON.`;
  const pricingReference = `Representative assessment catalog (replace with the client's 200+ line catalog in production): demolition $4-$9/sq ft; premium pavers installed $22-$32/sq ft; concrete footing allowance $850/each; cedar/alumawood pergola $90-$150/sq ft; artificial turf $14-$20/sq ft; drip irrigation zone $1,400-$2,400; outdoor kitchen base $900-$1,500/linear ft excluding appliances; low-voltage lighting $350-$600/fixture; mobilization/design $1,500-$3,500. Price in integer cents.`;
  const user = `${pricingReference}\n\nCustomer: ${input.customerName}\nAddress: ${input.projectAddress}\nProject type: ${input.projectType}\nDesired start: ${input.desiredStartDate || "Not stated"}\nBudget: ${input.budgetRange || "Not stated"}\n\nSite-walk notes:\n${input.siteNotes}`;
  const request = {
    model: MODEL,
    messages: [
      { role: "system" as const, content: system },
      { role: "user" as const, content: user },
    ],
    response_format: {
      type: "json_schema" as const,
      json_schema: { name: "greenscape_proposal", strict: true, schema: generatedSchema },
    },
  };

  let raw: any;
  if (!process.env.BUILT_IN_FORGE_API_URL && process.env.OPENAI_API_KEY) {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(90_000),
    });
    if (!response.ok) throw new Error(`OpenAI request failed (${response.status}): ${await response.text()}`);
    raw = await response.json();
  } else {
    raw = await invokeLLM({ ...request, reasoning: { effort: "minimal" } });
  }

  const content = raw.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("The model returned no proposal content");
  const parsed = generatedProposalSchema.safeParse(JSON.parse(content));
  if (!parsed.success) throw new Error(`The model response failed validation: ${parsed.error.message}`);
  return {
    draft: parsed.data,
    promptTokens: raw.usage?.prompt_tokens ?? null,
    completionTokens: raw.usage?.completion_tokens ?? null,
  };
}

export async function generateAndPersistProposal(rawInput: z.input<typeof proposalInputSchema>) {
  const input = proposalInputSchema.parse(rawInput);
  const { draft, promptTokens, completionTokens } = await requestStructuredProposal(input);
  const riskFlags = evaluateGuardrails(draft.lineItems, draft.unansweredQuestions, draft.riskFlags);
  const row = await createProposalRow({
    ...input,
    customerEmail: input.customerEmail || null,
    customerPhone: input.customerPhone || null,
    desiredStartDate: input.desiredStartDate || null,
    budgetRange: input.budgetRange || null,
    projectSummary: draft.projectSummary,
    lineItemsJson: JSON.stringify(draft.lineItems),
    assumptionsJson: JSON.stringify(draft.assumptions),
    exclusionsJson: JSON.stringify(draft.exclusions),
    unansweredQuestionsJson: JSON.stringify(draft.unansweredQuestions),
    riskFlagsJson: JSON.stringify(riskFlags),
    customerMessage: draft.customerMessage,
    totalCents: calculateTotal(draft.lineItems),
    aiModel: MODEL,
    promptTokens,
    completionTokens,
  });
  if (!row) throw new Error("Proposal was generated but could not be loaded");
  return hydrateProposal(row);
}

export async function persistEdits(id: number, rawEdits: EditableProposalFields) {
  const edits = editableSchema.parse(rawEdits);
  const current = await getProposalRow(id);
  if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Proposal not found" });
  if (current.status === "approved") throw new TRPCError({ code: "BAD_REQUEST", message: "Approved proposals are immutable; create a new version instead." });
  const reviewerFlags = edits.riskFlags.filter(flag =>
    !flag.message.includes("open question") &&
    !flag.message.includes("typical $8,000 project floor") &&
    !flag.message.includes("historical $120,000 project range"),
  );
  const riskFlags = evaluateGuardrails(edits.lineItems, edits.unansweredQuestions, reviewerFlags);
  const row = await updateProposalRow(id, {
    projectSummary: edits.projectSummary,
    lineItemsJson: JSON.stringify(edits.lineItems),
    assumptionsJson: JSON.stringify(edits.assumptions),
    exclusionsJson: JSON.stringify(edits.exclusions),
    unansweredQuestionsJson: JSON.stringify(edits.unansweredQuestions),
    riskFlagsJson: JSON.stringify(riskFlags),
    customerMessage: edits.customerMessage,
    totalCents: calculateTotal(edits.lineItems),
    version: current.version + 1,
  });
  if (!row) throw new Error("Updated proposal could not be loaded");
  return hydrateProposal(row);
}

export function webhookPayload(proposal: Proposal) {
  return {
    event: "proposal.approved",
    occurredAt: new Date().toISOString(),
    source: "greenscape-quoteflow",
    proposal: {
      id: proposal.id,
      customerName: proposal.customerName,
      customerEmail: proposal.customerEmail,
      customerPhone: proposal.customerPhone,
      projectAddress: proposal.projectAddress,
      projectType: proposal.projectType,
      totalCents: proposal.totalCents,
      summary: proposal.projectSummary,
      lineItems: proposal.lineItems,
      customerMessage: proposal.customerMessage,
      version: proposal.version,
    },
  };
}

async function deliverWebhook(proposal: Proposal) {
  const endpoint = process.env.OUTBOUND_WEBHOOK_URL || DEMO_WEBHOOK_URL;
  const isDemo = endpoint.includes("ntfy.sh/");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: isDemo
      ? { "Content-Type": "text/plain", Title: `QuoteFlow approved: ${proposal.customerName}` }
      : { "Content-Type": "application/json", "X-QuoteFlow-Event": "proposal.approved" },
    body: isDemo
      ? `Proposal #${proposal.id} approved for ${proposal.customerName}: $${(proposal.totalCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}. Assessment demo; customer contact details are intentionally omitted.`
      : JSON.stringify(webhookPayload(proposal)),
    signal: AbortSignal.timeout(15_000),
  });
  const responseText = (await response.text()).slice(0, 500);
  await createIntegrationEvent({
    proposalId: proposal.id,
    destination: isDemo ? "ntfy assessment notifier" : new URL(endpoint).host,
    status: response.ok ? "sent" : "failed",
    httpStatus: response.status,
    responseSnippet: responseText,
  });
  if (!response.ok) throw new Error(`Webhook returned ${response.status}`);
  return { destination: isDemo ? "assessment notifier" : new URL(endpoint).host, status: response.status };
}

export async function approveAndDeliver(id: number) {
  const currentRow = await getProposalRow(id);
  if (!currentRow) throw new TRPCError({ code: "NOT_FOUND", message: "Proposal not found" });
  const current = hydrateProposal(currentRow);
  if (current.status === "approved") throw new TRPCError({ code: "BAD_REQUEST", message: "Proposal is already approved" });
  const blockers = current.riskFlags.filter(flag => flag.severity === "high");
  if (blockers.length) throw new TRPCError({ code: "PRECONDITION_FAILED", message: `Resolve ${blockers.length} high-severity guardrail before approval.` });

  const approvedRow = await updateProposalRow(id, { status: "approved", approvedAt: new Date() });
  if (!approvedRow) throw new Error("Approved proposal could not be loaded");
  const approved = hydrateProposal(approvedRow);
  try {
    const delivery = await deliverWebhook(approved);
    return { proposal: approved, delivery };
  } catch (error) {
    if (!(error instanceof Error && error.message.startsWith("Webhook returned"))) {
      await createIntegrationEvent({
        proposalId: id,
        destination: "configured webhook",
        status: "failed",
        responseSnippet: error instanceof Error ? error.message.slice(0, 500) : "Unknown delivery error",
      });
    }
    throw new TRPCError({ code: "BAD_GATEWAY", message: "Proposal approved, but external delivery failed. The attempt was logged for retry." });
  }
}
