/**
 * docs/全ボス.html の BOSSES_DATA を bosses.json の内容で更新するスクリプト
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..');
const BOSSES_JSON = path.join(ROOT, 'src', 'game', 'assets', 'data', 'bosses.json');
const DOCS_HTML = path.join(ROOT, 'docs', '全ボス.html');

const bossesData = JSON.parse(fs.readFileSync(BOSSES_JSON, 'utf-8'));
const html = fs.readFileSync(DOCS_HTML, 'utf-8');

// HTMLの中にある const BOSSES_DATA = [...]; を置き換え
const newDataStr = `const BOSSES_DATA = ${JSON.stringify(bossesData, null, 2)};`;

const updated = html.replace(
  /const BOSSES_DATA\s*=\s*\[[\s\S]*?\];/,
  newDataStr,
);

if (updated === html) {
  console.log('警告: BOSSES_DATA の置換パターンが見つかりませんでした。');
  process.exit(1);
}

fs.writeFileSync(DOCS_HTML, updated, 'utf-8');
console.log('docs/全ボス.html を更新しました。');
