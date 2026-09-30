## Context

See proposal.md - Why. 现有向量检索 (`lib/chroma.ts:56-92`) 只返回 documentId + chunkIndex，chunk 切分 (`lib/chunk.ts:50-77`) 的 startOffset / endOffset 信息从未被记录。索引流水线 (`lib/indexer.ts:19-50` → `upsertChunks`) 也没有携带偏移量到 Chroma metadata。配置系统复用 `.env` + `dotenv/config` + `config.ts` 的模式。

## Goals / Non-Goals

**Goals:**
- chunkText 返回结构携带 startOffset / endOffset 字段
- Chroma metadata 新增 startOffset / endOffset 并透传到 query 响应
- 新增 LLM Chat Completions 配置（LLM_BASE_URL / LLM_MODEL / LLM_API_KEY），复用 config.ts 模式
- 新增 `lib/qa.ts` 封装 RAG 问答流程（检索 → prompt 构造 → LLM 调用 → 结果组装）
- 新增 `POST /api/classes/:classId/kbs/qa` 路由，仅教师可用
- 问答接口返回 answer + citations（citation 带完整溯源）
- 前端在检索区域旁增加问答面板，复用 KB 多选 state，支持内联引用点击展开

**Non-Goals:**
- 不实现多轮对话（单轮问答即可）
- 不实现流式输出
- 不做 LLM 调用成本管控（无 token 计数、无费用预估）
- 不做文档级细粒度定位（PDF 页码、Word 段落），仅字符偏移
- 不修改现有学生端检索逻辑（仍可用但不显示 offset 前端展示可先不做，后端已返回）

## Decisions

### D1: chunk offset 以 0-based 字符偏移量记录
**选择**: chunkText 切分时，同时追踪文本指针 `start`（切分循环的起始位置），将 `{ text, index, startOffset: start, endOffset: start + piece.length }` 作为 Chunk 返回。
**替代方案**: 记录行号（需要额外统计，且 PDF 提取文本的行号不稳定）；同时记录页码（依赖 PDF 元数据，TXT/MD 无页码概念）。
**理由**: 字符偏移对所有文件格式一致，实现最轻，前端展示时可以转为"第 X-Y 字符"或配合字符偏移做进一步定位。如果后续要做 PDF 页码映射，需要改造 `pdf-extract.ts` 返回结构，属于扩展工作。

### D2: LLM 调用走 OpenAI 兼容的 Chat Completions 端点
**选择**: `{LLM_BASE_URL}/chat/completions`，复用 embed.ts 的 fetch 模式（base URL replace `/+$/, ''`，Bearer token，JSON body）。新增 config 字段：`llmBaseUrl` / `llmModel` / `llmApiKey`，缺失时 qa.ts 在调用点返回明确错误。
**替代方案**: 复用 embed 端点的 base URL（不严谨，embed 和 chat 可能是不同模型/端口）；内置 SDK（引入额外依赖）。
**理由**: 和现有 embed 模块风格一致，OpenAI 兼容端点覆盖面广，国内 Ollama / DashScope / DeepSeek 都支持。

### D3: citations 数组来源策略与前端隐去
**选择**: 后端将检索到的 topK chunks 全部放入 citations 并打 id 1..topK，answer 中的 `[1]`、`[2]` 引用标记与之对应。前端渲染时，用正则从 answer 中提取所有 `[N]` 引用编号集合，过滤 citations 只展示被 answer 实际引用的那些：如果 answer 里完全没有 `[N]` 标记，整块引用面板（"引用的知识库片段"）不渲染；如果 answer 部分引用，只渲染被引用的 citation 卡片，未被引用的静默隐藏。
**替代方案**: 后端用正则解析 answer 中的 `[N]` 过滤 citations（只保留被引用的）；让 LLM 在 JSON 里返回结构化引用；前端始终显示全部 topK citations（冗余、教师体验差）。
**理由**: 正则解析简单但后端做会重复逻辑；JSON 输出让 prompt 更复杂且部分模型 JSON 输出不稳定。折中方案：后端返回全部检索到的 chunks 作为 citations（含 id），前端根据 answer 中实际出现的引用标记决定展示哪些——answer 无引用则整块隐去，有引用则只展示被引用的子集。这样后端逻辑简洁，前端 UI 始终与 answer 内容一致。

### D4: 问答为同步请求-响应模式，设置 LLM 超时 30s
**选择**: `/qa` 是同步 POST，await LLM 调用。超时用 AbortController。不做任务队列（问答耗时一般 <15s）。
**替代方案**: 异步队列 + 轮询（复杂度高）；流式 SSE（前端额外工作）。
**理由**: 当前场景教师问答单轮延迟可接受，先同步实现，后续有性能瓶颈再切异步。

### D5: 旧向量兼容
**选择**: queryChunks 读 metadata 时如果没有 startOffset / endOffset 字段（旧向量），返回 null，前端展示"未知位置"。不做全量重索引迁移（会消耗大量 embedding 配额和时间）。
**替代方案**: 启动时自动重索引所有旧文档（风险大，可能卡死启动）。
**理由**: 向后兼容更重要，重索引可作为教师手动操作。

### D6: chunkText 签名变化的最小化影响
**选择**: Chunk 接口新增 startOffset / endOffset 字段（可选 `?` 或必有），indexer.ts / upsertChunks / chroma.ts 透传，query 返回。不会影响现有代码——现有代码只读取 text / index，新加的字段不会破坏编译。
**替代方案**: 保持 Chunk 接口不变，用新 ChunkWithOffset 接口（多余抽象）。

## Risks / Trade-offs

| 风险 | 缓解 |
|------|------|
| LLM 端点不稳定导致问答超时/失败 | AbortController 30s 超时，错误信息返回给前端；config 缺失时提前返回 503 |
| 大 chunk（10000 字符）做 RAG prompt 太长 | topK 上限 15 仍可能导致 prompt 过长；后续可加 token 估算和截断 |
| 检索结果为空时 LLM 幻觉 | prompt 里明确"知识库没有相关内容"，让模型如实回答 |
| chunk offset 对 PDF 页码无直接映射 | 本次只做字符偏移，PDF 页码属于后续扩展 |
| 同步问答可能阻塞 Node.js 事件循环（LLM 调用 5-15s） | Node.js 的 fetch 不阻塞，真正阻塞只有本地数据库查询——可接受 |
| citations 数组过大（topK=15）导致前端展示杂乱 | 前端默认折叠 citations 面板 |

## Migration Plan

1. 部署前**不需要**数据库迁移（新功能不碰 SQLite schema）
2. 部署后现有向量保持原样，startOffset/endOffset 返回 null（降级）
3. 新上传/重新索引的文档自动写入 offset
4. 管理员可以通知教师重新索引旧文档以获得完整溯源

## Open Questions

- LLM 调用是否需要处理多模型场景（比如快速/精确两个模型）？当前先硬编码一个 model 名。
- 是否要加问题历史/会话存档？当前不做，后续需要再加。