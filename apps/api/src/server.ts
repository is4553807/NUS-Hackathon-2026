import { z } from "zod";

import { buildApp } from "./app.js";

const ApiEnvSchema = z.object({
  API_HOST: z.string().default("0.0.0.0"),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
});

async function main(): Promise<void> {
  const env = ApiEnvSchema.parse(process.env);
  const app = buildApp();

  await app.listen({ host: env.API_HOST, port: env.API_PORT });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
