import { describe, expect, it } from "vite-plus/test";
import type { Proposal, ProposalLineItem } from "../shared/types";
import {
  calculateTotal,
  evaluateGuardrails,
  webhookPayload,
} from "./proposal-service";

const lines: ProposalLineItem[] = [
  {
    category: "Hardscape",
    description: "Premium paver patio",
    quantity: 500,
    unit: "sq ft",
    unitPriceCents: 2500,
    sourceNote: "500 sq ft patio",
  },
  {
    category: "Shade",
    description: "Pergola",
    quantity: 160,
    unit: "sq ft",
    unitPriceCents: 11000,
    sourceNote: "10 x 16 pergola",
  },
];

describe("proposal calculations", () => {
  it("calculates totals deterministically in cents", () => {
    expect(calculateTotal(lines)).toBe(3_010_000);
  });

  it("adds a review flag when questions remain without blocking approval", () => {
    const flags = evaluateGuardrails(lines, ["Confirm finish color"]);
    expect(flags).toContainEqual({
      severity: "medium",
      message: "1 open question should be reviewed before approval.",
    });
    expect(flags.some(flag => flag.severity === "high")).toBe(false);
  });

  it("blocks implausibly low project totals", () => {
    const flags = evaluateGuardrails([{ ...lines[0], quantity: 1 }], []);
    expect(flags.some(flag => flag.severity === "high")).toBe(true);
  });

  it("downgrades non-safety model flags so ordinary project dependencies remain reviewable", () => {
    const flags = evaluateGuardrails(
      lines,
      [],
      [
        {
          severity: "high",
          message: "HOA approval is required before construction.",
        },
      ]
    );
    expect(flags).toContainEqual({
      severity: "medium",
      message: "HOA approval is required before construction.",
    });
    expect(flags.some(flag => flag.severity === "high")).toBe(false);
  });
});

describe("integration payload", () => {
  it("ships the approved proposal and excludes raw site notes", () => {
    const proposal = {
      id: 7,
      customerName: "Test Client",
      customerEmail: "client@example.com",
      customerPhone: "555-0100",
      projectAddress: "123 Example Ave, Phoenix, AZ",
      projectType: "Outdoor living",
      siteNotes: "Internal notes that must not be copied to the CRM event",
      status: "approved",
      projectSummary: "A premium outdoor living project.",
      lineItems: lines,
      assumptions: [],
      exclusions: [],
      unansweredQuestions: [],
      riskFlags: [],
      customerMessage:
        "Thanks for inviting us to design your new outdoor living space.",
      totalCents: calculateTotal(lines),
      aiModel: "gpt-5-mini",
      promptTokens: 10,
      completionTokens: 10,
      version: 1,
      approvedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    } satisfies Proposal;
    const payload = webhookPayload(proposal);
    expect(payload.proposal.totalCents).toBe(3_010_000);
    expect(JSON.stringify(payload)).not.toContain("Internal notes");
  });
});
