# CLAUDE.md

## Project Overview

AI Agent 编排平台，支持多智能体对话、工具调用、知识库 RAG、工作流编排。pnpm monorepo 架构。

## Tech Stack

- **Backend**: NestJS 10 + TypeScript 5.7 + Prisma (PostgreSQL + pgvector)
- **Frontend**: React 19 + Vite 6 + Tailwind CSS 4 + Radix UI + TanStack React Query
- **LLM**: LlamaIndex (Anthropic Claude Sonnet 4.6 + OpenAI text-embedding-3-small)
- **Workflow**: Temporal
- **Cache**: Redis (ioredis)
- **Auth**: better-auth
- **Runtime**: Node.js >=20, pnpm 10.4.1

## Monorepo Structure

```
apps/
├── agent-api/          # NestJS 后端 (port 3001, prefix /api)
│   ├── src/
│   │   ├── agent/      # Agent CRUD、对话、流式响应、聊天记忆
│   │   ├── tool/       # Toolkit 发现、注册、实例化
│   │   ├── workflow/   # DSL 工作流定义与生成
│   │   ├── temporal/   # Temporal workflow/activity 执行
│   │   ├── knowledge-base/  # 知识库管理、文件处理、向量检索
│   │   ├── llamaindex/ # LLM 初始化与 agent 创建
│   │   ├── auth/       # 认证 (better-auth + JWT guard)
│   │   ├── redis/      # 缓存服务
│   │   ├── prisma/     # 数据库 ORM
│   │   ├── mcp/        # Model Context Protocol
│   │   └── health/     # 健康检查
│   └── prisma/
│       └── schema.prisma
└── agent-web/          # React 前端 (port 5179)
    └── src/
        ├── pages/      # Agents, Workflows, KnowledgeBases, Toolkits, Login
        ├── components/ # chat/ (对话界面), manage/ (管理界面)
        ├── ui/         # shadcn/ui 组件
        ├── hooks/      # 自定义 hooks
        ├── services/   # API 调用层
        └── lib/        # 工具函数
```

## Common Commands

```bash
# 开发
pnpm dev:api              # 启动后端 (watch mode)
pnpm dev:web              # 启动前端 (vite dev server)

# 构建 & 检查
pnpm build                # 构建前后端
pnpm typecheck            # 类型检查
pnpm lint                 # ESLint 检查

# 数据库
pnpm db:generate          # 生成 Prisma Client
pnpm db:migrate           # 执行数据库迁移
pnpm db:seed              # 填充种子数据

# 后端独立命令 (在 apps/ag)
pnpm test                 # Jest 测试
pnpm test:cov             # 测试覆盖率
pnpm db:studio            # Prisma Studio (数据库 GUI)

# Docker
docker compose up -d      # 启动基础设施 (PostgreSQL, Redis, Temporal)
```

## Key Architecture Patterns

### Agent 生命周期

每次对话请求都会：获取 Agent 配置 → 解析 Toolkit → 实例化 Tool → 创建 LlamaIndex agent → 执行对话。Agent 实例是无状态的，不跨请求复用。

### 聊天记忆 (ChatMemoryService)

三层记忆：
1. 历史裁剪：取最近 10 条消息作为 chatHistory
2. RAG 检索：跨 session 向量检索相关历史（pgvector，top 20 → 过滤 → score>0.9 或 top 6）
3. Prompt 增强：将检索结果拼接到 system prompt

对话结束后异步向量化 Q&A 对（fire-and-forget）。

### Toolkit 系统

`@toolkitId` 装饰器注册，启动时自动发现并同步到数据库。每个 Toolkit 继承 `BaseToolkit`，实现 `initTools()` 和 `validateSettings()`。内置 Toolkit：
- `common-toolkit-01` — 时间查询、等待（所有 Agent 默认挂载）
- `tool-explorer` — 工具发现
- `knowledge-base-toolkit` / `knowledge-base-explorer` — 知识库查询
- `workflow-toolkit` — 工作流执行
- `feishu-bitable-toolkit` — 飞书多维表格

### Workflow DSL

工作流通过事件链驱动：`WORKFLOW_START → 自定义事件 → WORKFLOW_STOP`。每个 step 的 `handle` 是一个 async function 字符串，在 Temporal activity 中通过 `new Function()` 执行。DSL 中可定义专属 agent 和 tool。

### 流式响应 (SSE)

`POST /api/agents/:id/chat/stream` 返回 SSE 事件流，事件类型：`tool_call` → `tool_result` → `delta` (文本增量) → `done`。

## Database

PostgreSQL 15 + pgvector 扩展。核心表：
- `Agent` — 智能体定义 (prompt, options, soft delete)
- `Toolkit` / `Tool` — 工具注册表
- `AgentToolkit` / `AgentTool` — Agent 与工具的关联
- `WorkFlow` / `WorkflowAgent` — 工作流 DSL 与关联 Agent
- `KnowledgeBase` / `File` — 知识库与文件 (状态机: PENDING→PROCESSING→PROCESSED/FAILED)
- `ChatSession` / `ChatMessage` — 对话历史
- `UserToolkitSettings` — 用户级工具配置
- `llamaindex_embedding` — 向量存储表 (LlamaIndex 自动管理)

## Environment Variables

参考 `apps/agent-api/.env.example`：
- `DATABASE_URL` — PostgreSQL 连接串
- `REDIS_URL` — Redis 连接串
- `ANTHROPIC_API_KEY` / `ANTHROPIC_BASE_URL` — Anthropic API
- `OPENAI_API_KEY` / `OPENAI_BASE_URL` — OpenAI Embedding API
- `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` / `BETTER_AUTH_TRUSTED_ORIGINS` — 认证配置
- `LLAMA_CLOUD_API_KEY` — LlamaCloud (可选)

## Infrastructure (Docker Compose)

- PostgreSQL 15 (pgvector) — port 5432
- Redis 7 — port 6379
- Temporal DB (PostgreSQL) — port 5433
- Temporal Server — port 7233
- Temporal UI — port 8080

## Code Conventions

- 后端使用 NestJS 模块化架构：每个功能域一个 Module/Controller/Service
- 前端使用 shadcn/ui 组件库，路径别名 `@/*` → `src/*`
- API 全局前缀 `/api`，全局 ValidationPipe (whitelist + transform)
- Redis 缓存使用 `getOrSet` 模式，TTL 单位为秒
- Toolkit 工具方法用 `FunctionTool.from()` 包装，参数用 JSON Schema 描述
- 数据库软删除 (`deleted: Boolean @default(false)`)
- 中文注释和日志为主
