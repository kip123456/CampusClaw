export const PORT: number = parseInt(process.env.PORT || "8090", 10);

const rawToken = process.env.MCP_AUTH_TOKEN;

if (!rawToken || rawToken.trim() === "") {
  console.error("[config] MCP_AUTH_TOKEN environment variable is required and must be non-empty.");
  process.exit(1);
}

export const MCP_AUTH_TOKEN: string = rawToken;