## Why

CampusClaw 是一个面向学校的教学平台，教师可创建班级、管理学生、上传教学资料与知识库文档，学生可查看资料并受益于后续的 AI 智能助教能力。项目当前是空白仓库，需要一次性搭建好账户体系、班级协作、文件存储基础，为后续迭代（AI 问答、智能批改、数据分析等）奠定基础。向量化/语义检索作为预留扩展能力，不在 MVP 范围内实现。先交付 MVP 版本跑通核心闭环，再逐步扩展。

## What Changes

- 引入统一账户与认证体系：以「学校 + 学号」作为全局唯一登录标识，区分 admin / teacher / student 三种角色；仅 admin 有权创建新账户，所有账户可自主修改密码
- 引入班级管理：教师可创建班级、邀请其他教师加入、添加学生；一个班级可由多名教师共同管理；一个教师/学生可同时属于多个班级
- 引入按班级隔离的文件存储空间：每个班级独立目录，存放教学资料（PDF）与知识库文档
- 引入知识库文档管理：每个班级创建时自动获得一个默认知识库，教师可额外创建；教师可上传 PDF/TXT/MD 文档到知识库，供班级成员查看（向量化/语义检索预留给后续迭代）
- 引入多学校数据隔离：共享 SQLite 数据库，所有表带 `school` 字段，查询与写入均按学校过滤，admin 不受限制
- 提供 RESTful API 后端（Node.js + Express + TypeScript）与基础前端（React + TypeScript + Vite）

## Capabilities

### New Capabilities

- `identity/user-auth`: 账户创建、登录、修改密码，含 admin 专属的账户创建接口
- `classroom/class-management`: 班级创建、邀请教师、添加学生、成员查询
- `classroom/materials`: 教学资料（PDF）的上传、列表、下载，班级教师可上传、所有成员可查看
- `classroom/knowledge-base`: 知识库创建、文档上传与列表查看（向量化/语义检索预留给后续迭代）
- `classroom/data-isolation`: 横向数据隔离契约，所有端点必须遵守的学校级访问控制规则

### Modified Capabilities

（无，本项目为 greenfield）

## Impact

- **技术栈新增**：Node.js、TypeScript、Express、React、Vite、SQLite（via `better-sqlite3` 或类似同步驱动）、bcrypt、JWT、multer（文件上传）
- **存储新增**：本地磁盘目录结构（`./data/schools/<school>/classes/<classId>/...`）、SQLite 文件
- **API 新增**：RESTful 风格接口，覆盖认证、班级、资料、知识库四大模块
- **前端新增**：登录页、我的班级列表页、班级详情页（materials / kbs 标签）
- **无破坏性变更**（greenfield）