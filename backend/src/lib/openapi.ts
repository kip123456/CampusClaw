export const openApiDocument: Record<string, unknown> = {
  openapi: '3.0.3',
  info: {
    title: 'CampusClaw Backend API',
    version: '0.1.0',
    description:
      'CampusClaw 后端 API 文档。所有 `/api/classes/*` 下的接口需要 Bearer JWT 认证；`/api/auth/login` 和 `/api/health` 为公开接口。',
  },
  servers: [
    { url: 'http://localhost:3000', description: '本地开发服务器' },
  ],
  tags: [
    { name: 'Health', description: '健康检查' },
    { name: 'Auth', description: '登录认证与密码管理' },
    { name: 'Admin', description: '管理员：创建用户' },
    { name: 'Classes', description: '课程管理：创建课程、管理成员' },
    { name: 'Materials', description: '课程资料：PDF 上传下载' },
    { name: 'KnowledgeBases', description: '知识库：文档管理、索引、RAG 查询与 QA' },
    { name: 'Skills', description: 'Agent 技能：可被 Agent 组合使用的 Prompt' },
    { name: 'Agents', description: 'Agent：带知识库和技能的智能体' },
    { name: 'AgentMessages', description: 'Agent 对话：SSE 流式聊天与历史记录' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: '登录后返回的 JWT token，格式：`Bearer <token>`',
      },
    },
    schemas: {
      ErrorResponse: {
        type: 'object',
        description: '统一错误响应',
        required: ['error', 'message'],
        properties: {
          error: { type: 'string', example: 'BAD_REQUEST', description: '错误码' },
          message: { type: 'string', example: 'Missing required fields: school, studentId, password', description: '错误描述' },
        },
      },
      User: {
        type: 'object',
        properties: {
          userId: { type: 'string', format: 'uuid' },
          school: { type: 'string', example: 'TestUni' },
          studentId: { type: 'string', example: '2024001' },
          role: { type: 'string', enum: ['admin', 'teacher', 'student'] },
          name: { type: 'string', example: '张三' },
        },
      },
      LoginResponse: {
        type: 'object',
        properties: {
          token: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIs...' },
          user: { $ref: '#/components/schemas/User' },
        },
      },
      ClassInfo: {
        type: 'object',
        properties: {
          classId: { type: 'string', format: 'uuid' },
          school: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string', nullable: true },
          createdAt: { type: 'integer', format: 'int64', description: 'Unix 毫秒时间戳' },
        },
      },
      MaterialInfo: {
        type: 'object',
        properties: {
          fileId: { type: 'string', format: 'uuid' },
          originalName: { type: 'string' },
          size: { type: 'integer' },
          uploadedAt: { type: 'integer', format: 'int64' },
          uploadedBy: { type: 'string', format: 'uuid' },
        },
      },
      KnowledgeBaseInfo: {
        type: 'object',
        properties: {
          kbId: { type: 'string', format: 'uuid' },
          classId: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          isDefault: { type: 'boolean' },
          createdAt: { type: 'integer', format: 'int64' },
          chunkSize: { type: 'integer' },
          chunkOverlap: { type: 'integer' },
        },
      },
      KBDocumentInfo: {
        type: 'object',
        properties: {
          documentId: { type: 'string', format: 'uuid' },
          originalName: { type: 'string' },
          chunkCount: { type: 'integer' },
          uploadedAt: { type: 'integer', format: 'int64' },
          status: { type: 'string', enum: ['uploaded', 'indexing', 'ready', 'failed'] },
          indexedAt: { type: 'integer', format: 'int64', nullable: true },
          errorMessage: { type: 'string', nullable: true },
          chunkSize: { type: 'integer' },
          chunkOverlap: { type: 'integer' },
        },
      },
      AgentInfo: {
        type: 'object',
        properties: {
          agentId: { type: 'string', format: 'uuid' },
          classId: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          description: { type: 'string', nullable: true },
          visibility: { type: 'string', enum: ['all', 'teachers'] },
          createdAt: { type: 'integer', format: 'int64' },
          kbIds: { type: 'array', items: { type: 'string', format: 'uuid' } },
          skillIds: { type: 'array', items: { type: 'string', format: 'uuid' } },
          systemPrompt: { type: 'string', nullable: true, description: '仅 teacher/admin 可见' },
        },
      },
      AgentListItem: {
        type: 'object',
        properties: {
          agentId: { type: 'string', format: 'uuid' },
          classId: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          description: { type: 'string', nullable: true },
          visibility: { type: 'string', enum: ['all', 'teachers'] },
          createdAt: { type: 'integer', format: 'int64' },
          kbCount: { type: 'integer' },
          skillCount: { type: 'integer' },
        },
      },
      SkillInfo: {
        type: 'object',
        properties: {
          skillId: { type: 'string', format: 'uuid' },
          classId: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          prompt: { type: 'string', description: '仅 teacher/admin 可见' },
          description: { type: 'string', nullable: true },
          createdAt: { type: 'integer', format: 'int64' },
        },
      },
      ConversationInfo: {
        type: 'object',
        properties: {
          conversationId: { type: 'string', format: 'uuid' },
          agentId: { type: 'string', format: 'uuid' },
          createdAt: { type: 'integer', format: 'int64' },
          lastMessageAt: { type: 'integer', format: 'int64' },
          messageCount: { type: 'integer' },
        },
      },
      ChatMessage: {
        type: 'object',
        properties: {
          messageId: { type: 'string', format: 'uuid' },
          role: { type: 'string', enum: ['user', 'assistant'] },
          content: { type: 'string' },
          citations: { type: 'array', items: { type: 'object' }, nullable: true },
          createdAt: { type: 'integer', format: 'int64' },
        },
      },
    },
    requestBodies: {
      LoginRequest: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['school', 'studentId', 'password'],
              properties: {
                school: { type: 'string', example: 'TestUni', description: '学校标识' },
                studentId: { type: 'string', example: '2024001', description: '学号或工号' },
                password: { type: 'string', example: 'secret123' },
              },
            },
          },
        },
      },
      ChangePasswordRequest: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['oldPassword', 'newPassword'],
              properties: {
                oldPassword: { type: 'string' },
                newPassword: { type: 'string', minLength: 6 },
              },
            },
          },
        },
      },
      CreateUserRequest: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['school', 'studentId', 'password', 'role', 'name'],
              properties: {
                school: { type: 'string' },
                studentId: { type: 'string' },
                password: { type: 'string' },
                role: { type: 'string', enum: ['teacher', 'student'] },
                name: { type: 'string' },
              },
            },
          },
        },
      },
      CreateClassRequest: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name'],
              properties: {
                name: { type: 'string', example: '高等数学' },
                description: { type: 'string', nullable: true },
                school: { type: 'string', description: '仅 admin 可指定，普通 teacher 默认使用自己的学校' },
              },
            },
          },
        },
      },
      AddMemberRequest: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['targetSchool', 'targetStudentId'],
              properties: {
                targetSchool: { type: 'string' },
                targetStudentId: { type: 'string' },
              },
            },
          },
        },
      },
      CreateKBRequest: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name'],
              properties: {
                name: { type: 'string', example: '习题集' },
                chunkSize: { type: 'integer', default: 500 },
                chunkOverlap: { type: 'integer', default: 50 },
              },
            },
          },
        },
      },
      IndexDocumentRequest: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                chunkSize: { type: 'integer' },
                chunkOverlap: { type: 'integer' },
              },
            },
          },
        },
      },
      KBQueryRequest: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['kbIds', 'query'],
              properties: {
                kbIds: { type: 'array', minItems: 1, maxItems: 20, items: { type: 'string', format: 'uuid' } },
                query: { type: 'string', example: '什么是导数？' },
                topK: { type: 'integer', default: 5, maximum: 20 },
              },
            },
          },
        },
      },
      KBQARequest: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['kbIds', 'question'],
              properties: {
                kbIds: { type: 'array', minItems: 1, maxItems: 20, items: { type: 'string', format: 'uuid' } },
                question: { type: 'string', example: '什么是导数？' },
                topK: { type: 'integer', default: 5, maximum: 15 },
              },
            },
          },
        },
      },
      CreateAgentRequest: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name'],
              properties: {
                name: { type: 'string', example: '数学助教' },
                description: { type: 'string', nullable: true },
                systemPrompt: { type: 'string', nullable: true, maxLength: 4000 },
                kbIds: { type: 'array', items: { type: 'string', format: 'uuid' } },
                skillIds: { type: 'array', items: { type: 'string', format: 'uuid' } },
                visibility: { type: 'string', enum: ['all', 'teachers'], default: 'all' },
              },
            },
          },
        },
      },
      UpdateAgentRequest: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string', example: '数学助教' },
                description: { type: 'string', nullable: true },
                systemPrompt: { type: 'string', nullable: true, maxLength: 4000 },
                kbIds: { type: 'array', items: { type: 'string', format: 'uuid' }, description: '传空数组清空关联' },
                skillIds: { type: 'array', items: { type: 'string', format: 'uuid' }, description: '传空数组清空关联' },
                visibility: { type: 'string', enum: ['all', 'teachers'] },
              },
            },
          },
        },
      },
      CreateSkillRequest: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name', 'prompt'],
              properties: {
                name: { type: 'string', example: '公式解释' },
                prompt: { type: 'string', maxLength: 4000, example: '请用通俗语言解释以下数学公式...' },
                description: { type: 'string', nullable: true, maxLength: 500 },
              },
            },
          },
        },
      },
      UpdateSkillRequest: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                prompt: { type: 'string', maxLength: 4000 },
                description: { type: 'string', nullable: true, maxLength: 500 },
              },
            },
          },
        },
      },
      ChatRequest: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['message'],
              properties: {
                message: { type: 'string', example: '帮我讲解一下这个概念' },
                topK: { type: 'integer', default: 5, maximum: 15 },
                conversationId: { type: 'string', format: 'uuid', description: '可选；传入则续接已有会话，不传则新建' },
              },
            },
          },
        },
      },
    },
    responses: {
      BadRequest: {
        description: '请求参数错误',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' }, example: { error: 'BAD_REQUEST', message: 'Missing required fields' } } },
      },
      Unauthorized: {
        description: '未认证或认证失败',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' }, examples: { noToken: { value: { error: 'NO_TOKEN', message: 'Missing or invalid Authorization header' } }, invalidCreds: { value: { error: 'INVALID_CREDENTIALS', message: 'Invalid credentials' } } } } },
      },
      Forbidden: {
        description: '无权限',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' }, example: { error: 'FORBIDDEN', message: 'Forbidden: requires one of roles [admin]' } } },
      },
      NotFound: {
        description: '资源不存在',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' }, example: { error: 'NOT_FOUND', message: 'Resource not found' } } },
      },
      Conflict: {
        description: '资源冲突（如重复创建）',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' }, example: { error: 'CONFLICT', message: 'Already in class' } } },
      },
      InternalError: {
        description: '服务器内部错误',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
      },
      ServiceUnavailable: {
        description: '依赖服务不可用（如 LLM 未配置）',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' }, example: { error: 'SERVICE_UNAVAILABLE', message: 'LLM not configured — set LLM_BASE_URL and LLM_MODEL in .env' } } },
      },
    },
  },
  paths: {},
};

