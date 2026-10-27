## ADDED Requirements

### Requirement: 技能存储为文件夹模型

班级内的每个技能 MUST 以**文件夹 + SKILL.md** 的形式持久化到后端文件系统，存储路径 MUST 为 `storage/skills/<skill-id>/`，其中 `<skill-id>` 是数据库记录的主键。文件夹 MUST 包含一个必需文件 `SKILL.md`，MAY 包含可选的 `scripts/` 和 `references/` 子目录。SKILL.md MUST 以 YAML frontmatter 开头，支持 `name`（必填）、`description`（必填）、`version`（可选）、`triggers`（可选字符串数组）四个字段。SKILL.md 的 Markdown body 是技能的完整行为指令。

数据库 `skills` 表 MUST 存储以下元信息列：`id`、`class_id`、`name`、`description`（从 frontmatter 冗余提取）、`storage_path`、`import_source`（`'custom'` 或 `'external'`）、`import_url`（外部导入时非空）、`version`（从 frontmatter 提取）、`triggers_json`（从 frontmatter 提取的 JSON 数组）、`created_at`、`updated_at`。原 `prompt` 列 MUST 被移除。

#### Scenario: 自建技能创建时自动生成标准 SKILL.md
- **WHEN** 班级教师通过 API 创建技能，提供 name、description 和 skillContent（纯 Markdown 指令正文）
- **THEN** 系统在 `storage/skills/<skill-id>/` 下写入一个完整 SKILL.md，包含自动生成的 YAML frontmatter（name、description、version 默认 `1.0.0`、triggers 为空数组）和用户提供的 skillContent 作为 Markdown body

#### Scenario: 读取技能内容时从磁盘加载
- **WHEN** 后端需要获取某个技能的完整内容（用于构建 LLM prompt）
- **THEN** 系统 MUST 从 `storage_path` 指向的 SKILL.md 文件读取，而非从数据库列获取

#### Scenario: 文件夹缺失时的行为
- **WHEN** 数据库中有一条技能记录，但 `storage_path` 指向的目录不存在或 SKILL.md 缺失
- **THEN** 该技能 MUST 被标记为异常状态，后端动态选择逻辑 MUST 跳过它，API 返回详情时 MUST 报错说明存储文件缺失

### Requirement: 动态技能选择

后端 MUST 实现 Claude Code 风格的技能动态加载机制，避免将所有绑定技能无条件注入 LLM prompt。系统 MUST 维护一个技能索引（只含每个技能 SKILL.md 的 frontmatter 信息，包括 name、description、triggers 数组），在运行时基于用户输入智能选择最相关的 top-N（N ≤ 3）个技能按需加载完整内容。

选择算法 MUST 综合两种信号：1）**向量检索**：将用户问题文本嵌入后，与每个技能 description 做余弦相似度计算，取相似度最高的候选；2）**关键词触发**：如果 skill 的 triggers 数组非空，检查用户问题中是否包含任一 trigger 字符串（不区分大小写），命中则加分。最终得分 = 余弦相似度 + 关键词命中加分（每个命中项加固定权重 0.2）。得分最高的前 N 个技能被选中。

如果 agent 绑定的技能总数 ≤ 3，系统 MAY 跳过向量检索直接加载全部。

#### Scenario: 向量检索命中技能
- **WHEN** 用户问题与某个技能的 description 语义高度相关（余弦相似度 ≥ 0.85）
- **THEN** 该技能被选为 top-N 候选之一

#### Scenario: 关键词触发技能
- **WHEN** 某个技能的 triggers 包含 `["批改", "作文"]`，用户问题包含 "帮我批改一下这篇作文"
- **THEN** 该技能获得关键词加分，即使向量相似度稍低也可能入选

#### Scenario: 无匹配技能
- **WHEN** 用户问题与任何绑定技能的 description 向量相似度均 < 0.6 且无关键词触发
- **THEN** 返回空的选中技能列表，LLM prompt 中不注入任何技能内容

#### Scenario: 技能总数不足 3
- **WHEN** agent 只绑定了 2 个技能
- **THEN** 跳过向量检索，直接加载全部 2 个技能的完整内容

### Requirement: 外部技能导入

班级教师成员（或 admin）MUST 能够通过 `POST /api/classes/:classId/skills/import` 导入外部技能文件夹。请求 body MUST 包含 `source`（必填，值为 `'zip'` 或 `'url'`）和 `location`（必填，zip 文件上传或可下载的 HTTP URL）。系统 MUST 下载或解压到临时目录 → 校验 SKILL.md 存在且可解析 frontmatter → 将整个文件夹移动到 `storage/skills/<new-skill-id>/` → 写入 skills 表并设置 `import_source='external'`、`import_url` 为来源 URL。

导入时，SKILL.md 的 frontmatter 中的 `name` MUST 在目标班级内唯一。如果冲突，系统 MUST 返回 HTTP 409 并拒绝导入。

学生 MUST NOT 能调用此接口。

#### Scenario: 教师从 zip 包成功导入
- **WHEN** 班级教师上传一个包含有效 SKILL.md 的 zip 文件
- **THEN** 系统解压到 storage 目录，写入数据库记录，返回 HTTP 201 包含 skillId

#### Scenario: 导入的 zip 中缺少 SKILL.md
- **WHEN** zip 解压后找不到 SKILL.md 文件
- **THEN** 系统返回 HTTP 400 Bad Request，说明 "Invalid skill package: SKILL.md not found"

