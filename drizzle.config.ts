import { defineConfig } from "drizzle-kit";

const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://user:password@localhost:5432/quoteflow";

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
  },
});
