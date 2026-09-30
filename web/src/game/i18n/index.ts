/**
 * i18n(轮 39):文本表 + t() 查询 + 缺键守卫。
 *
 * 迁移策略(2184 处硬编码中文,横切全库 —— 一次改完是妄想):
 *   1. 本轮立基础设施 + 抽掉最高频的"外壳"面(标题/结算/暂停/设置);
 *   2. `baseline.json` 棘轮:硬编码中文串计数**只许降不许升**(有测试咬着),
 *      后续每轮顺手抽一片,直到归零;
 *   3. EN 表允许不全:缺键回落中文再回落键名,**永不显示空白**。
 *
 * 键名规范:`域.名`(menu.start / settings.music / pause.resume),全小写点分。
 * 带参文案用 `{名}` 占位:t('results.kills', { n: 42 })。
 */

export type Locale = 'zh' | 'en';

const zh: Record<string, string> = {
  // ---- 标题/主菜单 ----
  'menu.title': '星陨骑士 · 序章',
  'menu.tagline': '—— 元素连锁 · 符文改装 · 昼夜怪潮 ——',
  'menu.camp': '🏕 进入星陨营地',
  'menu.slot.empty1': '空槽 · 点击切换',
  'menu.slot.empty2': '(会新建一个档)',
  'menu.slot.broken1': '存档损坏/来自更新版本',
  'menu.slot.broken2': '需新版客户端打开',
  'menu.enter': '[Enter / 点击] 进入 · 营地内可换职业/升祭坛/铸装备/选章节出征',
  'menu.slot': '存档槽',
  'menu.back': '[Enter / 点击] 返回营地',
  // ---- 暂停 ----
  'pause.title': '⏸ 暂停',
  'pause.resume': '[Esc] 继续战斗',
  'pause.mute': '[M] 静音开关:{state}',
  'pause.muted': '已静音 🔇',
  'pause.unmuted': '开启 🔊',
  'pause.abandon': '[Backspace] 放弃本局(结算)',
  'pause.touch.resume': '点击屏幕任意处继续',
  'pause.touch.move': '左半屏拖动=移动(自动瞄准)',
  'pause.touch.btns': '右下按钮=普攻/翻滚/技能',
  // ---- 设置 ----
  'settings.title': '⚙ 设置',
  'settings.music': '🎵 音乐',
  'settings.sfx': '🔊 音效',
  'settings.scale': '🔍 界面缩放',
  'settings.shake': '📳 屏震强度',
  'settings.hitstop': '⏱ 顿帧强度',
  'settings.colorblind': '🎨 色盲模式',
  'settings.language': '🌐 语言',
  'settings.binds': '按键绑定(点击后按新键;与他键冲突自动互换;Esc 取消):',
  'settings.bind.waiting': '按任意键…',
  'settings.resetBinds': '恢复默认键位',
  'settings.exportCode': '导出存档码',
  'settings.importCode': '导入存档码',
  'settings.code.copied': '已复制到剪贴板 ✓',
  'settings.code.made': '已生成存档码',
  'settings.code.copyPrompt': '复制你的存档码:',
  'settings.code.pastePrompt': '粘贴存档码(将覆盖当前存档):',
  'settings.code.badChecksum': '存档码不完整(校验失败)',
  'settings.code.badFormat': '存档码格式不对',
  'settings.code.imported': '导入成功 ✓(部分改动重启后生效)',
  'settings.toTitle': '返回标题',
  'settings.close': '✓ 返回',
  // ---- 色盲模式名 ----
  'cb.off': '关',
  'cb.protan': '红弱',
  'cb.deutan': '绿弱',
  'cb.tritan': '蓝黄弱',
};

const en: Record<string, string> = {
  'menu.title': 'Starfall Knights · Prologue',
  'menu.tagline': '— Elemental Chains · Rune Mods · Day-Night Hordes —',
  'menu.camp': '🏕 Enter Starfall Camp',
  'menu.slot.empty1': 'Empty · Click to switch',
  'menu.slot.empty2': '(creates a new save)',
  'menu.slot.broken1': 'Corrupted / newer version',
  'menu.slot.broken2': 'Open with a newer build',
  'menu.enter': '[Enter / Click] Start · In camp: class, altar, forge, chapter',
  'menu.slot': 'Save Slot',
  'menu.back': '[Enter / Click] Back to Camp',
  'pause.title': '⏸ Paused',
  'pause.resume': '[Esc] Resume',
  'pause.mute': '[M] Mute: {state}',
  'pause.muted': 'Muted 🔇',
  'pause.unmuted': 'On 🔊',
  'pause.abandon': '[Backspace] Abandon Run',
  'pause.touch.resume': 'Tap anywhere to resume',
  'pause.touch.move': 'Drag left half = move (auto-aim)',
  'pause.touch.btns': 'Bottom-right = attack / roll / skills',
  'settings.title': '⚙ Settings',
  'settings.music': '🎵 Music',
  'settings.sfx': '🔊 SFX',
  'settings.scale': '🔍 UI Scale',
  'settings.shake': '📳 Screen Shake',
  'settings.hitstop': '⏱ Hitstop',
  'settings.colorblind': '🎨 Colorblind',
  'settings.language': '🌐 Language',
  'settings.binds': 'Key bindings (click, then press a key; conflicts swap; Esc cancels):',
  'settings.bind.waiting': 'Press a key…',
  'settings.resetBinds': 'Reset Bindings',
  'settings.exportCode': 'Export Save Code',
  'settings.importCode': 'Import Save Code',
  'settings.code.copied': 'Copied to clipboard ✓',
  'settings.code.made': 'Save code generated',
  'settings.code.copyPrompt': 'Copy your save code:',
  'settings.code.pastePrompt': 'Paste save code (overwrites current save):',
  'settings.code.badChecksum': 'Save code incomplete (checksum failed)',
  'settings.code.badFormat': 'Invalid save code format',
  'settings.code.imported': 'Imported ✓ (some changes apply after restart)',
  'settings.toTitle': 'To Title',
  'settings.close': '✓ Back',
  'cb.off': 'Off',
  'cb.protan': 'Protan',
  'cb.deutan': 'Deutan',
  'cb.tritan': 'Tritan',
};

const TABLES: Record<Locale, Record<string, string>> = { zh, en };
export const LOCALES: readonly Locale[] = ['zh', 'en'];
export const LOCALE_NAMES: Record<Locale, string> = { zh: '中文', en: 'English' };

let current: Locale = 'zh';

export function setLocale(l: string): void {
  current = (LOCALES as readonly string[]).includes(l) ? (l as Locale) : 'zh';
}
export function getLocale(): Locale {
  return current;
}

/** 运行期发现的缺键(测试/开发期检查;生产不炸只回落) */
export const missingKeys = new Set<string>();

/** 查文案:当前语言 → 中文 → 键名;{x} 占位替换 */
export function t(key: string, vars?: Record<string, string | number>): string {
  let s = TABLES[current][key] ?? zh[key];
  if (s === undefined) {
    missingKeys.add(key);
    s = key;
  }
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}

/** 表访问(测试用:EN 覆盖率统计/键集合对比) */
export const I18N_TABLES = TABLES;