const bearerSecurity = [{ bearerAuth: [] }];

const commonErrors = {
  '400': { $ref: '#/components/responses/BadRequest' },
  '401': { $ref: '#/components/responses/Unauthorized' },
  '403': { $ref: '#/components/responses/Forbidden' },
  '404': { $ref: '#/components/responses/NotFound' },
  '409': { $ref: '#/components/responses/Conflict' },
  '500': { $ref: '#/components/responses/InternalError' },
};

const classIdParam = { name: 'classId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, description: '课程 ID' };
const kbIdParam = { name: 'kbId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, description: '知识库 ID' };
const docIdParam = { name: 'docId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, description: '文档 ID' };
const fileIdParam = { name: 'fileId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, description: '资料文件 ID' };
const agentIdParam = { name: 'agentId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, description: 'Agent ID' };
const skillIdParam = { name: 'skillId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, description: 'Skill ID' };
const conversationIdParam = { name: 'conversationId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, description: '会话 ID' };

const paths: Record<string, any> = {};

// ==================== Health ====================
paths['/api/health'] = {
  get: {
    tags: ['Health'],
    summary: '健康检查',
    description: '公开接口，无需登录。用于检查服务是否正常运行。',
    responses: {
      '200': {
        description: '服务正常',
        content: { 'application/json': { schema: { type: 'object', properties: { status: { type: 'string', example: 'ok' }, time: { type: 'integer', format: 'int64' } } } } },
      },
    },
  },
};

// ==================== Auth ====================
paths['/api/auth/login'] = {
  post: {
    tags: ['Auth'],
    summary: '用户登录',
    description: '公开接口。通过学校 + 学号/工号 + 密码登录，返回 JWT token。',
    requestBody: { $ref: '#/components/requestBodies/LoginRequest' },
    responses: {
      '200': {
        description: '登录成功',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginResponse' } } },
      },
      '400': { $ref: '#/components/responses/BadRequest' },
      '401': { $ref: '#/components/responses/Unauthorized' },
    },
  },
};
paths['/api/auth/change-password'] = {
  post: {
    tags: ['Auth'],
    summary: '修改密码',
    description: '需要 JWT 认证。用户输入旧密码和新密码来更新密码。',
    security: bearerSecurity,
    'x-roles': ['admin', 'teacher', 'student'],
    requestBody: { $ref: '#/components/requestBodies/ChangePasswordRequest' },
    responses: {
      '200': { description: '修改成功', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean', example: true } } } } } },
      '400': { $ref: '#/components/responses/BadRequest' },
      '401': { $ref: '#/components/responses/Unauthorized' },
      '404': { $ref: '#/components/responses/NotFound' },
    },
  },
};

// ==================== Admin ====================
paths['/api/admin/users'] = {
  post: {
    tags: ['Admin'],
    summary: '创建新用户',
    description: '需要 JWT 认证 + admin 角色。创建 teacher 或 student 账户。',
    security: bearerSecurity,
    'x-roles': ['admin'],
    requestBody: { $ref: '#/components/requestBodies/CreateUserRequest' },
    responses: {
      '201': {
        description: '创建成功',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } },
      },
      '400': { $ref: '#/components/responses/BadRequest' },
      '401': { $ref: '#/components/responses/Unauthorized' },
      '403': { $ref: '#/components/responses/Forbidden' },
      '409': { $ref: '#/components/responses/Conflict' },
    },
  },
};

// ==================== Classes ====================
paths['/api/classes/me/classes'] = {
  get: {
    tags: ['Classes'],
    summary: '获取当前用户的课程列表',
    description: '需要 JWT 认证。返回当前用户作为 teacher 和作为 student 所属的所有课程。',
    security: bearerSecurity,
    'x-roles': ['admin', 'teacher', 'student'],
    responses: {
      '200': {
        description: '课程列表',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                asTeacher: { type: 'array', items: { $ref: '#/components/schemas/ClassInfo' } },
                asStudent: { type: 'array', items: { $ref: '#/components/schemas/ClassInfo' } },
              },
            },
          },
        },
      },
      '401': { $ref: '#/components/responses/Unauthorized' },
    },
  },
};

paths['/api/classes/'] = {
  post: {
    tags: ['Classes'],
    summary: '创建课程',
    description: '需要 JWT 认证 + teacher/admin 角色。创建课程的同时自动创建一个默认知识库，并将创建者加入教师名单（admin 除外）。',
    security: bearerSecurity,
    'x-roles': ['teacher', 'admin'],
    requestBody: { $ref: '#/components/requestBodies/CreateClassRequest' },
    responses: {
      '201': {
        description: '创建成功',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                classId: { type: 'string', format: 'uuid' },
                school: { type: 'string' },
                name: { type: 'string' },
                description: { type: 'string', nullable: true },
                memberCount: { type: 'integer' },
                defaultKbId: { type: 'string', format: 'uuid' },
              },
            },
          },
        },
      },
      '400': { $ref: '#/components/responses/BadRequest' },
      '401': { $ref: '#/components/responses/Unauthorized' },
      '403': { $ref: '#/components/responses/Forbidden' },
    },
  },
};

