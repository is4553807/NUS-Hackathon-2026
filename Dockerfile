FROM node:24-bookworm-slim

WORKDIR /app

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable

# Copy the workspace definition before installing so pnpm can apply the
# approved dependency build-script policy and link the MCP dependencies.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/mcp-server/package.json apps/mcp-server/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/commerce/package.json packages/commerce/package.json

RUN pnpm install --frozen-lockfile

COPY tsconfig.base.json ./
COPY apps/mcp-server apps/mcp-server
COPY packages/contracts packages/contracts
COPY packages/db packages/db
COPY packages/commerce packages/commerce

RUN pnpm --filter @visa-commerce/mcp-server... build

ENV NODE_ENV=production
ENV MCP_TRANSPORT=http
ENV MCP_HOST=0.0.0.0
ENV MCP_PORT=4100

EXPOSE 4100

CMD ["node", "apps/mcp-server/dist/server.js"]
