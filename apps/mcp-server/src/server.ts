import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { createCommerceMcpServer } from "./create-server.js";
import {
  startCommerceMcpHttpServer,
  type McpHttpServerHandle,
} from "./http-server.js";

const OptionalMcpAuthTokenSchema = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim().length === 0 ? undefined : value,
  z.string().trim().min(16).optional(),
);

const McpEnvSchema = z.object({
  MCP_TRANSPORT: z.enum(["http", "stdio"]).default("http"),
  MCP_HOST: z.string().trim().min(1).default("127.0.0.1"),
  MCP_PORT: z.coerce.number().int().min(1).max(65_535).default(4100),
  MCP_ALLOWED_HOSTS: z.string().optional(),
  MCP_AUTH_TOKEN: OptionalMcpAuthTokenSchema,
});

function isLoopbackHost(host: string): boolean {
  return ["127.0.0.1", "localhost", "::1"].includes(host);
}

function allowedHosts(value: string | undefined): string[] | undefined {
  const hosts = value
    ?.split(",")
    .map((host) => host.trim())
    .filter(Boolean);
  return hosts === undefined || hosts.length === 0 ? undefined : hosts;
}

async function main(): Promise<void> {
  const env = McpEnvSchema.parse(process.env);

  if (env.MCP_TRANSPORT === "stdio") {
    const server = createCommerceMcpServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    return;
  }

  if (!isLoopbackHost(env.MCP_HOST) && env.MCP_AUTH_TOKEN === undefined) {
    throw new Error(
      "MCP_AUTH_TOKEN is required when MCP_HOST is not a loopback host.",
    );
  }

  const httpServer = await startCommerceMcpHttpServer({
    host: env.MCP_HOST,
    port: env.MCP_PORT,
    allowedHosts: allowedHosts(env.MCP_ALLOWED_HOSTS),
    authToken: env.MCP_AUTH_TOKEN,
  });
  console.log(`Visa Commerce MCP listening at ${httpServer.url}`);
  installShutdownHandlers(httpServer);
}

function installShutdownHandlers(httpServer: McpHttpServerHandle): void {
  const shutdown = () => {
    void httpServer.close().finally(() => process.exit(0));
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
