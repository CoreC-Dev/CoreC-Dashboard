#!/usr/bin/env node
// any-ratchet.mjs —— noExplicitAny 棘轮（阶段 3，TD-GATE-004）
// biome 当前 noExplicitAny=warn（存量 15 处未清）。本脚本锁定基线，新增 any 即失败。
// 阶段 4/5 清理存量后，下调 BASELINE 并最终在 biome.json 提 error。
// 用法：node scripts/any-ratchet.mjs   退出码 0=通过 1=失败

import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const src = resolve(root, 'src');
const BASELINE = 2; // 2026-10-02 基线（非测试、非注释代码中的 explicit any）

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
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue; // 跳过注释
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
