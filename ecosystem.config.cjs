/**
 * PM2 双进程；对外域名 / HTTPS 交给 Nginx Proxy Manager。
 * - agent-next-api  → :3003
 * - agent-next-web  → :5180（静态前端 + /api 反代）
 * NPM 面板里 Proxy Host 转发到宿主机:5180 即可。
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
      time: true,
    },
    {
      name: 'agent-next-web',
      cwd: './',
      script: 'scripts/serve-web.mjs',
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      env: {
        NODE_ENV: 'production',
        WEB_PORT: 5180,
        API_PROXY_TARGET: 'http://127.0.0.1:3003',
      },
      time: true,
    },
  ],
};
