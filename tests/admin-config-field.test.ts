/**
 * POST /api/config/field（M12d，docs/specs/12 §2.5）测试：
 * 单字段按路径写回（i18n 对象写 obj[lang]、纯字符串整值替换、数组段按 id/下标匹配）、
 * 写前 schema 校验 + 快照；非法路径/原型污染段/校验失败一律 400 且不落盘。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { load as loadYaml } from 'js-yaml';
import { createAdminServer } from '../admin/server/http.ts';
import { listSnapshots } from '../admin/server/snapshots.ts';
import type { Server } from 'node:http';

let dir: string;
let server: Server;
let base: string;

const SITE = [
  'site:',
  '  title:',
  '    zh: 中文站名',
  '    en: Site Name',
  'profile:',
  '  name: 张三',
  'github:',
  '  username: zhangsan',
  'footer:',
  '  text:',
  '    zh: 由 [OH](https://example.com) 驱动',
  'streaming_blocks:',
  '  - id: welcome',
  '    title:',
  '      zh: 致辞',
  '    content_file: streaming/welcome.md',
  '',
].join('\n');

const RSS = 'display: grouped\nsources:\n  - name: 博客\n    url: https://e.com/f.xml\n    mode: latest\n';

function readSite(): Record<string, unknown> {
  return loadYaml(readFileSync(path.join(dir, 'site.yaml'), 'utf8')) as Record<string, unknown>;
}
function readRss(): Record<string, unknown> {
  return loadYaml(readFileSync(path.join(dir, 'rss.yaml'), 'utf8')) as Record<string, unknown>;
}

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'oh-cfgfield-'));
  writeFileSync(path.join(dir, 'site.yaml'), SITE);
  writeFileSync(path.join(dir, 'rss.yaml'), RSS);
  server = createAdminServer({ dataDir: dir, initialized: false, appJs: '' });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  rmSync(dir, { recursive: true, force: true });
});

async function postField(body: unknown) {
  const res = await fetch(`${base}/api/config/field`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe('POST /api/config/field：正常写回', () => {
  it('多语言对象写 obj[lang]，其余语言不动；落盘前产生快照', async () => {
    const r = await postField({ file: 'site', path: 'site.title', lang: 'en', value: 'New Name' });
    expect(r.status).toBe(200);
    const title = (readSite().site as Record<string, unknown>).title as Record<string, string>;
    expect(title.en).toBe('New Name');
    expect(title.zh).toBe('中文站名');
    expect(listSnapshots(dir, 'site.yaml').length).toBeGreaterThan(0);
  });

  it('纯字符串字段整值替换（不区分语言）', async () => {
    const r = await postField({ file: 'site', path: 'profile.name', lang: 'zh', value: '李四' });
    expect(r.status).toBe(200);
    expect((readSite().profile as Record<string, unknown>).name).toBe('李四');
  });

  it('数组段按元素 id 匹配（streaming_blocks.welcome.title）', async () => {
    const r = await postField({
      file: 'site',
      path: 'streaming_blocks.welcome.title',
      lang: 'zh',
      value: '新致辞',
    });
    expect(r.status).toBe(200);
    const blocks = readSite().streaming_blocks as { id: string; title: Record<string, string> }[];
    expect(blocks[0].title.zh).toBe('新致辞');
  });

  it('rss 文件写回（sources.0.name 数字下标段）', async () => {
    const r = await postField({ file: 'rss', path: 'sources.0.name', value: '新名字' });
    expect(r.status).toBe(200);
    expect((readRss().sources as { name: string }[])[0].name).toBe('新名字');
  });

  it('多语言对象缺 lang 写失败（400）', async () => {
    const r = await postField({ file: 'site', path: 'footer.text', value: 'x' });
    expect(r.status).toBe(400);
    expect(String(r.body.error)).toMatch(/lang/);
  });
});

describe('POST /api/config/field：非法路径与校验失败', () => {
  it('非法 file / 非法段名 / 原型污染段一律 400', async () => {
    expect((await postField({ file: 'evil', path: 'site.title', value: 'x' })).status).toBe(400);
    expect((await postField({ file: 'site', path: 'site.ti tle', value: 'x' })).status).toBe(400);
    expect((await postField({ file: 'site', path: 'site.__proto__', value: 'x' })).status).toBe(400);
    expect((await postField({ file: 'site', path: 'constructor', value: 'x' })).status).toBe(400);
    expect((await postField({ file: 'site', path: '', value: 'x' })).status).toBe(400);
  });

  it('路径不存在 400 且不落盘', async () => {
    const before = readFileSync(path.join(dir, 'site.yaml'), 'utf8');
    const r = await postField({ file: 'site', path: 'site.nope.deep', value: 'x' });
    expect(r.status).toBe(400);
    expect(String(r.body.error)).toMatch(/不存在/);
    expect((await postField({ file: 'site', path: 'streaming_blocks.nope.title', lang: 'zh', value: 'x' })).status).toBe(400);
    expect(readFileSync(path.join(dir, 'site.yaml'), 'utf8')).toBe(before);
  });

  it('value 非字符串 400', async () => {
    expect((await postField({ file: 'site', path: 'profile.name', value: 42 })).status).toBe(400);
  });

  it('schema 校验失败（必填字段清空）400 且文件不变、不留新快照', async () => {
    const before = readFileSync(path.join(dir, 'site.yaml'), 'utf8');
    const snapsBefore = listSnapshots(dir, 'site.yaml').length;
    // profile.name 是纯字符串必填字段（requireField），清空触发 schema 校验失败
    const r = await postField({ file: 'site', path: 'profile.name', value: '' });
    expect(r.status).toBe(400);
    expect(String(r.body.error)).toMatch(/profile\.name/);
    expect(readFileSync(path.join(dir, 'site.yaml'), 'utf8')).toBe(before);
    expect(listSnapshots(dir, 'site.yaml')).toHaveLength(snapsBefore);
  });
});
