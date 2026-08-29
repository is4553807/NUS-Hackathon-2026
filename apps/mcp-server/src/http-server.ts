import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, Server, ServerResponse } from "node:http";

import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { createCommerceMcpServer } from "./create-server.js";
import {
  defaultCommerceMcpServices,
  type CommerceMcpServices,
} from "./services.js";

export type McpHttpServerOptions = {
  host: string;
  port: number;
  allowedHosts?: string[];
  authToken?: string;
  services?: CommerceMcpServices;
};

export type McpHttpServerHandle = {
  host: string;
  port: number;
  url: string;
  close: () => Promise<void>;
};

type HttpRequest = IncomingMessage & { body?: unknown };
type HttpResponse = ServerResponse & {
  status: (statusCode: number) => HttpResponse;
  send: (body: unknown) => void;
};
type Next = () => void;

function authorizationMatches(
  authorization: string | undefined,
  expectedToken: string | undefined,
): boolean {
  if (expectedToken === undefined) return true;
  if (authorization === undefined || !authorization.startsWith("Bearer ")) {
    return false;
  }

  const supplied = Buffer.from(authorization.slice("Bearer ".length));
  const expected = Buffer.from(expectedToken);
  return (
    supplied.length === expected.length && timingSafeEqual(supplied, expected)
  );
}

function methodNotAllowed() {
  return {
    jsonrpc: "2.0",
    error: { code: -32_000, message: "Method not allowed." },
    id: null,
  };
}

export async function startCommerceMcpHttpServer(
  options: McpHttpServerOptions,
): Promise<McpHttpServerHandle> {
  const services = options.services ?? defaultCommerceMcpServices;
  const app = createMcpExpressApp({
    host: options.host,
    allowedHosts: options.allowedHosts,
  });

  app.get("/health", (_request: HttpRequest, response: HttpResponse) => {
    response.send({ status: "ok", service: "visa-commerce-mcp" });
  });

  app.use(
    "/mcp",
    (request: HttpRequest, response: HttpResponse, next: Next) => {
      if (
        !authorizationMatches(request.headers.authorization, options.authToken)
      ) {
        response.setHeader("WWW-Authenticate", "Bearer");
        response.status(401).send({ error: "Unauthorized" });
        return;
      }
      next();
    },
  );

  app.post("/mcp", async (request: HttpRequest, response: HttpResponse) => {
    const mcpServer = createCommerceMcpServer(services);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    let cleanedUp = false;
    const cleanup = async () => {
      if (cleanedUp) return;
      cleanedUp = true;
      await transport.close();
      await mcpServer.close();
    };

    response.on("close", () => {
      void cleanup();
    });

    try {
      await mcpServer.connect(transport);
      await transport.handleRequest(request, response, request.body);
    } catch {
      if (!response.headersSent) {
        response.status(500).send({
          jsonrpc: "2.0",
          error: { code: -32_603, message: "Internal server error" },
          id: null,
        });
      }
      await cleanup();
    }
  });

  app.get("/mcp", (_request: HttpRequest, response: HttpResponse) => {
    response.status(405).send(methodNotAllowed());
  });

  app.delete("/mcp", (_request: HttpRequest, response: HttpResponse) => {
    response.status(405).send(methodNotAllowed());
  });

  const listener = await new Promise<Server>((resolve, reject) => {
    const pendingListener = app.listen(options.port, options.host, () => {
      resolve(pendingListener);
    });
    pendingListener.once("error", reject);
  });
  const address = listener.address();
  if (address === null || typeof address === "string") {
    await new Promise<void>((resolve, reject) => {
      listener.close((error) =>
        error === undefined ? resolve() : reject(error),
      );
    });
    throw new Error("MCP HTTP server did not bind to a TCP port.");
  }

  const displayHost = options.host === "0.0.0.0" ? "localhost" : options.host;
  return {
    host: options.host,
    port: address.port,
    url: `http://${displayHost}:${address.port}/mcp`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        listener.close((error) =>
          error === undefined ? resolve() : reject(error),
        );
      }),
  };
}
