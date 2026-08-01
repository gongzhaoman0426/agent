/**
 * PM2 进程配置：只托管 API。
 * 前端构建产物由 Nginx（或其它静态服务）托管，并把 /api 反代到本进程。
 *
 * 用法（在仓库根目录）：
 *   pnpm build
 *   pm2 start ecosystem.config.cjs
 */
module.exports = {
  apps: [
    {
      name: 'agent-next-api',
      cwd: './apps/api',
      script: 'dist/main.js',
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
      },
      // 日志：pm2 logs agent-next-api
      time: true,
    },
  ],
};
