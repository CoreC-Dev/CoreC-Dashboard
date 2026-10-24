#!/usr/bin/env node
// custom-lint.mjs —— 自定义品味 linter
// 检查：文件大小上限（防 God 组件/文件）、生产代码无 console.log、统一 @/ 别名导入。
// 已知超标文件作为显式豁免（登记时写明理由并钉版尺寸）；新超标即失败。
// 当前豁免表为空；新文件超 500 行需拆分，或在此登记（含理由与尺寸钉版）。
// 用法：node scripts/custom-lint.mjs   退出码 0=通过 1=失败

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const src = resolve(root, 'src')

const MAX_LINES = 500

// 已登记豁免：超标文件须写明理由并钉版尺寸；文件拆分达标后从本表删除以收紧门禁。
// 当前豁免表为空：新文件超 500 行必须拆分，或在此登记含理由与尺寸钉版的豁免。
const SIZE_EXEMPTIONS = []
const exemptSet = new Set(SIZE_EXEMPTIONS.map((e) => e.file))

// --- 递归收集源文件 ---
function walk(dir, acc = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) walk(resolve(dir, e.name), acc)
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.(test|spec)\.(ts|tsx)$/.test(e.name)) {
      acc.push(resolve(dir, e.name))
    }
  }
  return acc
}
// 含测试文件的全量收集（用于导入风格检查）
function walkAll(dir, acc = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) walkAll(resolve(dir, e.name), acc)
    else if (/\.(ts|tsx)$/.test(e.name)) acc.push(resolve(dir, e.name))
  }
  return acc
}
const files = walk(src)
const allFiles = walkAll(src)

const errors = []
const usedExemptions = new Set()

for (const f of files) {
  const rel = relative(src, f).replace(/\\/g, '/')
  if (rel.startsWith('test/')) continue
  const text = readFileSync(f, 'utf8')
  const lines = text.split('\n').length

  // 1. 文件大小
  if (lines > MAX_LINES) {
    if (exemptSet.has(rel)) {
      usedExemptions.add(rel)
    } else {
      errors.push(
        `${rel} ${lines} 行 > ${MAX_LINES}（God 文件；拆分为更小模块或在 SIZE_EXEMPTIONS 登记）`,
      )
    }
  }

  // 2. 生产代码无 console.log（console.warn/error 允许）
  if (!/\.(test|spec)\./.test(rel)) {
    const logMatches = text.match(/console\.log\s*\(/g)
    if (logMatches) {
      errors.push(
        `${rel} 含 ${logMatches.length} 处 console.log（生产代码禁用；用 console.warn/error 或移除）`,
      )
    }
  }
}

// 3. 统一 @/ 别名导入：禁止相对导入（from './' / from '../'）
const RELATIVE_IMPORT_RE = /\bfrom\s+['"](\.\.?\/[^'"]+)['"]/g
for (const f of allFiles) {
  const rel = relative(src, f).replace(/\\/g, '/')
  if (rel.startsWith('test/')) continue
  const text = readFileSync(f, 'utf8')
  RELATIVE_IMPORT_RE.lastIndex = 0
  const matches = text.match(RELATIVE_IMPORT_RE)
  if (matches) {
    errors.push(`${rel} 含 ${matches.length} 处相对导入（统一用 @/ 别名）`)
  }
}

// --- 报告 ---
const unusedExemptions = SIZE_EXEMPTIONS.filter((e) => !usedExemptions.has(e.file))

if (errors.length === 0) {
  console.log(`✅ custom-lint 通过：无超标文件、无 console.log。`)
  if (usedExemptions.size > 0) {
    console.log(`   已登记大小豁免（拆分后移除）：${usedExemptions.size} 个文件`)
  }
  if (unusedExemptions.length > 0) {
    console.log(`   ℹ️  豁免已修复可移除：${unusedExemptions.map((e) => e.file).join(', ')}`)
  }
  process.exit(0)
} else {
  console.error(`❌ custom-lint 失败（${errors.length} 项）：`)
  for (const e of errors) console.error(`  - ${e}`)
  process.exit(1)
}
