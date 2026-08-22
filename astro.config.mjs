import { defineConfig } from 'astro/config';

// 站点 URL 占位，部署前替换为真实域名
export default defineConfig({
  output: 'static',
  site: 'https://example.com',
});
