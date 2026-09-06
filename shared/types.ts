export type ProposalStatus = "draft" | "approved";
export type Severity = "low" | "medium" | "high";

export type ProposalLineItem = {
  category: string;
  description: string;
  quantity: number;
  unit: string;
  unitPriceCents: number;
  sourceNote: string;
};

export type RiskFlag = {
  severity: Severity;
  message: string;
};

export type Proposal = {
  id: number;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  projectAddress: string;
  projectType: string;
  desiredStartDate: string | null;
  budgetRange: string | null;
  siteNotes: string;
  status: ProposalStatus;
  projectSummary: string;
  lineItems: ProposalLineItem[];
  assumptions: string[];
  exclusions: string[];
  unansweredQuestions: string[];
  riskFlags: RiskFlag[];
  customerMessage: string;
  totalCents: number;
  aiModel: string;
  promptTokens: number | null;
  completionTokens: number | null;
  version: number;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type IntegrationEvent = {
  id: number;
  proposalId: number;
  destination: string;
  status: "sent" | "failed";
  httpStatus: number | null;
  responseSnippet: string | null;
  createdAt: Date;
};

export type DashboardMetrics = {
  totalProposals: number;
  awaitingApproval: number;
  approved: number;
  pipelineValueCents: number;
};

export type EditableProposalFields = {
  projectSummary: string;
  lineItems: ProposalLineItem[];
  assumptions: string[];
  exclusions: string[];
  unansweredQuestions: string[];
  riskFlags: RiskFlag[];
  customerMessage: string;
};
