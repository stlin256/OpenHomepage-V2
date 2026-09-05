// e2e 冒烟专用静态服务：固定 127.0.0.1:4173 直出 dist/。
// 复用 scripts/serve.ts 的 createStaticServer（防穿越/MIME/缓存头均已单测覆盖），
// 不引入 astro preview（CI 上曾有 webServer 探测超时的不确定性）。
import { createStaticServer } from '../scripts/serve.ts';

const server = createStaticServer({ secure: false, port: 4173, warnings: [] });
server.listen(4173, '127.0.0.1', () => {
  console.log('e2e static server: http://127.0.0.1:4173/');
});
const shutdown = () => server.close(() => process.exit(0));
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
