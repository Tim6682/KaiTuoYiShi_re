// 原版存档包（KaiTuoYiShi 主仓库导出的 ktysave v2）导入兼容回归。
//
// 背景：KaiTuoYiShi_re 与原版 KaiTuoYiShi 的存档包格式同源（packageVersion 2 / format ktysave），
// 但两侧代码库独立演进。本回归固定「原版结构 → 新版解析 → 新版归一化」整条链路，
// 防止未来改动 savePackage / 各模型归一化时无意破坏对原版存档的兼容。
//
// 策略：按原版导出器字节布局现场构造一份最小 store 模式 zip（不依赖大型二进制 fixture），
// 交由 services/savePackage 的 parseSaveTreePackage 解析，再跑读档路径使用的归一化函数。
// 另含负向用例：篡改 manifest.app 必须被拒。

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const tempDir = path.join(root, '.tmp-original-save-regression');
const esbuildBin = path.join(root, 'node_modules', 'esbuild', 'bin', 'esbuild');

function assert(condition, message) {
  if (!condition) throw new Error(`断言失败：${message}`);
}

// ---------- 最小 store 模式 zip 构造（与原版导出器的布局一致） ----------

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

function buildStoreZip(entries) {
  const encoder = new TextEncoder();
  const { time, date } = dosDateTime(new Date());
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const [name, value] of entries) {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(typeof value === 'string' ? value : JSON.stringify(value, null, 2));
    const crc = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0, true);
    lv.setUint16(8, 0, true); // store
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    localParts.push(local);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centralParts.push(central);
    offset += local.length;
  }
  const centralOffset = offset;
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, centralOffset, true);
  const total = [...localParts, ...centralParts, eocd].reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const part of [...localParts, ...centralParts, eocd]) {
    out.set(part, cursor);
    cursor += part.length;
  }
  return out;
}

// ---------- 原版格式 fixture（模拟 tim-turn-1 存档的形状） ----------

function buildOriginalStyleEntries() {
  const now = Date.now();
  const saveJson = {
    type: 'manual',
    timestamp: now,
    turnCount: 1,
    旅人: {
      姓名: '旅人', 别名: '', 性别: '女', 年龄: 18, 生日: '', 身高: '', 身份: '开拓者',
      外貌: '', 性格: '', 背景: '', 专长知识: [], 头像: '', 图像档案: {},
      属性: {}, 主命途: '开拓', 命途列表: [{ 命途ID: 'hunting', 觉醒回合: 1 }],
      能力: ['剑术'], 背包: [], 战技列表: [],
    },
    世界: {
      当前时段: { 名称: '白昼' }, 已访问时段: [], 纪年法: '星历', 开拓天数: 1,
      当前日期: '星历7148/01/01', 当前时间: '08:00', 当前地点: '黑塔空间站', 当前区域ID: 'herta_space_station',
      当前天气: '晴', 全局事件: [], 活跃人物: [], 氛围变化: '', 剧情模式: '主线',
      起航之地ID: 'herta_space_station', 原著主角: '星', 自定义开局: '', 开局档案: { 地点: '黑塔空间站' },
    },
    chatHistory: [{
      id: 'msg_original_1', role: 'user', content: '[系统] 开启第 0 回合',
      timestamp: now, turnId: 'turn_original_1', gameTime: '1', preTurnSnapshot: {},
    }],
    gameSettings: { wordCountTarget: 1200, enableStreaming: true, devMode: false },
    apiSettings: { activeConfigId: null, configs: [] },
    theme: 'deepspace',
    saveTree: { rootId: 'save_root_original', nodeId: 'save_node_original', branchName: '原版节点', createdAt: now },
    id: 1,
  };
  const storyWeaving = {
    系列列表: [{
      id: 'story_canon_original_fixture', 标题: '原版系列', 作品名: '原版作品',
      来源类型: 'canon', 来源智库条目ID: [], 章节列表: [{ id: 'ch1', 序号: 1, 标题: '第一章', 内容: '正文', 字数: 2 }],
      分段列表: [{
        id: 'seg1', 组号: 1, 标题: '分段 1', 章节范围: '第1章', 章节标题: ['第一章'], 是否开局组: true,
        起始章序号: 1, 结束章序号: 1, 启用注入: true, 原文内容: '正文', 字数: 2,
        原文摘要: '摘要', 本段概括: '概括', 时间线起点: '', 时间线终点: '',
        开局已成立事实: [], 前段延续事实: [], 本段结束状态: [], 给后续参考: [],
        原著硬约束: [], 可提前铺垫: [], 登场角色: ['三月七'], 涉及地点: ['黑塔空间站'], 涉及派系: [],
        角色档案: [], 势力档案: [], 地图地点档案: [], 关键事件: [], 时间线: [], 角色推进: [],
        处理状态: '已完成', 运行状态: '当前', updatedAt: now,
      }],
      每段章数: 1, 激活注入: true, 当前分段组号: 1, 当前阶段概括: '', 核心角色摘要: [],
      核心角色: ['三月七'], 涉及地点索引: ['黑塔空间站'], 涉及派系索引: [], createdAt: now, updatedAt: now,
    }],
    当前系列ID: 'story_canon_original_fixture',
    当前进度: { 当前系列ID: 'story_canon_original_fixture', 当前分段ID: 'seg1', 当前分段组号: 1, 推进状态: '推进中', 已完成摘要: [], 当前待解问题: [], 切换说明: [], 历史归档: [], updatedAt: now },
  };
  const systemFiles = {
    'systems/memory.json': { 即时记忆: [], 短期记忆: [], 中期记忆: [], 长期记忆: [], 失败草稿: [] },
    'systems/yiting.json': { 回忆档案: [] },
    'systems/zhiku-runtime.json': { 自制资料契约版本: 3, 自制资料下一个序号: 1, 目录版本: 'v3:original', 目录修订: 1, 条目: [] },
    'systems/phone.json': { contacts: [], chats: [], messageSeeds: [], unreadTotal: 0, wallpapers: {} },
    'systems/npc.json': [],
    'systems/album.json': { assets: [], entries: [], tasks: [] },
    'systems/news.json': [],
    'systems/plot.json': [],
    'systems/story-weaving.json': storyWeaving,
    'systems/variable-batches.json': [],
    'systems/queue-tasks.json': [{ id: 'q1', title: '主剧情', subtitle: '', turn: 1, timestamp: now, status: 'done', detail: '', cancellable: false }],
    'tree/node-delta.json': {
      nodeId: 'save_node_original', rootId: 'save_root_original', saveId: 1, type: 'manual',
      timestamp: now, turnCount: 1, baseMode: 'checkpoint', chatFromIndex: 0, chatTail: [],
      assetIds: [], counters: {}, contentHash: 'deadbeef', createdAt: now,
    },
  };
  const fileNames = ['manifest.json', 'save.json', ...Object.keys(systemFiles)];
  const manifest = {
    app: 'KaiTuoYiShi', kind: 'save-package', packageVersion: 2, exportedAt: new Date(now).toISOString(),
    travelerName: '旅人', turnCount: 1, timestamp: now, format: 'ktysave',
    privacy: { apiKeysRemoved: true }, files: fileNames,
  };
  return [['manifest.json', manifest], ['save.json', saveJson], ...Object.entries(systemFiles)];
}