paths['/api/classes/{classId}/teachers'] = {
  post: {
    tags: ['Classes'],
    summary: '添加课程教师',
    description: '需要 JWT 认证 + teacher/admin 角色 + 课程成员。被添加者必须是 teacher 角色，且学校与课程一致。',
    security: bearerSecurity,
    'x-roles': ['teacher', 'admin'],
    parameters: [classIdParam],
    requestBody: { $ref: '#/components/requestBodies/AddMemberRequest' },
    responses: {
      '200': { description: '添加成功', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' } } } } } },
      '400': { $ref: '#/components/responses/BadRequest' },
      '401': { $ref: '#/components/responses/Unauthorized' },
      '403': { description: '无权限 / 学校不匹配', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' }, examples: { forbidden: { value: { error: 'FORBIDDEN', message: '...' } }, schoolMismatch: { value: { error: 'SCHOOL_MISMATCH', message: 'Target school does not match class school' } } } } } },
      '404': { $ref: '#/components/responses/NotFound' },
      '409': { $ref: '#/components/responses/Conflict' },
    },
  },
};

paths['/api/classes/{classId}/students'] = {
  post: {
    tags: ['Classes'],
    summary: '添加课程学生',
    description: '需要 JWT 认证 + teacher/admin 角色 + 课程成员。被添加者必须是 student 角色。',
    security: bearerSecurity,
    'x-roles': ['teacher', 'admin'],
    parameters: [classIdParam],
    requestBody: { $ref: '#/components/requestBodies/AddMemberRequest' },
    responses: {
      '200': { description: '添加成功', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' } } } } } },
      '400': { $ref: '#/components/responses/BadRequest' },
      '401': { $ref: '#/components/responses/Unauthorized' },
      '403': { $ref: '#/components/responses/Forbidden' },
      '404': { $ref: '#/components/responses/NotFound' },
      '409': { $ref: '#/components/responses/Conflict' },
    },
  },
};

paths['/api/classes/{classId}/members'] = {
  get: {
    tags: ['Classes'],
    summary: '获取课程成员列表',
    description: '需要 JWT 认证 + 课程成员。返回教师和学生名单。',
    security: bearerSecurity,
    parameters: [classIdParam],
    responses: {
      '200': {
        description: '成员列表',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                teachers: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: { userId: { type: 'string', format: 'uuid' }, school: { type: 'string' }, studentId: { type: 'string' }, name: { type: 'string' } },
                  },
                },
                students: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: { userId: { type: 'string', format: 'uuid' }, school: { type: 'string' }, studentId: { type: 'string' }, name: { type: 'string' } },
                  },
                },
              },
            },
          },
        },
      },
      '401': { $ref: '#/components/responses/Unauthorized' },
      '404': { $ref: '#/components/responses/NotFound' },
    },
  },
};

