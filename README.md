# agent-next

基于 Mastra 的 AI Agent 编排平台。创建智能体、挂载工具包 / 工作流 / 技能，并在线对话。

- 后端：NestJS 11（ESM）+ Mastra + Prisma
- 前端：React 19 + Vite + TanStack Router
- 认证：better-auth
- 存储：PostgreSQL（业务表 Prisma；会话记忆走 Mastra，独立 `mastra` schema）

## 目录结构

```
apps/
├── api/    # NestJS + Mastra，默认 http://localhost:3003，路由前缀 /api
└── web/    # React SPA，默认 http://localhost:5180
```

主要模块：

| 模块 | 说明 |
|------|------|
| Agent | 智能体编排与聊天（流式） |
| Toolkit | 代码注册的工具包，支持用户级 settings |
| Workflow | Mastra `createWorkflow`，挂载后暴露为 `workflow-<id>` 工具 |
| Skill | 用户上传技能包，挂载后按需 `use_skill` 激活 |
| Memory | Mastra Memory，默认保留最近消息；可选语义召回 |

## 快速开始

要求：Node.js ≥ 22.13、pnpm、Docker。

```bash
docker compose up -d
pnpm install
cp apps/api/.env.example apps/api/.env   # 填入 DEEPSEEK_API_KEY
pnpm db:push
pnpm dev:api
pnpm dev:web
```

打开 http://localhost:5180 即可使用。

## 环境变量

配置文件：`apps/api/.env`（可参考 `.env.example`）。

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | PostgreSQL 连接串（compose 默认端口 `5434`） |
| `PORT` | API 端口，默认 `3003` |
| `DEEPSEEK_API_KEY` | DeepSeek 官方 API Key |
| `MASTRA_DEFAULT_MODEL` | 默认对话模型，默认 `deepseek/deepseek-v4-flash` |
| `MASTRA_TITLE_MODEL` | 会话标题模型，默认同主模型 |
| `MASTRA_SEMANTIC_RECALL` | 跨会话语义召回，默认 `false`；开启时还需配置 embedding |
| `BETTER_AUTH_SECRET` | 认证密钥 |
| `BETTER_AUTH_URL` | 认证服务地址 |
| `BETTER_AUTH_TRUSTED_ORIGINS` | 允许的前端来源 |

语义召回关闭时不需要 embedding。若设置 `MASTRA_SEMANTIC_RECALL=true`，还需：

```bash
MASTRA_EMBEDDING_MODEL=openai/text-embedding-3-small
OPENAI_API_KEY=
# 可选 OPENAI_BASE_URL=
```

## 技能包

在「技能」页上传 zip（≤ 20MB），结构如下（可多一层顶层目录）：

```
your-skill.zip
├── SKILL.md        # 必需，frontmatter 含 name / description
├── scripts/        # 可选，.js（vm 沙箱执行）
└── references/     # 可选，激活时附带的参考资料
```

上传后落盘到 `apps/api/data/skills/<ownerId>/<name>/`，元数据入库。技能卡片进入编辑页可改文件，也可用右侧 AI 编辑助手。

技能名由 `SKILL.md` frontmatter 决定，在线不可改名；改名需重新上传。

## 扩展

- **工具包**：在 `apps/api/src/toolkit/toolkits/` 新增并注册 Provider
- **工作流**：在 `apps/api/src/workflow/workflows/` 用 `createWorkflow` 定义，启动时自动同步到数据库

## 常用命令

```bash
pnpm dev:api          # 启动 API
pnpm dev:web          # 启动前端
pnpm db:push          # 同步 Prisma schema
pnpm db:generate      # 生成 Prisma Client
pnpm typecheck        # 全仓类型检查
pnpm build            # 构建
```
