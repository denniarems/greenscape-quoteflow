import { describe, expect, it } from "vite-plus/test";
import type { Proposal, ProposalLineItem } from "../shared/types";
import {
  calculateTotal,
  editableSchema,
  evaluateGuardrails,
  parseGeneratedProposal,
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

describe("model response validation resilience", () => {
  it("successfully parses model responses where customerMessage has fewer than 60 characters", () => {
    const rawProposal = {
      projectSummary: "A complete backyard transformation with pavers and turf.",
      lineItems: lines,
      assumptions: ["Standard soil compaction"],
      exclusions: ["Permit fees"],
      unansweredQuestions: [],
      riskFlags: [],
      customerMessage:
        "Thank you for considering Greenscape Pro for your project!", // 58 characters - previously caused 500 error
    };

    const parsed = parseGeneratedProposal(rawProposal);
    expect(parsed.customerMessage).toBe(
      "Thank you for considering Greenscape Pro for your project!"
    );
    expect(parsed.lineItems).toHaveLength(2);
  });

  it("provides fallback customerMessage when empty or nullish", () => {
    const rawProposal = {
      projectSummary: "Modern front yard redesign.",
      lineItems: lines,
      assumptions: [],
      exclusions: [],
      unansweredQuestions: [],
      riskFlags: [],
      customerMessage: "   ",
    };

    const parsed = parseGeneratedProposal(rawProposal);
    expect(parsed.customerMessage).toContain("Thank you for the opportunity");
  });

  it("provides fallback sourceNote when line item sourceNote is missing or blank", () => {
    const rawProposal = {
      projectSummary: "Outdoor patio installation.",
      lineItems: [
        {
          category: "Hardscape",
          description: "Paver patio",
          quantity: 400,
          unit: "sq ft",
          unitPriceCents: 2600,
          sourceNote: "",
        },
      ],
      assumptions: [],
      exclusions: [],
      unansweredQuestions: [],
      riskFlags: [],
      customerMessage: "Looking forward to working with you.",
    };

    const parsed = parseGeneratedProposal(rawProposal);
    expect(parsed.lineItems[0].sourceNote).toBe("Site walk scope note");
  });

  it("allows user to save draft with short or custom customerMessage in editableSchema", () => {
    const userEdits = {
      projectSummary: "Updated summary",
      lineItems: lines,
      assumptions: [],
      exclusions: [],
      unansweredQuestions: [],
      riskFlags: [],
      customerMessage: "Short note",
    };

    const parsed = editableSchema.parse(userEdits);
    expect(parsed.customerMessage).toBe("Short note");
  });

  it("handles markdown code fences and preamble text in parseGeneratedProposal", () => {
    const fenced = `User: Here is your proposal response:\n\`\`\`json\n{\n  "projectSummary": "Fenced backyard overhaul",\n  "lineItems": [\n    {\n      "category": "Hardscape",\n      "description": "Paver walkway",\n      "quantity": 100,\n      "unit": "sq ft",\n      "unitPriceCents": 3000,\n      "sourceNote": "100 sq ft"\n    }\n  ],\n  "assumptions": [],\n  "exclusions": [],\n  "unansweredQuestions": [],\n  "riskFlags": [],\n  "customerMessage": "Thank you for reaching out to us!"\n}\n\`\`\`\nHope this looks good!`;

    const parsed = parseGeneratedProposal(fenced);
    expect(parsed.projectSummary).toBe("Fenced backyard overhaul");
    expect(parsed.customerMessage).toBe("Thank you for reaching out to us!");
  });

  it("normalizes snake_case keys and dollar pricing from open-source models", () => {
    const snakeCase = {
      project_summary: "Front yard xeriscape design",
      line_items: [
        {
          category: "Planting",
          description: "Agave and cactus grouping",
          qty: 8,
          unit: "ea",
          unit_price: 150,
          source_note: "Specimen cactus",
        },
      ],
      assumptions: ["Standard desert soil"],
      exclusions: [],
      open_questions: ["HOA plant list"],
      risks: ["Hard caliche soil"],
      customer_message: "We look forward to creating your desert retreat.",
    };

    const parsed = parseGeneratedProposal(snakeCase);
    expect(parsed.lineItems[0].unitPriceCents).toBe(15000);
    expect(parsed.lineItems[0].quantity).toBe(8);
    expect(parsed.riskFlags[0].message).toBe("Hard caliche soil");
    expect(parsed.unansweredQuestions[0]).toBe("HOA plant list");
    expect(parsed.customerMessage).toBe(
      "We look forward to creating your desert retreat."
    );
  });
});