// ==================== Materials ====================
paths['/api/classes/{classId}/materials'] = {
  post: {
    tags: ['Materials'],
    summary: '上传课程资料（PDF）',
    description: '需要 JWT 认证 + teacher/admin 角色 + 课程成员。仅支持 PDF 文件，最大 50MB。',
    security: bearerSecurity,
    'x-roles': ['teacher', 'admin'],
    parameters: [classIdParam],
    requestBody: {
      required: true,
      content: {
        'multipart/form-data': {
          schema: {
            type: 'object',
            required: ['file'],
            properties: {
              file: { type: 'string', format: 'binary', description: 'PDF 文件（*.pdf）' },
            },
          },
        },
      },
    },
    responses: {
      '201': {
        description: '上传成功',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                fileId: { type: 'string', format: 'uuid' },
                originalName: { type: 'string' },
                size: { type: 'integer' },
                uploadedAt: { type: 'integer', format: 'int64' },
              },
            },
          },
        },
      },
      '400': { description: '上传错误 / 文件类型不支持', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' }, examples: { noFile: { value: { error: 'NO_FILE', message: 'No file uploaded' } }, uploadErr: { value: { error: 'UPLOAD_ERROR', message: 'Only PDF files are allowed' } } } } } },
      '401': { $ref: '#/components/responses/Unauthorized' },
      '403': { $ref: '#/components/responses/Forbidden' },
      '404': { $ref: '#/components/responses/NotFound' },
    },
  },
  get: {
    tags: ['Materials'],
    summary: '获取课程资料列表',
    description: '需要 JWT 认证 + 课程成员。返回资料文件列表（不含下载内容）。',
    security: bearerSecurity,
    parameters: [classIdParam],
    responses: {
      '200': {
        description: '资料列表',
        content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/MaterialInfo' } } } },
      },
      '401': { $ref: '#/components/responses/Unauthorized' },
    },
  },
};

