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

export function getProposalModel(): string {
  return (
    process.env.OPENROUTER_MODEL ||
    process.env.AI_MODEL ||
    (process.env.BUILT_IN_FORGE_API_URL ? "gpt-5-mini" : "openai/gpt-4o-mini")
  );
}

const DEMO_WEBHOOK_URL = "https://ntfy.sh/greenscape-quoteflow-assessment";

const lineItemSchema = z.object({
  category: z.string().min(1).max(120),
  description: z.string().min(1).max(500),
  quantity: z.number().positive().max(100_000),
  unit: z.string().min(1).max(40),
  unitPriceCents: z.number().int().nonnegative().max(10_000_000),
  sourceNote: z
    .string()
    .nullish()
    .transform(val => (val?.trim() ? val.trim() : "Site walk scope note")),
});

const riskFlagSchema = z.object({
  severity: z.enum(["low", "medium", "high"]),
  message: z.string().min(1).max(500),
});

export const generatedProposalSchema = z.object({
  projectSummary: z
    .string()
    .nullish()
    .transform(val =>
      val?.trim()
        ? val.trim()
        : "Custom landscape and hardscape design and installation proposal."
    ),
  lineItems: z.array(lineItemSchema).min(1).max(50),
  assumptions: z
    .array(z.string())
    .transform(items => items.map(s => s.trim()).filter(Boolean))
    .default([]),
  exclusions: z
    .array(z.string())
    .transform(items => items.map(s => s.trim()).filter(Boolean))
    .default([]),
  unansweredQuestions: z
    .array(z.string())
    .transform(items => items.map(s => s.trim()).filter(Boolean))
    .default([]),
  riskFlags: z.array(riskFlagSchema).default([]),
  customerMessage: z
    .string()
    .nullish()
    .transform(val =>
      val?.trim()
        ? val.trim()
        : "Thank you for the opportunity to quote your landscape project. Please review our detailed estimate and line-item breakdown below."
    ),
});

