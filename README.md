# AI Agent Project

AI Agent 编排平台（pnpm monorepo），包含：
- `apps/agent-api`：NestJS 后端（默认 `3001`）
- `apps/agent-web`：React + Vite 前端（开发默认 `5179`）

## 环境要求

- Node.js >= `20`
- pnpm `10.4.1`
- Docker + Docker Compose

## 目录结构

```text
apps/
  agent-api/
  agent-web/
docker-compose.yml
docker-compose.prod.yml
```

## 本地启动（推荐开发方式）

### 1) 安装依赖

```bash
pnpm install
```

### 2) 准备环境变量

```bash
cp apps/agent-api/.env.example apps/agent-api/.env
```

然后按需修改 `apps/agent-api/.env`（API Key、数据库连接等）。

### 3) 启动基础设施（Postgres / Redis / Temporal）

```bash
docker compose up -d postgres redis temporal-db temporal temporal-ui
```

本地端口：
- PostgreSQL: `5432`
- Redis: `6379`
- Temporal: `7233`
- Temporal UI: `http://localhost:8080`

### 4) 执行数据库迁移

```bash
pnpm db:migrate
```

### 5) 启动前后端开发服务

```bash
pnpm dev
```

访问地址：
- 前端: `http://localhost:5179`
- 后端健康检查: `http://localhost:3001/api/health`

## 本地一键 Docker（非热更新）

```bash
docker compose up -d --build
```

访问地址：
- 前端: `http://localhost:5179`
- 后端: `http://localhost:3001`

## 服务端部署（生产）

`docker-compose.prod.yml` 设计目标：
- 服务端拉代码后可一键部署
- 前后端对外暴露
- 数据库/缓存/Temporal 不对公网暴露（仅容器内网络可访问）

### 1) 拉取代码

```bash
git clone <your-repo-url>
cd project-repo
```

### 2) 准备生产环境变量

创建 `apps/agent-api/.env.prod`（可参考 `apps/agent-api/.env`），至少保证以下关键项正确：

```env
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/hackathon
REDIS_URL=redis://redis:6379
TEMPORAL_ADDRESS=temporal:7233
BETTER_AUTH_URL=http://<your-domain-or-ip>:3001
BETTER_AUTH_TRUSTED_ORIGINS=http://<your-domain-or-ip>
```

说明：
- `@postgres`、`@redis`、`temporal:7233` 是容器网络地址，生产 compose 下应保持这样。
- `BETTER_AUTH_URL` 和 `BETTER_AUTH_TRUSTED_ORIGINS` 请替换成你的公网域名/IP。

### 3) 一键部署

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

默认暴露端口：
- Web: `80`
- API: `3001`

如有端口冲突，可改为：

```bash
WEB_PUBLIC_PORT=8088 API_PUBLIC_PORT=13001 docker compose -f docker-compose.prod.yml up -d --build
```

### 4) 检查服务

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f agent-api
```

健康检查：

```bash
curl http://127.0.0.1:3001/api/health
```

## 更新部署

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

## 停止与清理

停止服务：

```bash
docker compose -f docker-compose.prod.yml down
```

停止并删除数据卷（会清空数据库数据）：

```bash
docker compose -f docker-compose.prod.yml down -v
```

## 常见问题

### `pnpm db:migrate` 报 `P1001: Can't reach database server`

原因：`apps/agent-api/.env` 里的 `DATABASE_URL` 指向 `localhost:5432`，但本地 Postgres 没有启动。  
先启动数据库容器再迁移：

```bash
docker compose up -d postgres
pnpm db:migrate
```

### 生产部署为何不用 `pnpm db:migrate`

生产应使用 `prisma migrate deploy`（项目里容器启动命令已自动执行），不要在生产用交互式的 `migrate dev`。
