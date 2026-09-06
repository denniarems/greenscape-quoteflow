# QuoteFlow Architecture

## System Flow

```mermaid
flowchart LR
  A[Site-walk notes] --> B[tRPC API]
  B --> C[gpt-5-mini structured generation]
  C --> D[Schema validation]
  D --> E[Deterministic pricing + guardrails]
  E --> F[(MySQL / TiDB)]
  F --> G[Human review and edits]
  G --> H{Approve?}
  H -->|No| G
  H -->|Yes| I[Outbound webhook]
  I --> J[GHL in production / ntfy demo]
  I --> K[(Integration audit log)]
```

## Key Decisions

**Human-in-the-loop by design.** The model drafts scope but cannot send a proposal. Marcus must review and approve. This matches his stated desire to “babysit” rather than build the system and limits hallucination risk.

**Structured AI output with deterministic totals.** The LLM returns typed scope items, assumptions, questions, and risk flags. The server validates the JSON and calculates every line and total from numeric quantity and unit-price fields. The model never supplies the final arithmetic.

**Persistent lifecycle and audit trail.** Proposals and outbound integration attempts are stored in a managed SQL database. Approval state, AI model, version, timestamps, generated content, and delivery response remain reviewable after refresh or redeploy.

**Portable AI integration.** The deployed app uses the platform’s server-side LLM gateway. A direct OpenAI API-key fallback is documented for local clones. `gpt-5-mini` was selected because the task is structured extraction and synthesis rather than open-ended strategy; current model pricing is $0.25 per million input tokens and $2.00 per million output tokens. A representative 4,000-input/1,500-output request costs approximately $0.004 before platform overhead.

**External integration without private client credentials.** Approval posts to a configurable `OUTBOUND_WEBHOOK_URL`, designed for a GHL inbound webhook in production. The public assessment deployment falls back to a redacted ntfy notification topic so reviewers can exercise a real external call without access to the client’s GHL account.

## Production Hardening Beyond the Assessment

A production rollout would add GHL OAuth or a private inbound webhook, import the 200+ item pricing catalog as authoritative data, require authenticated role-based access, add idempotency keys for webhook retries, use a dead-letter queue, export a branded PDF, and compare AI drafts against Marcus-approved proposals to improve prompts and measure acceptance rate.
