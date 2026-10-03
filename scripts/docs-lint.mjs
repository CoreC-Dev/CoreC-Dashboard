#!/usr/bin/env node
// docs-lint.mjs — 文档防腐 linter（阶段 2 建立，阶段 3 接入 CI）
// 校验：docs/index.md 链接可解析 + AGENTS.md 必填节 + 行数上限 + 索引完备性
// 用法：node scripts/docs-lint.mjs   退出码 0=通过 1=失败

import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
let errors = [];

function read(p) {
  return readFileSync(resolve(root, p), 'utf8');
}

function checkFile(p) {
  if (!existsSync(resolve(root, p))) errors.push(`缺失文件: ${p}`);
}

// 1. 解析 markdown 链接并校验存在性（相对路径）
function checkLinks(mdFile) {
  if (!existsSync(resolve(root, mdFile))) { errors.push(`缺失索引: ${mdFile}`); return; }
  const text = read(mdFile);
  const base = dirname(mdFile);
  const linkRe = /\[([^\]]+)\]\(([^)]+)\)/g;
  let m;
  while ((m = linkRe.exec(text)) !== null) {
    let target = m[2];
    if (target.startsWith('http')) continue;          // 外链不校验
    if (target.startsWith('#')) continue;             // 锚点不校验
    target = target.split('#')[0];                    // 去锚点
    if (!target) continue;
    const abs = normalize(resolve(root, base, target));
    if (!existsSync(abs)) errors.push(`死链(${mdFile}): [${m[1]}](${m[2]})`);
  }
}

// 2. 必填节校验
function checkSections(file, sections) {
  if (!existsSync(resolve(root, file))) { errors.push(`缺失: ${file}`); return; }
  const text = read(file);
  for (const s of sections) {
    if (!text.includes(s)) errors.push(`${file} 缺必填节: "${s}"`);
  }
}

// 3. AGENTS.md 行数上限
function checkLineCount(file, max) {
  if (!existsSync(resolve(root, file))) return;
  const lines = read(file).split('\n').length;
  if (lines > max) errors.push(`${file} 行数 ${lines} > ${max}`);
}

// --- 执行 ---
checkFile('AGENTS.md');
checkFile('ARCHITECTURE.md');
checkFile('docs/index.md');
checkFile('docs/QUALITY_SCORE.md');
checkFile('docs/CI.md');
checkFile('docs/exec-plans/tech-debt-tracker.md');
checkFile('docs/exec-plans/completed/harness-2026-10-03.md');
checkFile('docs/exec-plans/completed/harness-migration-2026-10-03.md');
checkFile('docs/design-docs/core-beliefs.md');
checkFile('docs/design-docs/architecture-decisions.md');

checkLinks('docs/index.md');
checkLinks('docs/design-docs/index.md');
checkLinks('AGENTS.md');

checkSections('AGENTS.md', ['## 这是什么项目', '## 硬性约束', '## 目录地图', '## 常用命令', '## 工作方式']);
checkSections('ARCHITECTURE.md', ['## 技术栈', '## 领域地图', '## 分层与依赖方向', '## 已验证的健康不变量']);
checkSections('docs/QUALITY_SCORE.md', ['## 按业务域', '## 按架构层', '## 目标与差距']);

checkLineCount('AGENTS.md', 200);

// 4. docs/ 下 .md（除 .scratch）应被 index.md 提及
import { readdirSync } from 'node:fs';
function walk(dir, acc = []) {
  for (const e of readdirSync(resolve(root, dir), { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) { if (!p.includes('.scratch')) walk(p, acc); }
    else if (e.name.endsWith('.md')) acc.push(p);
  }
  return acc;
}
const allDocs = walk('docs').filter(p => !p.includes('.scratch') && p !== 'docs/index.md');
const indexText = existsSync(resolve(root, 'docs/index.md')) ? read('docs/index.md') : '';
for (const d of allDocs) {
  // 提及形式可能是 d 或 ../d 或去掉 docs/ 前缀
  const short = d.replace(/^docs\//, '');
  if (!indexText.includes(d) && !indexText.includes(short) && !indexText.includes(`docs/${short}`)) {
    errors.push(`docs/index.md 未索引: ${d}`);
  }
}

// --- 报告 ---
if (errors.length === 0) {
  console.log('✅ docs-lint 通过：链接可解析、必填节齐全、索引完备、AGENTS.md 行数达标。');
  process.exit(0);
} else {
  console.error(`❌ docs-lint 失败（${errors.length} 项）：`);
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