paths['/api/classes/{classId}/materials/{fileId}'] = {
  get: {
    tags: ['Materials'],
    summary: '下载课程资料',
    description: '需要 JWT 认证 + 课程成员。返回 PDF 文件流（Content-Disposition attachment）。',
    security: bearerSecurity,
    parameters: [classIdParam, fileIdParam],
    responses: {
      '200': {
        description: '文件流',
        content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } },
      },
      '401': { $ref: '#/components/responses/Unauthorized' },
      '404': { description: '资料不存在或文件丢失', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' }, examples: { notFound: { value: { error: 'NOT_FOUND', message: 'Material not found' } }, fileMissing: { value: { error: 'FILE_MISSING', message: 'File not found on disk' } } } } } },
    },
  },
  delete: {
    tags: ['Materials'],
    summary: '删除课程资料',
    description: '需要 JWT 认证 + teacher/admin 角色 + 课程成员。',
    security: bearerSecurity,
    'x-roles': ['teacher', 'admin'],
    parameters: [classIdParam, fileIdParam],
    responses: {
      '200': { description: '删除成功', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' } } } } } },
      '401': { $ref: '#/components/responses/Unauthorized' },
      '403': { $ref: '#/components/responses/Forbidden' },
      '404': { $ref: '#/components/responses/NotFound' },
    },
  },
};

// ==================== KnowledgeBases ====================
paths['/api/classes/{classId}/kbs'] = {
  post: {
    tags: ['KnowledgeBases'],
    summary: '创建知识库',
    description: '需要 JWT 认证 + teacher/admin 角色 + 课程成员。若 name="默认知识库" 则直接返回已存在的默认知识库。',
    security: bearerSecurity,
    'x-roles': ['teacher', 'admin'],
    parameters: [classIdParam],
    requestBody: { $ref: '#/components/requestBodies/CreateKBRequest' },
    responses: {
      '200': { description: '默认知识库已存在（直接返回）', content: { 'application/json': { schema: { $ref: '#/components/schemas/KnowledgeBaseInfo' } } } },
      '201': { description: '创建成功', content: { 'application/json': { schema: { $ref: '#/components/schemas/KnowledgeBaseInfo' } } } },
      '400': { $ref: '#/components/responses/BadRequest' },
      '401': { $ref: '#/components/responses/Unauthorized' },
      '403': { $ref: '#/components/responses/Forbidden' },
      '409': { $ref: '#/components/responses/Conflict' },
    },
  },
  get: {
    tags: ['KnowledgeBases'],
    summary: '获取课程的知识库列表',
    description: '需要 JWT 认证 + 课程成员。',
    security: bearerSecurity,
    parameters: [classIdParam],
    responses: {
      '200': { description: '知识库列表', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/KnowledgeBaseInfo' } } } } },
      '401': { $ref: '#/components/responses/Unauthorized' },
    },
  },
};

paths['/api/classes/{classId}/kbs/{kbId}'] = {
  delete: {
    tags: ['KnowledgeBases'],
    summary: '删除知识库',
    description: '需要 JWT 认证 + teacher/admin 角色 + 课程成员。不能删除默认知识库。',
    security: bearerSecurity,
    'x-roles': ['teacher', 'admin'],
    parameters: [classIdParam, kbIdParam],
    responses: {
      '200': { description: '删除成功', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' } } } } } },
      '400': { description: '不能删除默认知识库', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
      '401': { $ref: '#/components/responses/Unauthorized' },
      '403': { $ref: '#/components/responses/Forbidden' },
      '404': { $ref: '#/components/responses/NotFound' },
    },
  },
};

paths['/api/classes/{classId}/kbs/{kbId}/documents'] = {
  post: {
    tags: ['KnowledgeBases'],
    summary: '上传文档到知识库',
    description: '需要 JWT 认证 + teacher/admin 角色 + 课程成员。支持 PDF、TXT、MD 文件，最大 50MB。上传后文档状态为 uploaded，需调用 index 接口触发向量化。',
    security: bearerSecurity,
    'x-roles': ['teacher', 'admin'],
    parameters: [classIdParam, kbIdParam],
    requestBody: {
      required: true,
      content: {
        'multipart/form-data': {
          schema: {
            type: 'object',
            required: ['file'],
            properties: {
              file: { type: 'string', format: 'binary', description: '支持 .pdf / .txt / .md' },
            },
          },
        },
      },
    },
    responses: {
      '201': {
        description: '上传成功',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                documentId: { type: 'string', format: 'uuid' },
                originalName: { type: 'string' },
                chunkCount: { type: 'integer', example: 0 },
                status: { type: 'string', example: 'uploaded' },
                indexedAt: { type: 'integer', format: 'int64', nullable: true },
                errorMessage: { type: 'string', nullable: true },
              },
            },
          },
        },
      },
      '400': { description: '上传错误 / 文件类型不支持', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
      '401': { $ref: '#/components/responses/Unauthorized' },
      '403': { $ref: '#/components/responses/Forbidden' },
      '404': { $ref: '#/components/responses/NotFound' },
    },
  },
  get: {
    tags: ['KnowledgeBases'],
    summary: '获取知识库中的文档列表',
    description: '需要 JWT 认证 + 课程成员。',
    security: bearerSecurity,
    parameters: [classIdParam, kbIdParam],
    responses: {
      '200': { description: '文档列表', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/KBDocumentInfo' } } } } },
      '401': { $ref: '#/components/responses/Unauthorized' },
      '404': { $ref: '#/components/responses/NotFound' },
    },
  },
};

paths['/api/classes/{classId}/kbs/{kbId}/documents/{docId}'] = {
  delete: {
    tags: ['KnowledgeBases'],
    summary: '删除知识库中的文档',
    description: '需要 JWT 认证 + teacher/admin 角色 + 课程成员。不能删除正在索引的文档。',
    security: bearerSecurity,
    'x-roles': ['teacher', 'admin'],
    parameters: [classIdParam, kbIdParam, docIdParam],
    responses: {
      '200': { description: '删除成功', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' } } } } } },
      '401': { $ref: '#/components/responses/Unauthorized' },
      '403': { $ref: '#/components/responses/Forbidden' },
      '404': { $ref: '#/components/responses/NotFound' },
      '409': { description: '文档正在索引中', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' }, example: { error: 'INDEXING', message: 'Cannot delete document while indexing' } } } },
    },
  },
};

paths['/api/classes/{classId}/kbs/{kbId}/documents/{docId}/index'] = {
  post: {
    tags: ['KnowledgeBases'],
    summary: '触发单个文档的索引（向量化）',
    description: '需要 JWT 认证 + teacher/admin 角色 + 课程成员。异步任务，返回 taskId 。文档状态变为 indexing ，完成后变为 ready。',
    security: bearerSecurity,
    'x-roles': ['teacher', 'admin'],
    parameters: [classIdParam, kbIdParam, docIdParam],
    requestBody: { $ref: '#/components/requestBodies/IndexDocumentRequest' },
    responses: {
      '202': {
        description: '已入队索引任务',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                taskId: { type: 'string', format: 'uuid' },
                documentId: { type: 'string', format: 'uuid' },
                status: { type: 'string', example: 'indexing' },
              },
            },
          },
        },
      },
      '401': { $ref: '#/components/responses/Unauthorized' },
      '403': { $ref: '#/components/responses/Forbidden' },
      '404': { $ref: '#/components/responses/NotFound' },
      '409': { description: '文档已在索引中', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' }, example: { error: 'INDEXING', message: 'Document is already indexing' } } } },
    },
  },
};