// ---------- 检查入口（由 esbuild 打包后执行） ----------

function writeEntry(zipPath) {
  const entry = `
import { readFileSync } from 'node:fs';
import { parseSaveTreePackage } from '@/services/savePackage';
import { 归一化世界状态 } from '@/models/world';
import { 创建空角色, 确保命途列表 } from '@/models/character';
import { 归一化忆庭系统 } from '@/models/yiting';
import { 归一化手机系统 } from '@/models/phone';
import { 归一化NPC记录列表 } from '@/models/npc';
import { 归一化相册系统 } from '@/models/imageGeneration';
import { 归一化新闻列表 } from '@/models/news';
import { 归一化剧情编织系统 } from '@/models/storyWeaving';
import { compactChatHistoryForLongSession, compactVariableBatchHistory } from '@/utils/longSessionRetention';
import { linkVariableBatchesToChatHistory } from '@/utils/variableBatchIdentity';

function assert(condition, message) { if (!condition) throw new Error('断言失败：' + message); }

async function main() {
  const zipPath = process.argv[2];
  const buf = readFileSync(zipPath);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

  // 1. 原版包解析
  const saves = await parseSaveTreePackage(ab);
  assert(Array.isArray(saves) && saves.length === 1, '应解析出 1 个节点');
  const save = saves[0];

  // 2. 导入门禁要求的全部必要字段
  for (const [name, ok] of Object.entries({
    旅人: Boolean(save.旅人),
    世界: Boolean(save.世界),
    chatHistory: Array.isArray(save.chatHistory),
    gameSettings: Boolean(save.gameSettings),
    apiSettings: Boolean(save.apiSettings),
    theme: Boolean(save.theme),
    记忆: Boolean(save.记忆),
    忆庭: Boolean(save.忆庭),
    智库: Boolean(save.智库),
    手机: Boolean(save.手机),
    剧情编织: Boolean(save.剧情编织),
    queueTasks: Array.isArray(save.queueTasks),
  })) assert(ok, '必要字段缺失：' + name);

  // 3. 读档路径归一化（applySaveToState 使用的同一批函数）
  const chat = compactChatHistoryForLongSession(save.chatHistory);
  assert(chat.length === 1, 'chatHistory 归一化后应保留 1 条');
  assert(归一化世界状态(save.世界).当前地点 === '黑塔空间站', '世界归一化');
  assert(确保命途列表({ ...创建空角色(), ...save.旅人 }, '').姓名 === '旅人', '旅人归一化');
  assert(归一化忆庭系统(save.忆庭).回忆档案.length === 0, '忆庭归一化');
  assert(归一化手机系统(save.手机).unreadTotal === 0, '手机归一化');
  assert(Array.isArray(归一化NPC记录列表(save.NPC, 1)), 'NPC 归一化');
  assert(Array.isArray(归一化相册系统(save.相册).assets), '相册归一化');
  assert(Array.isArray(归一化新闻列表(save.新闻)), '新闻归一化');
  const normalizedWeaving = 归一化剧情编织系统(save.剧情编织);
  assert(normalizedWeaving.系列列表.length === 1, '剧情编织应保留 1 个系列');
  assert(normalizedWeaving.系列列表[0].分段列表[0].运行状态 === '当前', '剧情编织运行状态保留');
  const batches = compactVariableBatchHistory(save.variableBatches);
  assert(Array.isArray(linkVariableBatchesToChatHistory(batches, chat)), '变量批次链接');

  console.log('ORIGINAL_SAVE_IMPORT_OK');
}

main().catch((err) => { console.error(err && err.message ? err.message : err); process.exit(1); });
`;
  fs.writeFileSync(path.join(tempDir, 'entry.ts'), entry, 'utf8');
}

