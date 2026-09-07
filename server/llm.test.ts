import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import {
  assertApiKey,
  resolveApiKey,
  resolveApiUrl,
  resolveModelsUrl,
} from "./_core/llm";
import { getProposalModel } from "./proposal-service";

describe("OpenRouter configuration", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.BUILT_IN_FORGE_API_URL;
    delete process.env.BUILT_IN_FORGE_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_MODEL;
    delete process.env.OPENROUTER_BASE_URL;
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("resolves the default OpenRouter endpoint and models URL", () => {
    expect(resolveApiUrl()).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(resolveModelsUrl()).toBe("https://openrouter.ai/api/v1/models");
  });

  it("supports custom OPENROUTER_BASE_URL", () => {
    process.env.OPENROUTER_BASE_URL = "https://custom-router.internal/api/v1/";
    expect(resolveApiUrl()).toBe(
      "https://custom-router.internal/api/v1/chat/completions"
    );
    expect(resolveModelsUrl()).toBe(
      "https://custom-router.internal/api/v1/models"
    );
  });

  it("resolves OPENROUTER_API_KEY primarily", () => {
    process.env.OPENROUTER_API_KEY = "sk-or-v1-test12345";
    process.env.OPENAI_API_KEY = "sk-openai-fallback";
    expect(resolveApiKey()).toBe("sk-or-v1-test12345");
  });

  it("falls back to OPENAI_API_KEY for backward compatibility", () => {
    process.env.OPENAI_API_KEY = "sk-openai-legacy";
    expect(resolveApiKey()).toBe("sk-openai-legacy");
  });

  it("throws OPENROUTER_API_KEY is not configured when no key is set", () => {
    expect(() => assertApiKey()).toThrow(
      "OPENROUTER_API_KEY is not configured"
    );
  });

  it("resolves default model to openai/gpt-4o-mini", () => {
    expect(getProposalModel()).toBe("openai/gpt-4o-mini");
  });

  it("supports configuring OPENROUTER_MODEL", () => {
    process.env.OPENROUTER_MODEL = "anthropic/claude-3.5-sonnet";
    expect(getProposalModel()).toBe("anthropic/claude-3.5-sonnet");
  });
});
