import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import type { DashboardMetrics } from "@shared/types";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import {
  deleteProposalRow,
  listIntegrationEvents,
  listProposalRows,
} from "./db";
import {
  approveAndDeliver,
  generateAndPersistProposal,
  hydrateProposal,
  persistEdits,
  proposalInputSchema,
} from "./proposal-service";

const lineItemInput = z.object({
  category: z.string(),
  description: z.string(),
  quantity: z.number(),
  unit: z.string(),
  unitPriceCents: z.number().int(),
  sourceNote: z.string(),
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      ctx.res.clearCookie(COOKIE_NAME, {
        ...getSessionCookieOptions(ctx.req),
        maxAge: -1,
      });
      return { success: true } as const;
    }),
  }),
  proposal: router({
    list: publicProcedure.query(async () => {
      const proposals = (await listProposalRows()).map(hydrateProposal);
      const metrics: DashboardMetrics = {
        totalProposals: proposals.length,
        awaitingApproval: proposals.filter(item => item.status === "draft")
          .length,
        approved: proposals.filter(item => item.status === "approved").length,
        pipelineValueCents: proposals.reduce(
          (sum, item) => sum + item.totalCents,
          0
        ),
      };
      return { proposals, metrics };
    }),
    generate: publicProcedure
      .input(proposalInputSchema)
      .mutation(({ input }) => generateAndPersistProposal(input)),
    update: publicProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          projectSummary: z.string(),
          lineItems: z.array(lineItemInput),
          assumptions: z.array(z.string()),
          exclusions: z.array(z.string()),
          unansweredQuestions: z.array(z.string()),
          riskFlags: z.array(
            z.object({
              severity: z.enum(["low", "medium", "high"]),
              message: z.string(),
            })
          ),
          customerMessage: z.string(),
        })
      )
      .mutation(({ input }) => {
        const { id, ...edits } = input;
        return persistEdits(id, edits);
      }),
    approve: publicProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(({ input }) => approveAndDeliver(input.id)),
    delete: publicProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(({ input }) => deleteProposalRow(input.id)),
    integrationEvents: publicProcedure
      .input(z.object({ proposalId: z.number().int().positive() }))
      .query(({ input }) => listIntegrationEvents(input.proposalId)),
  }),
});

export type AppRouter = typeof appRouter;
