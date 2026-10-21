## Why

CampusClaw 的教学 Agent 目前仅通过 LLM 内置的 RAG + prompt 机制工作，无法调用外部计算或数据工具。搭建一个独立的 MCP（Model Context Protocol）服务，为后续 Agent 功能扩展预留标准接入点。本次先落地服务骨架、认证和两个示范工具，验证 JSON-RPC 2.0 HTTP transport 能正确工作。

## What Changes

- 新增 `mcp-server/` 目录，独立的 TypeScript + Express 项目
- 实现 `POST /mcp`（JSON-RPC 2.0 over HTTP streamable transport）和 `GET /health`
- Bearer token 认证中间件，令牌从 `MCP_AUTH_TOKEN` 环境变量读取
- 实现三个 MCP 方法：`initialize`、`tools/list`、`tools/call`
- 暴露两个示范工具：`calculate`（加减乘除）、`convertUnit`（长度/重量/温度/面积）
- 为 `mcp-server/` 提供 node:20-alpine 多阶段 Dockerfile
- `docker-compose.yml` 新增 `mcp-server` service，与 backend 同 compose 网络互通

## Capabilities

### New Capabilities
- `infrastructure/mcp-server`: 独立的 MCP 协议服务，暴露工具发现与调用能力，通过 HTTP 上的 JSON-RPC 2.0 提供服务，并要求 Bearer 令牌认证。

### Modified Capabilities
- （无 —— backend 侧的 MCP 客户端集成留给后续 change）

## Impact

- **新目录**：`mcp-server/` 与 `backend/`、`frontend/` 平级
- **新依赖**：`@modelcontextprotocol/sdk`（官方 MCP SDK）
- **修改文件**：`docker-compose.yml` 新增 service
- **镜像**：新构建一个 mcp-server 镜像（不影响 backend/frontend 镜像大小）
- **环境变量**：`MCP_AUTH_TOKEN`（部署时必须提供，无默认值；不进 Git、不进镜像层）