#!/usr/bin/env node
// structure-lint.mjs —— 架构结构测试（阶段 3，§4.1 分层依赖方向）
// 扫描 src/ 所有 .ts/.tsx 的 import，断言分层依赖单向，禁止跨层/跨域直连。
// 已知技术债作为显式豁免（含 TD ID + 阶段 4 移除批次）；新违规即失败。
// 用法：node scripts/structure-lint.mjs   退出码 0=通过 1=失败

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname, normalize, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const src = resolve(root, 'src');

// --- 递归收集源文件 ---
function walk(dir, acc = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) walk(resolve(dir, e.name), acc);
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.(test|spec)\.(ts|tsx)$/.test(e.name)) {
      acc.push(resolve(dir, e.name));
    }
  }
  return acc;
}
const files = walk(src);

// --- 层判定 ---
function layerOf(absPath) {
  const rel = relative(src, absPath).replace(/\\/g, '/');
  if (rel.startsWith('test/')) return 'test';
  if (rel === 'main.tsx' || rel === 'App.tsx' || rel === 'vite-env.d.ts') return 'app';
  if (rel.startsWith('types/')) return 'types';
  if (rel.startsWith('lib/')) return 'lib';
  if (rel.startsWith('api/')) return 'api';
  if (rel.startsWith('stores/')) return 'stores';
  if (rel.startsWith('hooks/')) return 'hooks';
  if (rel.startsWith('contexts/')) return 'contexts';
  if (rel.startsWith('components/ui/')) return 'components-ui';
  if (rel.startsWith('components/')) return 'components';
  if (rel.startsWith('i18n/')) return 'i18n';
  const m = rel.match(/^features\/([^/]+)\//);
  if (m) return `features:${m[1]}`;
  if (rel.startsWith('features/')) return 'features';
  return 'other';
}

// --- import 提取 ---
const importRe = /(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]/g;
const dynamicRe = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

function importsOf(absPath) {
  const text = readFileSync(absPath, 'utf8');
  const out = [];
  for (const re of [importRe, dynamicRe]) {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(text)) !== null) out.push(m[1]);
  }
  return out;
}

// --- 解析 import 路径 → 绝对路径（或 null=外部/未解析） ---
function resolveImport(importer, spec) {
  if (spec.startsWith('@/')) {
    return tryResolve(resolve(src, spec.slice(2)));
  }
  if (spec.startsWith('.') || spec.startsWith('/')) {
    return tryResolve(resolve(dirname(importer), spec));
  }
  return null; // 外部包
}
function tryResolve(base) {
  for (const ext of ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx']) {
    const p = base + ext;
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  return null;
}

// --- 依赖规则：importer 层 → 禁止的 importee 层集合 ---
const FORBIDDEN = {
  types: ['lib', 'stores', 'api', 'hooks', 'contexts', 'components', 'components-ui', 'features', 'i18n'],
  lib: ['stores', 'api', 'hooks', 'contexts', 'components', 'components-ui', 'features', 'i18n'],
  api: ['contexts', 'components', 'components-ui', 'features'],
  stores: ['hooks', 'contexts', 'components', 'components-ui', 'features'],
  hooks: ['components', 'components-ui', 'features'],
  contexts: ['components', 'components-ui', 'features'],
  'components-ui': ['hooks', 'stores', 'features', 'api', 'contexts'],
  components: ['features'],
};

function isForbidden(importerLayer, importeeLayer) {
  // 跨 feature 直连
  if (importerLayer.startsWith('features:') && importeeLayer.startsWith('features:')) {
    return importerLayer !== importeeLayer;
  }
  const banned = FORBIDDEN[importerLayer];
  if (!banned) return false;
  // features:X 禁止 importee 'features'（无域前缀，兜底）
  if (importerLayer.startsWith('features:') && importeeLayer === 'features') return true;
  return banned.includes(importeeLayer);
}

// --- 已登记豁免（已知技术债，阶段 4 移除） ---
// 每条：importer 子串 + importee 子串 + TD ID
const EXEMPTIONS = [];

function isExempt(importerRel, importeeRel) {
  return EXEMPTIONS.find((e) =>
    importerRel.includes(e.importer) && importeeRel.includes(e.importee));
}

// --- 执行 ---
const violations = [];
const usedExemptions = new Set();

for (const importer of files) {
  const importerLayer = layerOf(importer);
  if (importerLayer === 'test' || importerLayer === 'app' || importerLayer === 'other') continue;
  for (const spec of importsOf(importer)) {
    const importee = resolveImport(importer, spec);
    if (!importee) continue;
    const importeeLayer = layerOf(importee);
    if (importeeLayer === 'test' || importeeLayer === 'app' || importeeLayer === 'other') continue;
    if (!isForbidden(importerLayer, importeeLayer)) continue;
    const importerRel = relative(src, importer).replace(/\\/g, '/');
    const importeeRel = relative(src, importee).replace(/\\/g, '/');
    const ex = isExempt(importerRel, importeeRel);
    if (ex) {
      usedExemptions.add(ex.td);
    } else {
      violations.push({ importerRel, importeeRel, importerLayer, importeeLayer, spec });
    }
  }
}

// --- 报告 ---
const unusedExemptions = EXEMPTIONS.filter((e) => !usedExemptions.has(e.td));

// --- TD-ARCH-011 / TD-DUP-001: detail pages must single-source field metadata
//     from the registry adapter (no local *_FIELDS arrays). ---
const SINGLE_SOURCE_FILES = [
  'features/admin/DriverDetailPage.tsx',
  'features/admin/TransportDetailPage.tsx',
];
const singleSourceViolations = [];
for (const rel of SINGLE_SOURCE_FILES) {
  const abs = resolve(src, rel);
  if (!existsSync(abs)) continue;
  const text = readFileSync(abs, 'utf8');
  if (!/from ['"]@\/lib\/registryAdapter['"]/.test(text)) {
    singleSourceViolations.push(`${rel}: must import @/lib/registryAdapter (single source)`);
  }
  // Local field-metadata arrays are the duplication this TD removes.
  for (const m of text.matchAll(/const\s+(\w*_FIELDS)\s*:\s*readonly\s+\w*EditField\[\]/g)) {
    singleSourceViolations.push(`${rel}: defines local field array ${m[1]} (use registry adapter)`);
  }
}

if (violations.length === 0 && singleSourceViolations.length === 0) {
  console.log(`✅ structure-lint 通过：分层依赖方向合规。`);
  if (usedExemptions.size > 0) {
    console.log(`   已登记豁免（阶段 4 移除）：${[...usedExemptions].sort().join(', ')}`);
  }
  if (unusedExemptions.length > 0) {
    console.log(`   ℹ️  豁免已修复可移除：${unusedExemptions.map((e) => e.td).join(', ')}（从 EXEMPTIONS 删除以收紧门禁）`);
  }
  process.exit(0);
} else {
  console.error(`❌ structure-lint 失败：${violations.length} 处违规分层依赖：`);
  for (const v of violations.slice(0, 30)) {
    console.error(`  - ${v.importerRel} [${v.importerLayer}] → ${v.importeeRel} [${v.importeeLayer}]  (import '${v.spec}')`);
  }
  if (violations.length > 30) console.error(`  ... 还有 ${violations.length - 30} 处`);
  for (const v of singleSourceViolations) {
    console.error(`  - [TD-ARCH-011/DUP-001] ${v}`);
  }
  console.error(`\n修复指引：将共享逻辑下沉到更底层（lib/api/hooks/stores/components），或在 EXEMPTIONS 登记已知技术债（含 TD ID + 批次）。`);
  process.exit(1);
}
