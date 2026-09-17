## Why

CampusClaw 是一个面向学校的教学平台，教师可创建班级、管理学生、上传教学资料与知识库，学生可查看资料并受益于后续的 AI 智能助教能力。项目当前是空白仓库，需要一次性搭建好账户体系、班级协作、文件存储与向量检索基础设施，为后续迭代（AI 问答、智能批改、数据分析等）奠定基础。先交付 MVP 版本跑通核心闭环，再逐步扩展。

## What Changes

- 引入统一账户与认证体系：以「学校 + 学号」作为全局唯一登录标识，区分 admin / teacher / student 三种角色；仅 admin 有权创建新账户，所有账户可自主修改密码
- 引入班级管理：教师可创建班级、邀请其他教师加入、添加学生；一个班级可由多名教师共同管理；一个教师/学生可同时属于多个班级
- 引入按班级隔离的文件存储空间：每个班级独立目录，存放教学资料（PDF）与知识库文档
- 引入向量化知识库：每个班级创建时自动获得一个默认知识库，教师可额外创建；教师上传的文档经解析后自动向量化写入 ChromaDB，为后续语义检索/AI 问答做准备
- 引入多学校数据隔离：共享 SQLite 数据库，所有表带 `school` 字段，查询与写入均按学校过滤，admin 不受限制
- 提供 RESTful API 后端（Node.js + Express + TypeScript）与基础前端（React + TypeScript + Vite）

## Capabilities

### New Capabilities

- `identity/user-auth`: 账户创建、登录、修改密码，含 admin 专属的账户创建接口
- `classroom/class-management`: 班级创建、邀请教师、添加学生、成员查询
- `classroom/materials`: 教学资料（PDF）的上传、列表、下载，班级教师可上传、所有成员可查看
- `classroom/knowledge-base`: 知识库创建、文档上传与解析向量化、向量检索接口预留
- `classroom/data-isolation`: 横向数据隔离契约，所有端点必须遵守的学校级访问控制规则

### Modified Capabilities

（无，本项目为 greenfield）

## Impact

- **技术栈新增**：Node.js、TypeScript、Express、React、Vite、SQLite（via `better-sqlite3` 或类似同步驱动）、ChromaDB（官方 JS 客户端）、bcrypt、JWT、pdfjs-dist、`@xenova/transformers`（embedding）、multer（文件上传）
- **存储新增**：本地磁盘目录结构（`./data/schools/<school>/classes/<classId>/...`）、SQLite 文件、ChromaDB 持久化目录
- **API 新增**：RESTful 风格接口，覆盖认证、班级、资料、知识库四大模块
- **前端新增**：登录页、我的班级列表页、班级详情页（materials / kbs 标签）
- **无破坏性变更**（greenfield）