function runBundledEntry(zipPath) {
  writeEntry(zipPath);
  const bundlePath = path.join(tempDir, 'entry.cjs');
  const build = spawnSync(process.execPath, [
    esbuildBin,
    path.join(tempDir, 'entry.ts'),
    '--bundle', '--platform=node', '--format=cjs',
    `--alias:@=${root}`,
    `--outfile=${bundlePath}`,
    '--log-level=error',
  ], { cwd: root, encoding: 'utf8' });
  if (build.status !== 0) throw new Error(`esbuild 打包失败：${build.stderr || build.stdout}`);
  const run = spawnSync(process.execPath, [bundlePath, zipPath], { cwd: root, encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`归一化链路失败：${run.stdout || run.stderr}`);
  assert(run.stdout.includes('ORIGINAL_SAVE_IMPORT_OK'), '正向用例未输出完成标记');
  return run.stdout;
}

// ---------- 主流程 ----------

function main() {
  fs.rmSync(tempDir, { recursive: true, force: true });
  fs.mkdirSync(tempDir, { recursive: true });

  // 正向：原版格式完整解析 + 归一化
  const zipPath = path.join(tempDir, 'original-save.ktysave.zip');
  fs.writeFileSync(zipPath, buildStoreZip(buildOriginalStyleEntries()));
  runBundledEntry(zipPath);
  console.log('PASS 原版 ktysave v2 包解析 + 读档归一化链路');

  // 负向：manifest.app 被篡改时必须拒绝
  const tamperedEntries = buildOriginalStyleEntries().map(([name, value]) => (
    name === 'manifest.json' ? [name, { ...value, app: 'OtherGame' }] : [name, value]
  ));
  const tamperedPath = path.join(tempDir, 'tampered.ktysave.zip');
  fs.writeFileSync(tamperedPath, buildStoreZip(tamperedEntries));
  // entry.cjs 顶层即 main()，篡改包应让它 exit 1；以子进程方式验证退出码。
  writeEntry(tamperedPath);
  const bundlePath = path.join(tempDir, 'entry.cjs');
  const build2 = spawnSync(process.execPath, [
    esbuildBin,
    path.join(tempDir, 'entry.ts'),
    '--bundle', '--platform=node', '--format=cjs',
    `--alias:@=${root}`,
    `--outfile=${bundlePath}`,
    '--log-level=error',
  ], { cwd: root, encoding: 'utf8' });
  if (build2.status !== 0) throw new Error(`esbuild 打包失败：${build2.stderr || build2.stdout}`);
  const run = spawnSync(process.execPath, [bundlePath, tamperedPath], { cwd: root, encoding: 'utf8' });
  assert(run.status !== 0, '篡改 manifest.app 的包必须被拒绝');
  assert(!run.stdout.includes('ORIGINAL_SAVE_IMPORT_OK'), '篡改包不得输出完成标记');
  console.log('PASS 非开拓轶事清单被正确拒绝');

  console.log('\n原版存档导入兼容回归：全部通过');
}

main();