const generatedSchema = {
  type: "object",
  properties: {
    projectSummary: {
      type: "string",
      description: "Comprehensive summary of the project scope and site design.",
    },
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
        required: [
          "category",
          "description",
          "quantity",
          "unit",
          "unitPriceCents",
          "sourceNote",
        ],
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
    customerMessage: {
      type: "string",
      description:
        "A warm, professional 2-4 sentence customer-facing cover note introducing the proposal and next steps.",
    },
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

export const editableSchema = z.object({
  projectSummary: z.string().min(1).max(4000),
  lineItems: z.array(lineItemSchema).min(1).max(50),
  assumptions: z.array(z.string().max(500)).max(50),
  exclusions: z.array(z.string().max(500)).max(50),
  unansweredQuestions: z.array(z.string().max(500)).max(50),
  riskFlags: z.array(riskFlagSchema).max(50),
  customerMessage: z.string().max(4000),
});

export function calculateTotal(lineItems: ProposalLineItem[]) {
  return lineItems.reduce(
    (sum, item) => sum + Math.round(item.quantity * item.unitPriceCents),
    0
  );
}

export function evaluateGuardrails(
  lineItems: ProposalLineItem[],
  unansweredQuestions: string[],
  modelFlags: RiskFlag[] = []
): RiskFlag[] {
  const flags: RiskFlag[] = modelFlags.map(flag => {
    const warrantsBlock =
      /(safety|hazard|structural failure|gas line|electrical hazard|contradict)/i.test(
        flag.message
      );
    return flag.severity === "high" && !warrantsBlock
      ? { ...flag, severity: "medium" as const }
      : flag;
  });
  const total = calculateTotal(lineItems);
  if (lineItems.length === 0)
    flags.push({
      severity: "high",
      message: "No billable scope items were generated.",
    });
  if (total < 800_000)
    flags.push({
      severity: "high",
      message:
        "Draft total is below Greenscape Pro's typical $8,000 project floor.",
    });
  if (total > 12_000_000)
    flags.push({
      severity: "medium",
      message:
        "Draft total exceeds the historical $120,000 project range; verify pricing.",
    });
  if (unansweredQuestions.length > 0)
    flags.push({
      severity: "medium",
      message: `${unansweredQuestions.length} open question${unansweredQuestions.length === 1 ? "" : "s"} should be reviewed before approval.`,
    });
  lineItems.forEach((item, index) => {
    if (
      !Number.isFinite(item.quantity) ||
      !Number.isInteger(item.unitPriceCents)
    ) {
      flags.push({
        severity: "high",
        message: `Line ${index + 1} contains invalid numeric pricing data.`,
      });
    }
  });
  const deduped = new Map(
    flags.map(flag => [`${flag.severity}:${flag.message}`, flag])
  );
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

async function requestStructuredProposal(
  input: z.infer<typeof proposalInputSchema>
) {
  const system = `You are the proposal operations copilot for Greenscape Pro, a premium Phoenix landscape and hardscape design-build firm. Convert site-walk notes into a precise proposal draft. Never claim a permit, HOA approval, engineering result, or measurement that is not in the notes. Use realistic Phoenix premium-contractor allowances when exact catalog pricing is unavailable and disclose each allowance in assumptions. Use high severity only for a genuine safety, legal, or internally contradictory issue; ordinary missing details belong in unansweredQuestions. Write a warm, professional 2-4 sentence customer-facing cover note in customerMessage. Return only schema-valid JSON with these exact keys: "projectSummary" (string), "lineItems" (array of objects with category, description, quantity, unit, unitPriceCents, sourceNote), "assumptions" (array of strings), "exclusions" (array of strings), "unansweredQuestions" (array of strings), "riskFlags" (array of objects with severity and message), "customerMessage" (string).`;
  const pricingReference = `Representative assessment catalog (replace with the client's 200+ line catalog in production): demolition $4-$9/sq ft; premium pavers installed $22-$32/sq ft; concrete footing allowance $850/each; cedar/alumawood pergola $90-$150/sq ft; artificial turf $14-$20/sq ft; drip irrigation zone $1,400-$2,400; outdoor kitchen base $900-$1,500/linear ft excluding appliances; low-voltage lighting $350-$600/fixture; mobilization/design $1,500-$3,500. Price in integer cents.`;
  const user = `${pricingReference}\n\nCustomer: ${input.customerName}\nAddress: ${input.projectAddress}\nProject type: ${input.projectType}\nDesired start: ${input.desiredStartDate || "Not stated"}\nBudget: ${input.budgetRange || "Not stated"}\n\nSite-walk notes:\n${input.siteNotes}`;
  const model = getProposalModel();
  const request = {
    model,
    messages: [
      { role: "system" as const, content: system },
      { role: "user" as const, content: user },
    ],
    response_format: {
      type: "json_schema" as const,
      json_schema: {
        name: "greenscape_proposal",
        strict: true,
        schema: generatedSchema,
      },
    },
  };

  let raw: any;
  const openRouterApiKey =
    process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;

  if (!process.env.BUILT_IN_FORGE_API_URL && openRouterApiKey) {
    const baseUrl = (
      process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1"
    ).replace(/\/$/, "");
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openRouterApiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.APP_URL || "http://localhost:3000",
        "X-Title": "Greenscape QuoteFlow",
      },
      body: JSON.stringify({
        ...request,
        reasoning: { effort: "minimal" },
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok)
      throw new Error(
        `OpenRouter request failed (${response.status}): ${await response.text()}`
      );
    raw = await response.json();
  } else {
    raw = await invokeLLM({ ...request, reasoning: { effort: "minimal" } });
  }

  const content = raw.choices?.[0]?.message?.content;
  if (typeof content !== "string")
    throw new Error("The model returned no proposal content");
  const draft = parseGeneratedProposal(content);
  return {
    draft,
    promptTokens: raw.usage?.prompt_tokens ?? null,
    completionTokens: raw.usage?.completion_tokens ?? null,
  };
}

export function extractJsonString(raw: string): string {
  let cleaned = raw.trim();
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch) {
    cleaned = codeBlockMatch[1].trim();
  }
  if (!cleaned.startsWith("{") || !cleaned.endsWith("}")) {
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.slice(firstBrace, lastBrace + 1);
    }
  }
  return cleaned;
}

export function normalizeModelPayload(rawJson: any): any {
  if (!rawJson || typeof rawJson !== "object") {
    return rawJson;
  }

  let obj = { ...rawJson };
  if (
    obj.proposal &&
    typeof obj.proposal === "object" &&
    !Array.isArray(obj.proposal)
  ) {
    obj = { ...obj.proposal, ...obj };
  } else if (
    obj.data &&
    typeof obj.data === "object" &&
    !Array.isArray(obj.data)
  ) {
    obj = { ...obj.data, ...obj };
  }

  if (!obj.projectSummary && typeof obj.proposal === "string") {
    obj.projectSummary = obj.proposal;
  }

  const rawLineItems =
    obj.lineItems ?? obj.line_items ?? obj.items ?? obj.scope_items ?? [];
  const lineItems = Array.isArray(rawLineItems) ? rawLineItems : [];

  const normalizedLineItems = lineItems.map((item: any, idx: number) => {
    if (!item || typeof item !== "object") {
      return {
        category: "General",
        description: String(item || `Scope item ${idx + 1}`),
        quantity: 1,
        unit: "ea",
        unitPriceCents: 10000,
        sourceNote: "Site notes",
      };
    }

    const rawCategory = item.category ?? item.type ?? "Landscape";
    const rawDescription =
      item.description ?? item.item ?? item.name ?? `Scope item ${idx + 1}`;
    const rawUnit = item.unit ?? item.unit_of_measure ?? "sq ft";
    const rawQuantity = Number(item.quantity ?? item.qty ?? item.count ?? 1);
    const quantity =
      Number.isFinite(rawQuantity) && rawQuantity > 0 ? rawQuantity : 1;

    let unitPriceCents = 10000;
    if (
      item.unitPriceCents != null &&
      Number.isFinite(Number(item.unitPriceCents))
    ) {
      unitPriceCents = Math.round(Number(item.unitPriceCents));
    } else if (
      item.unit_price_cents != null &&
      Number.isFinite(Number(item.unit_price_cents))
    ) {
      unitPriceCents = Math.round(Number(item.unit_price_cents));
    } else if (
      item.unitPrice != null &&
      Number.isFinite(Number(item.unitPrice))
    ) {
      unitPriceCents = Math.round(Number(item.unitPrice) * 100);
    } else if (
      item.unit_price != null &&
      Number.isFinite(Number(item.unit_price))
    ) {
      unitPriceCents = Math.round(Number(item.unit_price) * 100);
    } else if (item.price != null && Number.isFinite(Number(item.price))) {
      unitPriceCents = Math.round(Number(item.price) * 100);
    }

    const sourceNote =
      String(
        item.sourceNote ?? item.source_note ?? item.note ?? "Site walk scope note"
      ).trim() || "Site walk scope note";

    return {
      category: String(rawCategory).trim() || "General",
      description: String(rawDescription).trim() || `Scope item ${idx + 1}`,
      quantity,
      unit: String(rawUnit).trim() || "ea",
      unitPriceCents: Math.max(0, unitPriceCents),
      sourceNote,
    };
  });

  if (normalizedLineItems.length === 0) {
    normalizedLineItems.push({
      category: "Mobilization",
      description: "Project mobilization and site layout",
      quantity: 1,
      unit: "project",
      unitPriceCents: 200000,
      sourceNote: "Initial site walk mobilization",
    });
  }

  const rawRiskFlags = obj.riskFlags ?? obj.risk_flags ?? obj.risks ?? [];
  const normalizedRiskFlags = (Array.isArray(rawRiskFlags) ? rawRiskFlags : [])
    .map((flag: any) => {
      if (typeof flag === "string") {
        return { severity: "medium", message: flag.trim() };
      }
      if (flag && typeof flag === "object") {
        const sev = String(flag.severity || "medium").toLowerCase();
        const severity = sev === "high" || sev === "low" ? sev : "medium";
        const message = String(
          flag.message || flag.description || flag.note || "General risk flag"
        ).trim();
        return { severity, message: message || "General risk flag" };
      }
      return null;
    })
    .filter(Boolean);

  const rawAssumptions = obj.assumptions ?? [];
  const assumptions = (
    Array.isArray(rawAssumptions) ? rawAssumptions : []
  ).map(String);

  const rawExclusions = obj.exclusions ?? [];
  const exclusions = (
    Array.isArray(rawExclusions) ? rawExclusions : []
  ).map(String);

  const rawQuestions =
    obj.unansweredQuestions ??
    obj.unanswered_questions ??
    obj.openQuestions ??
    obj.open_questions ??
    [];
  const unansweredQuestions = (
    Array.isArray(rawQuestions) ? rawQuestions : []
  ).map(String);

  const projectSummary =
    obj.projectSummary ?? obj.project_summary ?? obj.summary ?? "";
  const customerMessage =
    obj.customerMessage ??
    obj.customer_message ??
    obj.coverNote ??
    obj.cover_note ??
    "";

  return {
    projectSummary,
    lineItems: normalizedLineItems,
    assumptions,
    exclusions,
    unansweredQuestions,
    riskFlags: normalizedRiskFlags,
    customerMessage,
  };
}

export function parseGeneratedProposal(rawContent: string | unknown) {
  let json: unknown;
  if (typeof rawContent === "string") {
    const cleaned = extractJsonString(rawContent);
    try {
      json = JSON.parse(cleaned);
    } catch (err) {
      throw new Error(
        `Failed to parse model JSON: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  } else {
    json = rawContent;
  }
  const normalized = normalizeModelPayload(json);
  const parsed = generatedProposalSchema.safeParse(normalized);
  if (!parsed.success) {
    throw new Error(
      `The model response failed validation: ${parsed.error.message}`
    );
  }
  return parsed.data;
}

export async function generateAndPersistProposal(
  rawInput: z.input<typeof proposalInputSchema>
) {
  const input = proposalInputSchema.parse(rawInput);
  const { draft, promptTokens, completionTokens } =
    await requestStructuredProposal(input);
  const riskFlags = evaluateGuardrails(
    draft.lineItems,
    draft.unansweredQuestions,
    draft.riskFlags
  );
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
    aiModel: getProposalModel(),
    promptTokens,
    completionTokens,
  });
  if (!row) throw new Error("Proposal was generated but could not be loaded");
  return hydrateProposal(row);
}

export async function persistEdits(
  id: number,
  rawEdits: EditableProposalFields
) {
  const edits = editableSchema.parse(rawEdits);
  const current = await getProposalRow(id);
  if (!current)
    throw new TRPCError({ code: "NOT_FOUND", message: "Proposal not found" });
  if (current.status === "approved")
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Approved proposals are immutable; create a new version instead.",
    });
  const reviewerFlags = edits.riskFlags.filter(
    flag =>
      !flag.message.includes("open question") &&
      !flag.message.includes("typical $8,000 project floor") &&
      !flag.message.includes("historical $120,000 project range")
  );
  const riskFlags = evaluateGuardrails(
    edits.lineItems,
    edits.unansweredQuestions,
    reviewerFlags
  );
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
      ? {
          "Content-Type": "text/plain",
          Title: `QuoteFlow approved: ${proposal.customerName}`,
        }
      : {
          "Content-Type": "application/json",
          "X-QuoteFlow-Event": "proposal.approved",
        },
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
  return {
    destination: isDemo ? "assessment notifier" : new URL(endpoint).host,
    status: response.status,
  };
}

export async function approveAndDeliver(id: number) {
  const currentRow = await getProposalRow(id);
  if (!currentRow)
    throw new TRPCError({ code: "NOT_FOUND", message: "Proposal not found" });
  const current = hydrateProposal(currentRow);
  if (current.status === "approved")
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Proposal is already approved",
    });
  const blockers = current.riskFlags.filter(flag => flag.severity === "high");
  if (blockers.length)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `Resolve ${blockers.length} high-severity guardrail before approval.`,
    });

  const approvedRow = await updateProposalRow(id, {
    status: "approved",
    approvedAt: new Date(),
  });
  if (!approvedRow) throw new Error("Approved proposal could not be loaded");
  const approved = hydrateProposal(approvedRow);
  try {
    const delivery = await deliverWebhook(approved);
    return { proposal: approved, delivery };
  } catch (error) {
    if (
      !(error instanceof Error && error.message.startsWith("Webhook returned"))
    ) {
      await createIntegrationEvent({
        proposalId: id,
        destination: "configured webhook",
        status: "failed",
        responseSnippet:
          error instanceof Error
            ? error.message.slice(0, 500)
            : "Unknown delivery error",
      });
    }
    throw new TRPCError({
      code: "BAD_GATEWAY",
      message:
        "Proposal approved, but external delivery failed. The attempt was logged for retry.",
    });
  }
}