paths['/api/classes/{classId}/kbs/{kbId}/index-all'] = {
  post: {
    tags: ['KnowledgeBases'],
    summary: '触发知识库中所有未就绪文档的批量索引',
    description: '需要 JWT 认证 + teacher/admin 角色 + 课程成员。',
    security: bearerSecurity,
    'x-roles': ['teacher', 'admin'],
    parameters: [classIdParam, kbIdParam],
    responses: {
      '202': {
        description: '已入队批量索引任务',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                taskIds: { type: 'array', items: { type: 'string', format: 'uuid' } },
                enqueued: { type: 'integer', example: 3 },
              },
            },
          },
        },
      },
      '401': { $ref: '#/components/responses/Unauthorized' },
      '403': { $ref: '#/components/responses/Forbidden' },
      '404': { $ref: '#/components/responses/NotFound' },
    },
  },
};

paths['/api/classes/{classId}/kbs/query'] = {
  post: {
    tags: ['KnowledgeBases'],
    summary: '知识库向量查询（返回相关文档片段）',
    description: '需要 JWT 认证 + 课程成员。传入 query 文本，返回语义最相关的文档 chunk。不依赖 LLM 配置。',
    security: bearerSecurity,
    parameters: [classIdParam],
    requestBody: { $ref: '#/components/requestBodies/KBQueryRequest' },
    responses: {
      '200': {
        description: '查询结果（chunk 列表）',
        content: {
          'application/json': {
            schema: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  chunk: { type: 'string' },
                  distance: { type: 'number' },
                  documentId: { type: 'string', format: 'uuid' },
                  originalName: { type: 'string' },
                  chunkIndex: { type: 'integer' },
                  startOffset: { type: 'integer' },
                  endOffset: { type: 'integer' },
                },
              },
            },
          },
        },
      },
      '400': { $ref: '#/components/responses/BadRequest' },
      '401': { $ref: '#/components/responses/Unauthorized' },
    },
  },
};

