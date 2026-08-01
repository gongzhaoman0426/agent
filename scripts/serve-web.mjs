/**
 * 生产前端静态服务（无需 Nginx）：
 * - 托管 apps/web/dist
 * - 把 /api 反代到 API（默认 127.0.0.1:3003）
 *
 * 环境变量：
 *   WEB_PORT           前端端口，默认 5180
 *   API_PROXY_TARGET   API 地址，默认 http://127.0.0.1:3003
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '../apps/web/dist');
const WEB_PORT = Number(process.env.WEB_PORT) || 5180;
const API_TARGET = new URL(
  process.env.API_PROXY_TARGET || 'http://127.0.0.1:3003',
);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
}

function proxyApi(req, res) {
  const headers = { ...req.headers, host: API_TARGET.host };
  const upstream = http.request(
    {
      protocol: API_TARGET.protocol,
      hostname: API_TARGET.hostname,
      port: API_TARGET.port || (API_TARGET.protocol === 'https:' ? 443 : 80),
      method: req.method,
      path: req.url,
      headers,
    },
    (up) => {
      res.writeHead(up.statusCode || 502, up.headers);
      up.pipe(res);
    },
  );
  upstream.on('error', (err) => {
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`API 反代失败: ${err.message}`);
  });
  req.pipe(upstream);
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  const safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(DIST, safePath === '/' ? 'index.html' : safePath);

  if (!filePath.startsWith(DIST)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (!err && stat.isFile()) {
      sendFile(res, filePath);
      return;
    }
    // SPA fallback
    const index = path.join(DIST, 'index.html');
    fs.stat(index, (indexErr) => {
      if (indexErr) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('前端未构建：请先执行 pnpm build');
        return;
      }
      sendFile(res, index);
    });
  });
}

if (!fs.existsSync(DIST)) {
  console.error(`找不到前端产物目录: ${DIST}\n请先执行 pnpm build`);
  process.exit(1);
}

http
  .createServer((req, res) => {
    if ((req.url || '').startsWith('/api')) {
      proxyApi(req, res);
      return;
    }
    serveStatic(req, res);
  })
  .listen(WEB_PORT, () => {
    console.log(
      `agent-next web 已启动: http://0.0.0.0:${WEB_PORT}  (API → ${API_TARGET.origin})`,
    );
  });