#### Scenario: 导入时 name 与班级已有技能冲突
- **WHEN** SKILL.md frontmatter 中的 name 与目标班级现有技能重名
- **THEN** 系统返回 HTTP 409 Conflict，不执行写入

#### Scenario: 学生尝试导入
- **WHEN** 学生用户访问 import 接口
- **THEN** 系统返回 HTTP 403 Forbidden

### Requirement: SKILL.md frontmatter 格式校验

系统 MUST 在校验 SKILL.md 文件时检查 YAML frontmatter 格式合法性：frontmatter 必须以 `---` 开头和结尾、`name` 和 `description` 字段 MUST 存在且为非空字符串、`version` MAY 存在且为字符串、`triggers` MAY 存在且为字符串数组。Markdown body MAY 为空。校验失败时，系统 MUST 拒绝创建或导入，并返回 HTTP 400 附带具体错误信息。

#### Scenario: 有效的 SKILL.md frontmatter
- **WHEN** SKILL.md 包含合法的 YAML frontmatter（必填字段齐全）
- **THEN** 校验通过，系统正常处理

#### Scenario: 缺少必填字段 name
- **WHEN** SKILL.md 的 frontmatter 没有 name 字段
- **THEN** 系统返回 HTTP 400 Bad Request，错误说明 "Missing required frontmatter field: name"

## MODIFIED Requirements

### Requirement: 创建班级技能

班级教师成员（或 admin）MUST 能够通过 `POST /api/classes/:classId/skills` 为班级创建技能。请求 body MUST 包含 `name`（必填，班级内唯一）和 `skillContent`（必填，纯 Markdown 格式的技能指令正文，最长 8000 字符）。可选包含 `description`（技能语义描述，最长 500 字符，用于动态选择的向量检索）。

系统在创建时 MUST 自动将 name 和 description 包装成标准 SKILL.md 格式：生成 YAML frontmatter（name、description、version 默认 `1.0.0`、triggers 为空数组）+ 用户提供的 skillContent 作为 Markdown body，写入 `storage/skills/<skill-id>/SKILL.md`。数据库 MUST 写入存储路径和 frontmatter 解析后的元信息，不再存储 prompt 列。

#### Scenario: 教师成功创建技能
- **WHEN** 班级教师发送请求提供 name 和 skillContent
- **THEN** 系统创建文件夹、写入标准 SKILL.md、创建数据库记录，返回 HTTP 201 包含 skillId、classId、name、description、storagePath、importSource（'custom'）、createdAt

#### Scenario: 技能名称在班级内重复
- **WHEN** 请求的 name 与该班级已有技能重名
- **THEN** 系统返回 HTTP 409 Conflict

#### Scenario: skillContent 缺失
- **WHEN** 请求未提供 skillContent 或 skillContent 为空字符串
- **THEN** 系统返回 HTTP 400 Bad Request

#### Scenario: skillContent 超出长度上限
- **WHEN** skillContent 长度超过 8000 字符
- **THEN** 系统返回 HTTP 400 Bad Request

#### Scenario: student 尝试创建技能
- **WHEN** 学生用户访问创建接口
- **THEN** 系统返回 HTTP 403 Forbidden

#### Scenario: admin 创建技能
- **WHEN** admin 用户发送创建请求
- **THEN** 系统创建技能记录，不受班级归属限制

### Requirement: 获取单个技能详情

班级教师成员（或 admin）MUST 能够通过 `GET /api/classes/:classId/skills/:skillId` 获取单个技能详情。返回内容 MUST 包含从磁盘读取的完整 SKILL.md 文件内容。学生 MUST NOT 能获取完整 SKILL.md 内容。

#### Scenario: 教师获取技能详情
- **WHEN** 班级教师请求
- **THEN** 返回完整技能对象，包含 skillContent 字段（SKILL.md 的 Markdown body 部分，不含 YAML frontmatter）和 frontmatter 解析结果（name、description、version、triggers）

#### Scenario: 学生尝试获取完整内容
- **WHEN** 学生请求技能详情
- **THEN** 返回技能对象但 skillContent 字段为 null 或省略

#### Scenario: 技能不存在或不属于该班级
- **WHEN** 指定的 skillId 在数据库中不存在或不属于该 classId
- **THEN** 系统返回 HTTP 404 Not Found

### Requirement: 更新班级技能

班级教师成员（或 admin）MUST 能够通过 `PUT /api/classes/:classId/skills/:skillId` 更新技能的 name、description 或 skillContent。更新时系统 MUST 重新生成完整 SKILL.md 并写入磁盘，同时同步更新数据库元信息列（description、triggers_json、updated_at）。班级内 name MUST 保持唯一。

#### Scenario: 教师更新技能的 skillContent
- **WHEN** 班级教师提供新的 skillContent
- **THEN** 系统重新生成 SKILL.md 并写入磁盘，返回 HTTP 200 包含更新后的完整技能对象

#### Scenario: 更新后 name 与其他技能冲突
- **WHEN** 请求的 name 与该班级其他已有技能重名
- **THEN** 系统返回 HTTP 409 Conflict

#### Scenario: skillId 不存在或不属于该班级
- **WHEN** 指定的 skillId 不存在或不属于该 classId
- **THEN** 系统返回 HTTP 404 Not Found

#### Scenario: student 尝试更新
- **WHEN** 学生用户访问更新接口
- **THEN** 系统返回 HTTP 403 Forbidden