paths['/api/classes/{classId}/kbs/qa'] = {
  post: {
    tags: ['KnowledgeBases'],
    summary: 'RAG 问答（基于 LLM 生成答案）',
    description: '需要 JWT 认证 + teacher/admin 角色 + 课程成员。需要 LLM 已配置（LLM_BASE_URL + LLM_MODEL）。LLM 返回异常时返回 502。',
    security: bearerSecurity,
    'x-roles': ['teacher', 'admin'],
    parameters: [classIdParam],
    requestBody: { $ref: '#/components/requestBodies/KBQARequest' },
    responses: {
      '200': { description: '问答结果', content: { 'application/json': { schema: { type: 'object' } } } },
      '400': { $ref: '#/components/responses/BadRequest' },
      '401': { $ref: '#/components/responses/Unauthorized' },
      '403': { $ref: '#/components/responses/Forbidden' },
      '502': { description: 'LLM API 错误', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' }, example: { error: 'LLM_ERROR', message: '...' } } } },
      '503': { $ref: '#/components/responses/ServiceUnavailable' },
    },
  },
};

// ==================== Skills ====================
paths['/api/classes/{classId}/skills'] = {
  post: {
    tags: ['Skills'],
    summary: '创建 Skill（可被 Agent 组合的 Prompt）',
    description: '需要 JWT 认证 + teacher/admin 角色 + 课程成员。',
    security: bearerSecurity,
    'x-roles': ['teacher', 'admin'],
    parameters: [classIdParam],
    requestBody: { $ref: '#/components/requestBodies/CreateSkillRequest' },
    responses: {
      '201': { description: '创建成功', content: { 'application/json': { schema: { $ref: '#/components/schemas/SkillInfo' } } } },
      '400': { $ref: '#/components/responses/BadRequest' },
      '401': { $ref: '#/components/responses/Unauthorized' },
      '403': { $ref: '#/components/responses/Forbidden' },
      '409': { $ref: '#/components/responses/Conflict' },
    },
  },
  get: {
    tags: ['Skills'],
    summary: '获取课程的 Skill 列表',
    description: '需要 JWT 认证 + 课程成员。返回时不包含 prompt 字段（prompt 仅 teacher/admin 在详情中可见）。',
    security: bearerSecurity,
    parameters: [classIdParam],
    responses: {
      '200': {
        description: 'Skill 列表（不含 prompt）',
        content: {
          'application/json': {
            schema: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  skillId: { type: 'string', format: 'uuid' },
                  classId: { type: 'string', format: 'uuid' },
                  name: { type: 'string' },
                  description: { type: 'string', nullable: true },
                  createdAt: { type: 'integer', format: 'int64' },
                },
              },
            },
          },
        },
      },
      '401': { $ref: '#/components/responses/Unauthorized' },
    },
  },
};

