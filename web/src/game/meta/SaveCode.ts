import { migrateSave, type SaveData } from './migrations';

/**
 * 存档码(轮 42):把整份存档导出成一串可复制的文本,跨设备/跨浏览器搬家用。
 *
 * 格式:`SFK1.<base64url(UTF-8 JSON)>.<djb2 校验>`
 * - 前缀带版本号:以后格式变了老码还能被识别并给出明确报错(而不是解析炸掉);
 * - 校验和防手抖:聊天软件截断/多复制一个字都会被拦下,绝不导入半份档;
 * - 导入走 migrateSave 全套清洗 —— 存档码和 localStorage 是同一条安检通道,
 *   不存在"码里塞脏数据绕过校验"的后门。
 */

const PREFIX = 'SFK1';

/** djb2:短校验(不防伪造,只防截断/手抖 —— 单机档没有防伪需求) */
function checksum(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** UTF-8 安全的 base64url(存档里有中文) */
function b64encode(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64decode(s: string): string | null {
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/** 导出:任何时候都能成功(存档本身就是合法 JSON) */
export function exportCode(data: SaveData): string {
  const body = b64encode(JSON.stringify(data));
  return `${PREFIX}.${body}.${checksum(body)}`;
}

export type ImportFail = 'format' | 'checksum' | 'json';
export interface ImportResult {
  ok: boolean;
  data?: SaveData;
  fail?: ImportFail;
}

/** 导入:格式/校验/JSON 三道闸,过闸后走 migrateSave 全套清洗 */
export function importCode(code: string): ImportResult {
  const parts = code.trim().split('.');
  if (parts.length !== 3 || parts[0] !== PREFIX || parts[1].length === 0) return { ok: false, fail: 'format' };
  if (checksum(parts[1]) !== parts[2]) return { ok: false, fail: 'checksum' };
  const json = b64decode(parts[1]);
  if (json === null) return { ok: false, fail: 'json' };
  try {
    const raw = JSON.parse(json) as unknown;
    return { ok: true, data: migrateSave(raw).data };
  } catch {
    return { ok: false, fail: 'json' };
  }
}
