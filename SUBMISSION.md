# Assessment Submission

## Links

- **GitHub repository:** https://github.com/denniarems/greenscape-quoteflow
- **Deployed application:** _Add the deployed application URL here._
- **Recorded walkthrough:** _Add the recorded walkthrough URL here._
- **Strategy:** [STRATEGY.md](./STRATEGY.md)

## Reasoning

I prioritized proposal generation because Greenscape Pro’s constraint is not demand; it is the time required to turn qualified site walks into quotes. Paid acquisition is already healthy, yet proposals take 6–9 days and an estimated 35–40% of qualified leads are lost to faster competitors. Compressing this cycle directly protects revenue and creates capacity for the closed-lost and qualification agents ranked behind it.

QuoteFlow keeps AI inside a controlled workflow. A real OpenRouter structured call (defaulting to `openai/gpt-4o-mini`, configurable via `OPENROUTER_MODEL`) converts messy field notes into schema-validated scope, assumptions, exclusions, open questions, risk flags, and customer copy. Deterministic server code—not the model—calculates totals. Every proposal and version is stored in a managed SQL database. High-severity flags prevent approval, all edits require saving, and only a human can trigger the outbound GoHighLevel-compatible webhook.

I chose OpenRouter with `openai/gpt-4o-mini` because the work is structured extraction and synthesis, where a low-cost model with strict JSON output is the right tradeoff. A representative action costs roughly $0.0015 before platform overhead. The assessment deployment uses a redacted real external notifier so the integration can be exercised without private GHL credentials. In production, I would import the client’s 200+ pricing items, connect GHL directly, add idempotent retries and a dead-letter queue, and generate a branded PDF after approval.
