# agent-next

AI Agent 编排平台（Mastra 重写版）。NestJS (ESM) + Mastra 后端，React + TanStack Router 前端。

## 相比 agent/ 的核心变化

- **LLM 引擎**：LlamaIndex → Mastra（Agent 实例缓存、原生 Memory 语义召回、无状态工具）
- **Skill**：数据库记录 → 标准 `skills/<name>/SKILL.md` 文件
- **工作流**：JSON DSL + `new Function()` → Mastra 原生 `createWorkflow`，挂载后自动注册为 `workflow-<id>` 工具
- **会话/记忆**：自建 ChatSession/ChatMessage/摘要压缩 → Mastra Memory（Postgres 存储 + 语义召回）

## 结构

```
apps/
├── api/    # NestJS 11 (ESM) + Mastra，port 3003，前缀 /api
└── web/    # React 19 + Vite + TanStack Router，port 5180
```

## 快速开始

```bash
docker compose up -d        # PostgreSQL (pgvector)，port 5434
pnpm install
cp apps/api/.env.example apps/api/.env   # 填入 OPENAI_API_KEY
pnpm db:push                # 初始化业务表
pnpm dev:api                # 后端
pnpm dev:web                # 前端
```

## 环境变量（apps/api/.env）

- `DATABASE_URL` — PostgreSQL 连接串
- `OPENAI_API_KEY` / `OPENAI_BASE_URL` — 模型 API
- `MASTRA_DEFAULT_MODEL` — 默认模型（`openai/gpt-5.5`）
- `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` / `BETTER_AUTH_TRUSTED_ORIGINS` — 认证
