import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerTools } from "./register-tools.js";
import {
  defaultCommerceMcpServices,
  type CommerceMcpServices,
} from "./services.js";

export function createCommerceMcpServer(
  services: CommerceMcpServices = defaultCommerceMcpServices,
): McpServer {
  const server = new McpServer({
    name: "visa-commerce",
    version: "0.1.0",
  });

  registerTools(server, services);
  return server;
}
