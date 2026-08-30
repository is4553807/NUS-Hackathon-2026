function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`${name} is required but was not set.`);
  }
  return value;
}

export const agentConfig = {
  get openaiApiKey(): string {
    return requireEnv("OPENAI_API_KEY");
  },
  get openaiModel(): string {
    return process.env.OPENAI_MODEL ?? "gpt-4.1";
  },
  get commerceMcpUrl(): string {
    return requireEnv("COMMERCE_MCP_URL");
  },
  get commerceMcpAuthToken(): string | undefined {
    const token = process.env.COMMERCE_MCP_AUTH_TOKEN;
    return token === undefined || token.trim() === "" ? undefined : token;
  },
};

/**
 * There is no user-auth system in this hackathon MVP. `create_order` requires
 * a real `userId` per the live Commerce schema (packages/contracts
 * OrderRequestSchema), so every session acts as this one seeded demo user
 * (packages/db/prisma/seed.ts `demoUserId`), which owns the seeded saved
 * payment methods TIM's payment flow relies on.
 */
export const DEMO_USER_ID = "643f3382-40b2-4343-b4bf-4d62d51da5fb";
