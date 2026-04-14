#!/usr/bin/env node
/**
 * stats.mjs
 * メカローグ プロジェクト統計情報スクリプト
 *
 * 使用法: node scripts/stats.mjs [--json] [--markdown]
 *   --json     : JSON形式で出力
 *   --markdown : Markdown形式で出力（デフォルト: テキスト表）
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// ---------------------------------------------------------------------------
// 対象ディレクトリ定義
// ---------------------------------------------------------------------------
const TARGETS = [
  { label: 'src/app',                dir: 'src/app',                  exts: ['.ts', '.tsx', '.css'] },
  { label: 'src/game/core',          dir: 'src/game/core',            exts: ['.ts'] },
  { label: 'src/game/systems',       dir: 'src/game/systems',         exts: ['.ts'] },
  { label: 'src/game/ui',            dir: 'src/game/ui',              exts: ['.tsx', '.ts'] },
  { label: 'src/game/assets/data',   dir: 'src/game/assets/data',     exts: ['.json'] },
  { label: 'scripts',                dir: 'scripts',                  exts: ['.ts', '.mjs', '.js'] },
  { label: 'tests',                  dir: 'tests',                    exts: ['.ts', '.js'] },
  { label: 'docs (HTML)',            dir: 'docs',                     exts: ['.html'], recursive: false },
  { label: 'docs (MD)',              dir: 'docs',                     exts: ['.md'],   recursive: true  },
  { label: 'public/sprites (PNG)',   dir: 'public/sprites',           exts: ['.png'] },
];

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------

/**
 * ディレクトリを再帰的にウォークしてファイル一覧を返す
 * @param {string} dir
 * @param {string[]} exts
 * @param {boolean} recursive
 * @returns {{ filePath: string }[]}
 */
function walkDir(dir, exts, recursive = true) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && recursive) {
      results.push(...walkDir(full, exts, recursive));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (exts.includes(ext)) {
        results.push({ filePath: full });
      }
    }
  }
  return results;
}

/**
 * ファイルの行数・バイト数を返す
 * バイナリファイル（PNG等）は行数を 0 にする
 */
function fileStats(filePath) {
  const stat = fs.statSync(filePath);
  const bytes = stat.size;
  const ext = path.extname(filePath).toLowerCase();
  const isBinary = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico'].includes(ext);
  let lines = 0;
  if (!isBinary) {
    const content = fs.readFileSync(filePath, 'utf8');
    lines = content.split('\n').length;
  }
  return { lines, bytes };
}

// ---------------------------------------------------------------------------
// 集計
// ---------------------------------------------------------------------------
const rows = [];
let grandFiles = 0;
let grandLines = 0;
let grandBytes = 0;

for (const target of TARGETS) {
  const absDir = path.join(ROOT, target.dir);
  const recursive = target.recursive !== false;
  const files = walkDir(absDir, target.exts, recursive);

  let totalLines = 0;
  let totalBytes = 0;
  for (const { filePath } of files) {
    const s = fileStats(filePath);
    totalLines += s.lines;
    totalBytes += s.bytes;
  }

  rows.push({
    label: target.label,
    files: files.length,
    lines: totalLines,
    bytes: totalBytes,
  });

  grandFiles += files.length;
  grandLines += totalLines;
  grandBytes += totalBytes;
}

// total row
rows.push({ label: 'TOTAL', files: grandFiles, lines: grandLines, bytes: grandBytes, isTotal: true });

// ---------------------------------------------------------------------------
// 出力フォーマット
// ---------------------------------------------------------------------------

function fmtBytes(b) {
  if (b >= 1024 * 1024) return (b / 1024 / 1024).toFixed(2) + ' MB';
  if (b >= 1024) return (b / 1024).toFixed(1) + ' KB';
  return b + ' B';
}

function fmtNum(n) {
  return n.toLocaleString('en-US');
}

const args = process.argv.slice(2);
const outputJson     = args.includes('--json');
const outputMarkdown = args.includes('--markdown');

if (outputJson) {
  console.log(JSON.stringify({ generated: new Date().toISOString(), rows }, null, 2));

} else if (outputMarkdown) {
  console.log('# Mecha-Rogue Project Statistics\n');
  console.log(`> Generated: ${new Date().toISOString()}\n`);
  console.log('| Directory / Category | Files | Lines | Size |');
  console.log('|---|---:|---:|---:|');
  for (const r of rows) {
    const sep = r.isTotal ? '**' : '';
    console.log(`| ${sep}${r.label}${sep} | ${sep}${fmtNum(r.files)}${sep} | ${sep}${fmtNum(r.lines)}${sep} | ${sep}${fmtBytes(r.bytes)}${sep} |`);
  }

} else {
  // default: plain text table
  const colW = [30, 10, 10, 12];
  const header = ['Directory / Category', 'Files', 'Lines', 'Size'];
  const sep    = colW.map(w => '-'.repeat(w)).join('-+-');

  console.log('\nMecha-Rogue Project Statistics');
  console.log(`Generated: ${new Date().toISOString()}\n`);
  console.log(header.map((h, i) => h.padEnd(colW[i])).join(' | '));
  console.log(sep);

  for (const r of rows) {
    const cols = [
      r.label,
      fmtNum(r.files),
      fmtNum(r.lines),
      fmtBytes(r.bytes),
    ];
    if (r.isTotal) {
      console.log(sep);
    }
    console.log(cols.map((c, i) => (i === 0 ? c.padEnd(colW[i]) : c.padStart(colW[i]))).join(' | '));
  }
  console.log('');
}
