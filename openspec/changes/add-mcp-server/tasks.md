## 1. Project Scaffold

- [ ] 1.1 Create `mcp-server/` directory with `package.json` (name `campusclaw-mcp-server`, `"type": "commonjs"`, scripts `dev`/`build`/`start`/`typecheck`) and verify JSON parses
- [ ] 1.2 Add `tsconfig.json` (target ES2022, module commonjs, outDir ./dist, rootDir ./src, strict true) mirroring backend/ configuration and verify via tsc dry-run
- [ ] 1.3 Create `.dockerignore` (exclude node_modules, dist, .env, *.log) and `src/` skeleton directories
- [ ] 1.4 Install dependencies (`express`, `@modelcontextprotocol/sdk`) and devDependencies (`@types/express`, `@types/node`, `tsx`, `typescript`), verify `npm ci` succeeds

## 2. Config & Authentication

- [ ] 2.1 Implement `src/config.ts` reading `PORT` (default 8090) and `MCP_AUTH_TOKEN`; fail-fast on missing/empty token (process.exit(1) with log). Verify by running with unset token → non-zero exit.
- [ ] 2.2 Implement `src/auth.ts` Express middleware: missing `Authorization` → 401 `{error:"UNAUTHORIZED",message:"Missing Bearer token"}`; wrong token → 401 `{error:"UNAUTHORIZED",message:"Invalid token"}`. Verify via unit check.

## 3. Tools

- [ ] 3.1 Implement `src/tools/calculate.ts` with handler supporting +, -, *, /, division-by-zero guard returning `isError: true`, and Zod-less inputSchema. Verify via direct invocation of handler.
- [ ] 3.2 Implement `src/tools/convertUnit.ts` with length/weight/temperature/area conversion (SI base unit intermediate), invalid unit guard returning `isError: true`. Verify conversions: 1km→1000m, 0°C→32°F.
- [ ] 3.3 Create `src/tools/index.ts` re-exporting both tools; verify both appear in array.

## 4. Server

- [ ] 4.1 Implement `src/server.ts`: Express app, `GET /health` returning `{status:"ok"}` (no auth), `POST /mcp` with authMiddleware then SDK `StreamableHTTPServerTransport`, register calculate + convertUnit via `server.tool()`, call `server.connect(transport)`. Verify `npm run build` passes with no TS errors.

## 5. Docker & Compose

- [ ] 5.1 Write multi-stage `Dockerfile` (builder: node:20-alpine, npm ci + tsc; runtime: node:20-alpine, npm ci --omit=dev + copy dist). Verify image builds with `docker build -t campusclaw-mcp-server ./mcp-server`.
- [ ] 5.2 Write `mcp-server/.dockerignore` (already done in 1.3 — skip).
- [ ] 5.3 Edit root `docker-compose.yml`: add `mcp-server` service with `build.context: ./mcp-server`, `environment.MCP_AUTH_TOKEN: ${MCP_AUTH_TOKEN}`, `PORT: 8090`, no `ports` map, `restart: unless-stopped`. Verify compose config parses with `docker compose config`.

## 6. Smoke Verification

- [ ] 6.1 `MCP_AUTH_TOKEN=test-token docker compose up mcp-server` → container stays running; `curl -s http://localhost:<mapped>/health` returns `{"status":"ok"}`.
- [ ] 6.2 `curl -s -X POST http://localhost:<mapped>/mcp` without token → HTTP 401 with UNAUTHORIZED message.
- [ ] 6.3 `curl -s -X POST http://localhost:<mapped>/mcp -H "Authorization: Bearer test-token" -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"1.0"}},"id":1}'` → response contains `protocolVersion`, `serverInfo.name === "campusclaw-mcp"`.
- [ ] 6.4 `tools/list` smoke → response `result.tools` has length 2 with names `calculate` and `convertUnit`.
- [ ] 6.5 `tools/call calculate` with expression `2 * 3` → response contains `content[0].text` with value `"6"`.
- [ ] 6.6 `tools/call convertUnit` with `value=1 fromUnit=km toUnit=m` → response contains `content[0].text` containing `"1000"`.