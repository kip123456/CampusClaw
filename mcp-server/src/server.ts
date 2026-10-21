import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { PORT } from "./config";
import { authMiddleware } from "./auth";
import { tools } from "./tools";

function createMcpServer(): McpServer {
  const server = new McpServer(
    { name: "campusclaw-mcp", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );
  for (const tool of tools) {
    server.registerTool(tool.name, { description: tool.description, inputSchema: tool.inputSchema }, tool.handler);
  }
  return server;
}

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/mcp", authMiddleware, async (req, res) => {
  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  await transport.handleRequest(req as any, res as any, req.body);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[mcp-server] listening on 0.0.0.0:${PORT}`);
});