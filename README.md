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
# 联网搜索 toolkit：Chromium 本体（Linux 生产机还需系统依赖，见下方生产部署）
pnpm --filter @agent-next/api exec playwright install chromium
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
- **工作流**：在 `apps/api/src/workflow/workflows/` 用 `createWorkflow` 定义，启动时自动同步到数据库（内置：时间查询、晨间简报、调研摘要、待办催办）

## 生产部署（PM2 + Nginx Proxy Manager）

本机用 PM2 跑应用；域名、HTTPS、对外入口在 **Nginx Proxy Manager** 面板里配置。

| 进程 | 作用 | 端口 |
|------|------|------|
| `agent-next-api` | Nest API | `3003` |
| `agent-next-web` | 静态前端，并把 `/api` 转到 API | `5180` |

NPM 只反代到 **`5180`** 即可（页面和 `/api` 都走这个口）。

### 1. 服务器准备与构建

```bash
npm i -g pnpm pm2          # 这里的 npm 是 Node 包管理器
git clone https://github.com/gongzhaoman0426/agent.git
cd agent
docker compose up -d
cp apps/api/.env.example apps/api/.env
```

编辑 `apps/api/.env`，认证地址填**最终给用户访问的域名**（NPM 配好的那个）：

```bash
DEEPSEEK_API_KEY=你的key
BETTER_AUTH_SECRET=换成足够长的随机串
PORT=3003
BETTER_AUTH_URL=https://agent.example.com
BETTER_AUTH_TRUSTED_ORIGINS=https://agent.example.com
```

```bash
pnpm install
# 联网搜索：下载 Chromium；Linux 还需系统库（缺 libatk 等会启动失败）
pnpm --filter @agent-next/api exec playwright install chromium
sudo pnpm --filter @agent-next/api exec playwright install-deps chromium
pnpm db:generate          # 必须先于 build
pnpm db:push
pnpm build
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
pm2 status                # api / web 都 online
```

若联网搜索报 `libatk-1.0.so.0: cannot open shared object file`，说明只装了浏览器、没装系统依赖，在项目根目录重新执行上面的 `install-deps`，然后 `pm2 restart agent-next-api`。

先本机验证：`http://服务器IP:5180` 能打开再去配 NPM。

### 2. Nginx Proxy Manager 面板

**Hosts → Proxy Hosts → Add Proxy Host：**

| 项 | 填法 |
|----|------|
| Domain Names | `agent.example.com`（你的域名） |
| Scheme | `http` |
| Forward Hostname / IP | 宿主机地址。NPM 若在 Docker 里，常用 `172.17.0.1` 或宿主机局域网 IP，不要填 `127.0.0.1`（那是容器自己） |
| Forward Port | `5180` |
| Websockets Support | 建议打开 |
| Block Common Exploits | 可选 |
| SSL | 选 Let's Encrypt 或已有证书，勾选 Force SSL |

保存后用 `https://agent.example.com` 访问。

聊天是 SSE 长连接，若出现流式中断，在该 Proxy Host 的 **Advanced** 里可加：

```nginx
proxy_buffering off;
proxy_read_timeout 3600s;
```

### 3. 更新发布

```bash
cd /root/apps/agent   # 按你的路径
git pull
pnpm install
pnpm db:generate
pnpm db:push              # schema 有变更时
pnpm build
pm2 restart all
```

技能文件在 `apps/api/data/skills/`，备份时保留。NPM 侧一般不用改。

## 常用命令

```bash
pnpm dev:api / pnpm dev:web
pnpm db:generate && pnpm db:push
pnpm build
pnpm start:web                 # 仅前端静态服务（含 /api 反代）
pm2 start ecosystem.config.cjs # API + 前端；对外用 Nginx Proxy Manager
```
