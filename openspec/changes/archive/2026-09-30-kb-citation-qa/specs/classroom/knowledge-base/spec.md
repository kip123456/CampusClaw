## MODIFIED Requirements

### Requirement: 知识库向量检索（多 KB 批量）
班级所有成员（teacher 和 student）以及 admin MUST 能够通过 `POST /api/classes/:classId/kbs/query` 在指定知识库集合中进行向量相似度检索。请求 body MUST 包含 `kbIds: string[]`（至少 1 个）和 `query: string`，可选 `topK: number`（默认 5，上限 20）。系统 MUST 校验所有 kbIds 都属于指定 classId。检索返回的每条结果 MUST 包含匹配片段文本、相似度距离、来源 documentId、来源 originalName、chunkIndex，以及位置级溯源字段 startOffset 和 endOffset（字符偏移量，可为 null 表示无法获取位置）。

#### Scenario: 班级成员成功检索
- **WHEN** 班级成员（teacher 或 student）提供 query 和一个或多个属于该班的 kbIds
- **THEN** 系统返回 HTTP 200，body 为结果数组，每条包含 chunk、distance、documentId、originalName、chunkIndex、startOffset、endOffset

#### Scenario: 多个知识库混合检索
- **WHEN** 请求体 kbIds 包含 2 个或以上属于该班的知识库
- **THEN** 系统在所有指定知识库的向量联合空间中检索，按距离排序返回 topK 条，不论来源 KB

#### Scenario: kbIds 中包含不属于该班的知识库
- **WHEN** 请求的 kbIds 里有任意一个不属于指定 classId
- **THEN** 系统返回 HTTP 400 Bad Request，body 包含无效 kbId 列表

#### Scenario: kbIds 为空或缺省
- **WHEN** 请求的 kbIds 为空数组或不存在
- **THEN** 系统返回 HTTP 400 Bad Request

#### Scenario: topK 超出上限
- **WHEN** 请求的 topK > 20
- **THEN** 系统返回 HTTP 400 Bad Request

#### Scenario: 检索结果必须溯源到文档
- **WHEN** 系统返回检索结果
- **THEN** 每条结果 MUST 附带 originalName 字段（来自 kb_documents.original_name）和 startOffset/endOffset 字段（chunk 在源文件中的字符偏移范围）

#### Scenario: 历史 chunk 缺少位置信息
- **WHEN** 向量库中某 chunk 的 metadata 中无 startOffset / endOffset（旧索引文档）
- **THEN** 检索返回中这两个字段为 null，前端降级显示"未知位置"

#### Scenario: 非班级成员尝试检索
- **WHEN** 非班级成员且非 admin 用户访问检索接口
- **THEN** 系统返回 HTTP 403 Forbidden

## ADDED Requirements

### Requirement: chunk 位置级溯源
文档索引时，系统 MUST 记录每个 chunk 在提取后的源文本中的字符偏移范围（startOffset：chunk 首字符的 0-based 偏移，endOffset：chunk 末字符之后的偏移）。这两个值 MUST 作为 metadata 写入向量数据库。已存在于向量库中但缺少这两个 metadata 字段的历史 chunk MUST 在检索时返回 null。

#### Scenario: chunk 切分时记录偏移量
- **WHEN** 系统对某文档执行 chunkText 切分
- **THEN** 每个返回的 chunk 对象 MUST 携带 startOffset 和 endOffset，表示该 chunk 文本在原始提取文本中的位置

#### Scenario: 偏移量写入向量 metadata
- **WHEN** 系统调用 upsertChunks 写入向量库
- **THEN** metadata 对象 MUST 包含 startOffset 和 endOffset 字段（整数）

#### Scenario: 旧文档重索引后补齐偏移量
- **WHEN** 对一个之前已索引（offset 为 null）的文档触发重新索引
- **THEN** 新写入的 chunk 向量包含正确的 startOffset / endOffset，查询该文档时 offset 字段不再为 null