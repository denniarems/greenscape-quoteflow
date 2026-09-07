# QuoteFlow — Greenscape Pro Proposal Copilot

QuoteFlow converts messy landscape site-walk notes into a structured, priced, and guarded proposal draft. The workflow is deliberately **human-in-the-loop**: AI prepares the work, deterministic code validates and totals it, and Marcus approves before an external event is emitted.

## Why This Agent

Greenscape Pro is spending $25,000–$30,000 per month on acquisition and has adequate lead volume. Its constraint is the 6–9-day proposal cycle. Approximately 35–40% of qualified leads are lost to faster competitors. QuoteFlow targets that revenue leak before adding more demand.

## Features

- Real OpenRouter structured-output call from server-side code (default: `openai/gpt-4o-mini`, configurable via `OPENROUTER_MODEL`).
- Schema validation, deterministic cent-based totals, and range guardrails.
- Persistent NeonDB/PostgreSQL storage for proposals, versions, status, model metadata, and delivery attempts.
- Editable scope, pricing, assumptions, exclusions, open questions, and customer message.
- Human approval gate; high-severity flags block sending.
- Configurable outbound webhook designed for GoHighLevel (GHL).
- Redacted live ntfy fallback so reviewers can test a real external integration without client credentials.
- Responsive operations dashboard with approval and integration audit states.

## Architecture

```text
Site-walk notes → tRPC API → OpenRouter JSON schema → Zod validation
→ deterministic totals + guardrails → persistent database → human review
→ approval → outbound GHL-compatible webhook → integration audit log
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the detailed flow and production hardening plan. See [STRATEGY.md](./STRATEGY.md) for the opinionated five-agent prioritization.

## Local Setup

You can run the interactive setup wizard to automatically walk through configuring OpenRouter, Database, JWT secrets, and webhooks:

```bash
pnpm wizard
# or: bash scripts/setup-wizard.sh
```

Or configure manually:

```bash
cp .env.example .env
pnpm install
pnpm db:push
pnpm dev
```

Set `DATABASE_URL` to a NeonDB or PostgreSQL database. Set `OPENROUTER_API_KEY` to call OpenRouter directly (defaults to `openai/gpt-4o-mini`, configurable via `OPENROUTER_MODEL`), or run in the managed environment with the injected LLM gateway credentials. Set `OUTBOUND_WEBHOOK_URL` to a GHL inbound webhook or an inspection endpoint such as Webhook.site.

## Verification

```bash
pnpm check
pnpm test
pnpm build
```

The tests cover deterministic arithmetic, approval guardrails, and the outbound payload boundary.

## Vercel Deployment

QuoteFlow includes both an interactive onboarding wizard and a dedicated deployment runner for Vercel:

1. **Interactive Setup Wizard**: Walks through provisioning Neon PostgreSQL, OpenRouter AI keys, production domain, and Vercel environment variables:
   ```bash
   pnpm run wizard:vercel
   # or: bash scripts/setup-vercel-wizard.sh
   ```

2. **Standalone Deployment Runner**: Runs pre-flight type checks and tests, builds production bundles, and deploys via Vercel CLI (`npx vercel --prod`) or git push:
   ```bash
   pnpm run deploy
   # or: bash scripts/deploy.sh
   ```

## AI Cost

The app uses `openai/gpt-4o-mini` via OpenRouter (or `gpt-5-mini` on the managed platform gateway), priced at ~$0.15 per million input tokens and ~$0.60 per million output tokens. A representative 4,000-input/1,500-output generation costs approximately **$0.0015** before platform overhead. The workflow uses one model call per generated proposal; edits and approvals do not call the model.

## Known Assessment Boundaries

The pricing reference is a representative subset because the client's 200+ line pricing spreadsheet was not included. Production would import that catalog and match line-item identifiers rather than use model-suggested allowances. The production webhook would use GHL credentials and idempotent retries; the assessment uses a real but redacted external notifier by default. PDF rendering and e-signature are intentionally downstream of the validated proposal core.

## Repository Documents

- [STRATEGY.md](./STRATEGY.md) — ranked five-agent strategy.
- [ARCHITECTURE.md](./ARCHITECTURE.md) — system design and tradeoffs.
- [WALKTHROUGH.md](./WALKTHROUGH.md) — five-minute recording script.
- [.env.example](./.env.example) — cloneable configuration contract.
