# Assessment Submission

## Links

- **GitHub repository:** https://github.com/denniarems/greenscape-quoteflow
- **Deployed application:** _Add the deployed application URL here._
- **Recorded walkthrough:** _Add the recorded walkthrough URL here._
- **Strategy:** [STRATEGY.md](./STRATEGY.md)

## Reasoning

I prioritized the proposal copilot because Greenscape Pro does not have an acquisition problem—paid marketing is performing strongly with healthy returns on ad spend. The true operational constraint is proposal turnaround: converting site-walk notes into formal bids currently takes six to nine days, causing an estimated 35% to 40% of qualified leads to be lost to faster competitors. Compressing this turnaround to a same-day draft directly protects high-margin revenue (an estimated $336,000+ in annual recovered revenue) while returning vital founder hours before adding more demand.

Architecturally, QuoteFlow enforces strict human-in-the-loop governance around AI generation:
1. **Resilient Structured Extraction:** The system uses server-side structured AI extraction to parse messy field notes into itemized scope, project assumptions, exclusions, open questions, risk flags, and customer-facing copy. A resilient normalization layer cleans markdown formatting, standardizes variations in naming or unit pricing, and includes a fallback generator to ensure every proposal includes a warm, personalized cover letter even if the initial draft is sparse.
2. **Deterministic Math & Business Guardrails:** The AI is never trusted with arithmetic. Line-item subtotals, unit pricing, and overall project totals are calculated strictly by server logic in integer cents to completely eliminate rounding drift and mathematical hallucinations. A multi-tier guardrail system enforces business rules: flagging jobs below the company's typical $8,000 project floor or above the $120,000 range, validating numeric inputs, and distinguishing genuine physical or safety hazards from routine paperwork (such as HOA approvals), ensuring routine dependencies do not unnecessarily block approvals.
3. **Human Governance, Persistence & Immutability:** The system keeps the founder in control. The AI drafts the proposal, but only a human can review, edit, and approve it. High-severity risk flags prevent approval until resolved, each revision increments the proposal version in a managed database, and approved proposals become permanently locked to preserve contract integrity.
4. **Sanitized Outbound Integration:** Approval triggers a GoHighLevel-compatible webhook payload that is carefully sanitized to strip internal site notes while delivering customer details, itemized scope, and verified totals. For assessment testing without requiring private client credentials, delivery can be verified through a live external notification endpoint with complete delivery status and HTTP response logging.

At a fraction of a cent per proposal generation, the unit economics are negligible compared to an average $28,000 landscaping project. The solution eliminates manual re-keying across pricing sheets and documents, enforces consistent brand standards and profit margins, and establishes the operational foundation required before scaling lead reactivation.
