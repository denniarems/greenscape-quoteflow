export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  openRouterApiKey:
    process.env.OPENROUTER_API_KEY ?? process.env.OPENAI_API_KEY ?? "",
  openRouterModel:
    process.env.OPENROUTER_MODEL ?? process.env.AI_MODEL ?? "",
  openRouterBaseUrl:
    process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
  appUrl: process.env.APP_URL ?? "http://localhost:3000",
};
