# QuoteFlow Walkthrough Script

**Target duration:** 4 minutes 30 seconds

## 0:00–0:40 — Strategy

Greenscape Pro does not have a lead-generation problem. It spends twenty-five to thirty thousand dollars monthly on acquisition, Meta return on ad spend is healthy, and Marcus already has more qualified demand than he can quote quickly. The binding constraint is the six-to-nine-day proposal cycle. Thirty-five to forty percent of qualified leads are reportedly lost to faster competitors.

That is why the Quote-to-Win Proposal Copilot ranks first. The next two agents are a closed-lost lead reactivator and a post-sign expeditor. Reactivation has large upside, but adding demand before creating quote capacity would amplify the bottleneck. The post-sign agent could accelerate two hundred twenty-four to three hundred thirty-six thousand dollars of revenue currently waiting on deposits, homeowner associations, permits, and revisions.

## 0:40–2:35 — Product Flow

This is QuoteFlow. The left side shows the persistent proposal queue, pipeline value, and approval status. I will open the new-proposal workflow, which is preloaded with a realistic Phoenix site walk: a paver patio, pergola, landscape refresh, irrigation, and lighting. The notes intentionally include uncertainties such as homeowner association approval, pergola engineering, and limited side access.

When I generate, the server makes a real `gpt-5-mini` call with a strict JSON schema. The model must return structured line items, assumptions, exclusions, open questions, risk flags, and a customer message. The result is validated before it reaches the database. Pricing totals are calculated in code from integer cents; the model never supplies the final arithmetic.

The generated draft is now in the review workspace. Marcus can edit the summary, every quantity and unit price, assumptions, exclusions, open questions, and the customer cover note. The source notes remain beside the draft for traceability. The system surfaces warnings rather than hiding uncertainty. High-severity safety or contradiction flags block approval, and a reviewer can explicitly resolve a flag. Any edit creates a new persistent version and must be saved before approval.

## 2:35–3:25 — Approval and Integration

After review, Marcus selects Approve and Send. The button is unavailable while there are unsaved edits or blocking guardrails. Approval updates the persistent status and emits a structured outbound webhook designed for a GoHighLevel inbound workflow. The assessment deployment sends a redacted real notification through ntfy so the integration can be tested without exposing client credentials. The delivery attempt, destination, and HTTP status appear in the audit log.

Refreshing the page keeps the approved proposal, version, model metadata, totals, and delivery record. This demonstrates real persistence rather than local storage or an in-memory demo.

## 3:25–4:05 — Architecture and Cost

The stack is React and TypeScript on the frontend, tRPC and Express on the server, Drizzle with managed MySQL or TiDB for persistence, and a server-side LLM gateway. `gpt-5-mini` is appropriate because this is structured extraction and synthesis, not open-ended strategic reasoning. At current pricing, a representative four-thousand-input and fifteen-hundred-output-token draft costs roughly four-tenths of one cent before platform overhead. Edits and approvals do not call the model.

The repository includes six passing unit tests, type checks, a production build, SQL migrations, a documented environment template, and a real commit history.

## 4:05–4:30 — Next Week

With another week, I would import the client’s two-hundred-plus-line pricing catalog and require catalog item identifiers, replace the demo notifier with authenticated GoHighLevel integration, add branded PDF generation and e-signature handoff, introduce idempotent webhook retries, and compare generated drafts with Marcus-approved versions to measure acceptance rate and continuously improve the prompt.
