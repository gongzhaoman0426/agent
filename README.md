# agent-next

AI Agent 编排平台（Mastra 重写版）。NestJS (ESM) + Mastra 后端，React + TanStack Router 前端。

## 相比 agent/ 的核心变化

- **LLM 引擎**：LlamaIndex → Mastra（Agent 实例缓存、原生 Memory 语义召回、无状态工具）
- **Skill**：数据库记录 → 用户上传技能压缩包，平台解压存储（`apps/api/data/skills/<ownerId>/<name>/`），元数据入库
- **工作流**：JSON DSL + `new Function()` → Mastra 原生 `createWorkflow`，挂载后自动注册为 `workflow-<id>` 工具
- **会话/记忆**：自建 ChatSession/ChatMessage/摘要压缩 → Mastra Memory（Postgres 存储，独立 `mastra` schema；语义召回可选开启）

## 技能包格式

前端「技能」页上传 zip（≤ 20MB），结构如下（可包一层顶层目录）：

```
your-skill.zip
├── SKILL.md        # 必需，frontmatter 含 name/description
├── scripts/        # 可选，.js 脚本（vm 沙箱执行）
└── references/     # 可选，激活时附带的参考资料
```

技能归属上传用户，挂载到智能体后自动附带 `use_skill` 工具按需激活。

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
- `MASTRA_DEFAULT_MODEL` — 默认模型（`openai/gpt-5.6-luna`）
- `MASTRA_TITLE_MODEL` — 会话标题生成模型，默认同主模型（收尾阶段异步执行，不阻塞回复）
- `MASTRA_SEMANTIC_RECALL` — 跨会话语义召回，默认 `false`。开启后每轮提问和每条落库消息都要调 embedding 接口（第三方代理下实测每次 2~9s），响应会明显变慢
- `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` / `BETTER_AUTH_TRUSTED_ORIGINS` — 认证