paths['/api/classes/{classId}/skills/{skillId}'] = {
  get: {
    tags: ['Skills'],
    summary: '获取 Skill 详情',
    description: '需要 JWT 认证 + 课程成员。prompt 字段仅 teacher/admin 可见。',
    security: bearerSecurity,
    parameters: [classIdParam, skillIdParam],
    responses: {
      '200': { description: 'Skill 详情', content: { 'application/json': { schema: { $ref: '#/components/schemas/SkillInfo' } } } },
      '401': { $ref: '#/components/responses/Unauthorized' },
      '404': { $ref: '#/components/responses/NotFound' },
    },
  },
  put: {
    tags: ['Skills'],
    summary: '更新 Skill',
    description: '需要 JWT 认证 + teacher/admin 角色 + 课程成员。',
    security: bearerSecurity,
    'x-roles': ['teacher', 'admin'],
    parameters: [classIdParam, skillIdParam],
    requestBody: { $ref: '#/components/requestBodies/UpdateSkillRequest' },
    responses: {
      '200': { description: '更新成功', content: { 'application/json': { schema: { $ref: '#/components/schemas/SkillInfo' } } } },
      '400': { $ref: '#/components/responses/BadRequest' },
      '401': { $ref: '#/components/responses/Unauthorized' },
      '403': { $ref: '#/components/responses/Forbidden' },
      '404': { $ref: '#/components/responses/NotFound' },
      '409': { $ref: '#/components/responses/Conflict' },
    },
  },
  delete: {
    tags: ['Skills'],
    summary: '删除 Skill',
    description: '需要 JWT 认证 + teacher/admin 角色 + 课程成员。删除时会自动解除与 Agent 的关联。',
    security: bearerSecurity,
    'x-roles': ['teacher', 'admin'],
    parameters: [classIdParam, skillIdParam],
    responses: {
      '200': { description: '删除成功', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' } } } } } },
      '401': { $ref: '#/components/responses/Unauthorized' },
      '403': { $ref: '#/components/responses/Forbidden' },
      '404': { $ref: '#/components/responses/NotFound' },
    },
  },
};

// ==================== Agents ====================
paths['/api/classes/{classId}/agents'] = {
  post: {
    tags: ['Agents'],
    summary: '创建 Agent',
    description: '需要 JWT 认证 + teacher/admin 角色 + 课程成员。visibility=teachers 仅 teacher/admin 可见；visibility=all 所有人可见。systemPrompt 最大 4000 字符。',
    security: bearerSecurity,
    'x-roles': ['teacher', 'admin'],
    parameters: [classIdParam],
    requestBody: { $ref: '#/components/requestBodies/CreateAgentRequest' },
    responses: {
      '201': { description: '创建成功', content: { 'application/json': { schema: { $ref: '#/components/schemas/AgentInfo' } } } },
      '400': { $ref: '#/components/responses/BadRequest' },
      '401': { $ref: '#/components/responses/Unauthorized' },
      '403': { $ref: '#/components/responses/Forbidden' },
      '409': { $ref: '#/components/responses/Conflict' },
    },
  },
  get: {
    tags: ['Agents'],
    summary: '获取课程的 Agent 列表',
    description: '需要 JWT 认证 + 课程成员。teacher/admin 可看全部；普通 student 只能看 visibility=all 的 Agent。返回列表不含 systemPrompt。',
    security: bearerSecurity,
    parameters: [classIdParam],
    responses: {
      '200': { description: 'Agent 列表', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/AgentListItem' } } } } },
      '401': { $ref: '#/components/responses/Unauthorized' },
    },
  },
};

paths['/api/classes/{classId}/agents/{agentId}'] = {
  get: {
    tags: ['Agents'],
    summary: '获取 Agent 详情',
    description: '需要 JWT 认证 + 课程成员。visibility=teachers 对 student 不可见（返回 404）。systemPrompt 仅 teacher/admin 可见。',
    security: bearerSecurity,
    parameters: [classIdParam, agentIdParam],
    responses: {
      '200': { description: 'Agent 详情', content: { 'application/json': { schema: { $ref: '#/components/schemas/AgentInfo' } } } },
      '401': { $ref: '#/components/responses/Unauthorized' },
      '404': { $ref: '#/components/responses/NotFound' },
    },
  },
  put: {
    tags: ['Agents'],
    summary: '更新 Agent',
    description: '需要 JWT 认证 + teacher/admin 角色 + 课程成员。kbIds / skillIds 传空数组可清空关联。',
    security: bearerSecurity,
    'x-roles': ['teacher', 'admin'],
    parameters: [classIdParam, agentIdParam],
    requestBody: { $ref: '#/components/requestBodies/UpdateAgentRequest' },
    responses: {
      '200': { description: '更新成功', content: { 'application/json': { schema: { $ref: '#/components/schemas/AgentInfo' } } } },
      '400': { $ref: '#/components/responses/BadRequest' },
      '401': { $ref: '#/components/responses/Unauthorized' },
      '403': { $ref: '#/components/responses/Forbidden' },
      '404': { $ref: '#/components/responses/NotFound' },
      '409': { $ref: '#/components/responses/Conflict' },
    },
  },
  delete: {
    tags: ['Agents'],
    summary: '删除 Agent',
    description: '需要 JWT 认证 + teacher/admin 角色 + 课程成员。',
    security: bearerSecurity,
    'x-roles': ['teacher', 'admin'],
    parameters: [classIdParam, agentIdParam],
    responses: {
      '200': { description: '删除成功', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' } } } } } },
      '401': { $ref: '#/components/responses/Unauthorized' },
      '403': { $ref: '#/components/responses/Forbidden' },
      '404': { $ref: '#/components/responses/NotFound' },
    },
  },
};

// ==================== AgentMessages ====================
paths['/api/classes/{classId}/agents/{agentId}/chat'] = {
  post: {
    tags: ['AgentMessages'],
    summary: '与 Agent 进行流式聊天（SSE）',
    description:
      '需要 JWT 认证 + 课程成员。需要 LLM 已配置。返回 Server-Sent Events 流，事件类型包括：\n- `data: {"type":"message","content":"..."}` — 增量文字片段\n- `data: {"type":"done","conversationId":"...","answer":"完整答案","citations":[...]}` — 流结束\n- `data: {"type":"error","message":"..."}` — 错误\n\nSwagger UI 对 SSE 支持有限；如需更好体验，建议用 curl / Postman 测试。',
    security: bearerSecurity,
    parameters: [classIdParam, agentIdParam],
    requestBody: { $ref: '#/components/requestBodies/ChatRequest' },
    responses: {
      '200': {
        description: 'SSE 事件流',
        content: {
          'text/event-stream': {
            schema: { type: 'string', description: 'SSE 事件流，每个 `data:` 行是 JSON 对象' },
            example: 'data: {"type":"message","content":"你好"}\n\ndata: {"type":"done","conversationId":"...","answer":"完整答案","citations":[]}\n\n',
          },
        },
      },
      '400': { $ref: '#/components/responses/BadRequest' },
      '401': { $ref: '#/components/responses/Unauthorized' },
      '404': { $ref: '#/components/responses/NotFound' },
      '502': { description: 'LLM API 错误', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
      '503': { $ref: '#/components/responses/ServiceUnavailable' },
    },
  },
};

paths['/api/classes/{classId}/agents/{agentId}/conversations'] = {
  get: {
    tags: ['AgentMessages'],
    summary: '获取当前用户与该 Agent 的会话列表',
    description: '需要 JWT 认证 + 课程成员。visibility=teachers 对 student 不可见。',
    security: bearerSecurity,
    parameters: [classIdParam, agentIdParam],
    responses: {
      '200': { description: '会话列表', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/ConversationInfo' } } } } },
      '401': { $ref: '#/components/responses/Unauthorized' },
      '404': { $ref: '#/components/responses/NotFound' },
    },
  },
};

paths['/api/classes/{classId}/agents/{agentId}/conversations/{conversationId}/messages'] = {
  get: {
    tags: ['AgentMessages'],
    summary: '获取会话的完整消息历史',
    description: '需要 JWT 认证 + 课程成员 + 会话所有者（user 维度）。',
    security: bearerSecurity,
    parameters: [classIdParam, agentIdParam, conversationIdParam],
    responses: {
      '200': { description: '消息列表', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/ChatMessage' } } } } },
      '401': { $ref: '#/components/responses/Unauthorized' },
      '404': { $ref: '#/components/responses/NotFound' },
    },
  },
};

(openApiDocument as any).paths = paths;

export const swaggerUiOptions = {
  explorer: true,
  customSiteTitle: 'CampusClaw API Docs',
};