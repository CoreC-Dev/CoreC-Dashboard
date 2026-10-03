#!/usr/bin/env node
// any-ratchet.mjs —— noExplicitAny 二级守卫（阶段 3→4，TD-GATE-004）
// biome.json 已将 noExplicitAny 提为 error（主门禁）。本脚本为冗余二级守卫，
// 准确统计非注释代码中的 explicit any，BASELINE=0；任一新增即失败。
// 用法：node scripts/any-ratchet.mjs   退出码 0=通过 1=失败

import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const src = resolve(root, 'src');
const BASELINE = 0; // biome noExplicitAny=error 已为主门禁；本守卫基线 0

function walk(dir, acc = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) walk(resolve(dir, e.name), acc);
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.(test|spec)\.(ts|tsx)$/.test(e.name)) {
      acc.push(resolve(dir, e.name));
    }
  }
  return acc;
}

let count = 0;
const hits = [];
for (const f of walk(src)) {
  const rel = relative(src, f).replace(/\\/g, '/');
  if (rel.startsWith('test/')) continue;
  const text = readFileSync(f, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*') || trimmed.startsWith('{/*')) continue; // 跳过注释
    if (/\bany\b/.test(line)) {
      count++;
      if (hits.length < 10) hits.push(`${rel}: ${trimmed.slice(0, 80)}`);
    }
  }
}

if (count <= BASELINE) {
  console.log(`✅ any-ratchet 通过：${count} 处 any ≤ 基线 ${BASELINE}（阶段 4/5 清理后下调 BASELINE）`);
  process.exit(0);
} else {
  console.error(`❌ any-ratchet 失败：${count} 处 any > 基线 ${BASELINE}（新增 ${count - BASELINE} 处 explicit any）`);
  console.error('  示例：');
  for (const h of hits) console.error('    - ' + h);
  console.error('  修复：用具体类型替换 any，或下调 BASELINE（仅当有意接受更多 any 时）。');
  process.exit(1);
}
