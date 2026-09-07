import "dotenv/config";
import { describe, expect, it } from "vite-plus/test";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createMockContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("proposal router", () => {
  it("executes proposal.list without errors and returns formatted proposals & metrics", async () => {
    const caller = appRouter.createCaller(createMockContext());
    const result = await caller.proposal.list();

    expect(result).toHaveProperty("proposals");
    expect(result).toHaveProperty("metrics");
    expect(Array.isArray(result.proposals)).toBe(true);
    expect(typeof result.metrics.totalProposals).toBe("number");
    expect(typeof result.metrics.awaitingApproval).toBe("number");
    expect(typeof result.metrics.approved).toBe("number");
    expect(typeof result.metrics.pipelineValueCents).toBe("number");
  });

  it("returns null when deleting an unknown proposal id", async () => {
    const caller = appRouter.createCaller(createMockContext());
    const result = await caller.proposal.delete({ id: 999_999_999 });

    expect(result).toBeNull();
  });
});
