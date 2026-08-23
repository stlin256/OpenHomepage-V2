/**
 * data/ 导出为 zip（编辑器顶栏"导出 data 压缩包"）。
 * 选型：手写 deflate zip（压缩用内置 zlib.deflateRawSync），零新增依赖、离线可用；
 * archiver/adm-zip 会引入额外依赖（archiver 含传递依赖约 1MB），本实现 ~120 行且纯函数可测。
 * 收集范围：data/ 全量递归（含 .snapshots/ 版本快照；.cache 本就不在 data/ 内）。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { deflateRawSync } from 'node:zlib';

export interface ZipEntry {
  /** zip 内路径（POSIX 分隔符，UTF-8） */
  name: string;
  data: Buffer;
}

// ---------- CRC32（IEEE 802.3，查表法） ----------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = (CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)) >>> 0;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// ---------- zip 构建（deflate 方法 8，UTF-8 文件名标记位 0x0800） ----------

/** 固定 DOS 时间戳（1980-01-01）：导出包内容为王，时间戳不参与功能 */
const DOS_TIME = 0;
const DOS_DATE = 0x21;

export function buildZip(entries: ZipEntry[]): Buffer {
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, 'utf8');
    const compressed = deflateRawSync(e.data, { level: 9 });
    const crc = crc32(e.data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // 本地文件头签名
    local.writeUInt16LE(20, 4); // version needed (2.0, deflate)
    local.writeUInt16LE(0x0800, 6); // UTF-8 文件名
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28); // extra 长度
    chunks.push(local, nameBuf, compressed);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); // 中央目录签名
    cd.writeUInt16LE(20, 4); // version made by
    cd.writeUInt16LE(20, 6); // version needed
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(8, 10);
    cd.writeUInt16LE(DOS_TIME, 12);
    cd.writeUInt16LE(DOS_DATE, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(compressed.length, 20);
    cd.writeUInt32LE(e.data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    // 30: extra 长度、32: 注释长度、34: 起始盘号、36: 内部属性、38: 外部属性，全 0
    cd.writeUInt32LE(offset, 42); // 本地头偏移
    central.push(cd, nameBuf);

    offset += 30 + nameBuf.length + compressed.length;
  }

  const cdBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8); // 本盘条目数
  eocd.writeUInt16LE(entries.length, 10); // 总条目数
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16); // 中央目录偏移
  eocd.writeUInt16LE(0, 20); // 注释长度
  return Buffer.concat([...chunks, cdBuf, eocd]);
}

// ---------- data/ 收集 ----------

/** 递归收集 data/ 下全部文件（含 .snapshots），名字用 POSIX 分隔符并按字典序排序 */
export function collectDataEntries(dataDir: string): ZipEntry[] {
  const out: ZipEntry[] = [];
  const walk = (rel: string): void => {
    const abs = rel ? path.join(dataDir, rel) : dataDir;
    for (const name of readdirSync(abs).sort()) {
      const childRel = rel ? `${rel}/${name}` : name;
      const childAbs = path.join(dataDir, childRel);
      const st = statSync(childAbs);
      if (st.isDirectory()) walk(childRel);
      else if (st.isFile()) out.push({ name: childRel, data: readFileSync(childAbs) });
    }
  };
  walk('');
  // 码元序（不用 localeCompare：en 排序规则会忽略前导标点，'.snapshots' 会被排到后面）
  return out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** 导出文件名：openhomepage-data-YYYY-MM-DD.zip */
export function exportZipName(now: Date = new Date()): string {
  return `openhomepage-data-${now.toISOString().slice(0, 10)}.zip`;
}
